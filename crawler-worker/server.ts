import express from 'express';
import { chromium } from 'playwright';

type CrawlRequest = {
  urls: string[];
  maxPages?: number;
  includeSocial?: boolean;
};

type CrawlPage = {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  title: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  canonical: string;
  headings: string[];
  textExcerpt: string;
  links: string[];
  metadataOnly: boolean;
};

type CrawlFailure = {
  url: string;
  reason: string;
};

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 8788);
const SHARED_SECRET = process.env.CRAWLER_SHARED_SECRET || '';
const DEFAULT_MAX_PAGES = 3;
const MAX_PAGES_HARD = 8;

const SOCIAL_HOSTS = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'instagram.com',
  'www.instagram.com',
  'linkedin.com',
  'www.linkedin.com',
  'tiktok.com',
  'www.tiktok.com',
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
]);

function isPrivateHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h === '0.0.0.0' || h === '::1') return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 127;
}

function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (isPrivateHostname(u.hostname)) return null;
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

function canFollowLink(baseHost: string, candidateHost: string, includeSocial: boolean): boolean {
  if (candidateHost === baseHost) return true;
  if (!includeSocial) return false;
  return SOCIAL_HOSTS.has(candidateHost);
}

async function extractPage(url: string, includeSocial: boolean, maxLinks = 12): Promise<CrawlPage> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (compatible; MarketingCrawler/1.0)',
      viewport: { width: 1366, height: 768 },
    });

    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1200);

    const data = await page.evaluate(({ maxLinks }) => {
      const getMeta = (name: string, attr: 'name' | 'property' = 'name'): string => {
        const el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
        return el?.content?.trim() || '';
      };
      const title = (document.querySelector('title')?.textContent || '').trim();
      const metaDescription = getMeta('description', 'name');
      const ogTitle = getMeta('og:title', 'property');
      const ogDescription = getMeta('og:description', 'property');
      const canonical =
        (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href || '';

      const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
        .map((h) => (h.textContent || '').trim())
        .filter(Boolean)
        .slice(0, 20);

      const textPool = Array.from(document.querySelectorAll('p,li,article,main,section h1,section h2'))
        .map((el) => (el.textContent || '').trim())
        .filter((t) => t.length > 20)
        .join('\n');

      const textExcerpt = textPool.slice(0, 5000);

      const links = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter(Boolean)
        .slice(0, maxLinks);

      return {
        title,
        metaDescription,
        ogTitle,
        ogDescription,
        canonical,
        headings,
        textExcerpt,
        links,
      };
    }, { maxLinks });

    const finalUrl = page.url();
    const status = response?.status() ?? 0;
    const metadataOnly =
      data.textExcerpt.trim().length < 80 && data.headings.length === 0 &&
      !!(data.title || data.metaDescription || data.ogTitle || data.ogDescription);

    return {
      requestedUrl: url,
      finalUrl,
      status,
      title: data.title,
      metaDescription: data.metaDescription,
      ogTitle: data.ogTitle,
      ogDescription: data.ogDescription,
      canonical: data.canonical,
      headings: data.headings,
      textExcerpt: data.textExcerpt,
      links: data.links,
      metadataOnly,
    };
  } finally {
    await browser.close();
  }
}

app.post('/crawl', async (req, res) => {
  try {
    if (SHARED_SECRET) {
      const incoming = req.header('x-crawler-secret') || '';
      if (incoming !== SHARED_SECRET) {
        return res.status(401).json({ error: 'unauthorized' });
      }
    }

    const body = req.body as CrawlRequest;
    const includeSocial = !!body.includeSocial;
    const maxPages = Math.max(1, Math.min(Number(body.maxPages || DEFAULT_MAX_PAGES), MAX_PAGES_HARD));
    const seeds = (body.urls || []).map(normalizeUrl).filter(Boolean) as string[];

    if (!seeds.length) {
      return res.status(400).json({ error: 'no_valid_urls' });
    }

    const pages: CrawlPage[] = [];
    const failures: CrawlFailure[] = [];
    const queue = [...seeds];
    const seen = new Set<string>();

    while (queue.length && pages.length < maxPages) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);

      try {
        const page = await extractPage(next, includeSocial);
        pages.push(page);

        const baseHost = new URL(page.finalUrl || next).hostname;
        for (const link of page.links) {
          const normalized = normalizeUrl(link);
          if (!normalized || seen.has(normalized)) continue;
          const linkHost = new URL(normalized).hostname;
          if (!canFollowLink(baseHost, linkHost, includeSocial)) continue;
          queue.push(normalized);
        }
      } catch (error) {
        failures.push({
          url: next,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return res.json({
      pages,
      failures,
      diagnostics: {
        seedCount: seeds.length,
        crawledCount: pages.length,
        failureCount: failures.length,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: 'crawler_internal_error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`crawler-worker listening on ${PORT}`);
});

