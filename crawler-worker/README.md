# Crawler Worker

Self-hosted Playwright crawler for rendered extraction.

## Run locally

1. Install dependencies:
   - `cd crawler-worker && npm install`
2. Set env vars:
   - `PORT=8788`
   - `CRAWLER_SHARED_SECRET=change-me`
3. Start:
   - `npm run dev`

## API

`POST /crawl`

Headers:
- `x-crawler-secret: <CRAWLER_SHARED_SECRET>` (if secret configured)

Body:
```json
{
  "urls": ["https://example.com"],
  "maxPages": 3,
  "includeSocial": true
}
```

Returns:
- `pages[]` (rendered extract)
- `failures[]` (per-url reasons)
- `diagnostics`

