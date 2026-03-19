import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from 'https://esm.sh/@google/genai';

type Provider = 'gemini' | 'openai' | 'claude';

interface RequestBody {
  provider: Provider;
  skill_path: string;
  skillMarkdown: string;
}

type Lang = 'bg';

const LANG: Lang = 'bg';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-supabase-api-version, accept, origin, x-requested-with',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  } as const;
}

function buildTranslatePrompt(skillMarkdown: string): { system: string; user: string } {
  const system = `
You are a professional translator and editor.
Task: translate the given Markdown to Bulgarian.
Rules:
- Preserve the original Markdown structure: headings, paragraphs, inline formatting, code blocks, and lists.
- Do NOT add explanations or commentary.
- Do NOT include labels like "Translation" or "SKILL GUIDELINES".
- Return ONLY the translated Markdown content.`;

  const user = `Translate this Markdown:\n\n${skillMarkdown}`;
  return { system: system.trim(), user };
}

async function translateWithOpenAI(apiKey: string, skillMarkdown: string): Promise<string> {
  const { system, user } = buildTranslatePrompt(skillMarkdown);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? '';
}

async function translateWithClaude(apiKey: string, skillMarkdown: string): Promise<string> {
  const { system, user } = buildTranslatePrompt(skillMarkdown);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 2048,
      system,
      messages: [
        { role: 'user', content: [{ type: 'text', text: user }] },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Claude error: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const textPart = json.content?.find((p: any) => p.type === 'text');
  return textPart?.text ?? '';
}

async function translateWithGemini(apiKey: string, skillMarkdown: string): Promise<string> {
  const { system, user } = buildTranslatePrompt(skillMarkdown);

  // Try faster model first, fallback to known-working model.
  const candidates = ['gemini-1.5-flash', 'gemini-3.1-pro-preview'];
  const ai = new GoogleGenAI({ apiKey });

  for (const model of candidates) {
    try {
      const chat = ai.chats.create({
        model,
        config: {
          systemInstruction: system,
        },
        history: [],
      });

      const result = await chat.sendMessage({ message: user });
      const text = result.text ?? '';
      if (text.trim().length > 0) return text;
    } catch (err) {
      // Try next model.
    }
  }

  throw new Error('Gemini translation failed for all candidate models');
}

async function getProviderKey(provider: Provider): Promise<string> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') || '';
  const openAiKey = Deno.env.get('OPENAI_API_KEY') || '';
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') || '';

  if (provider === 'gemini') return geminiKey;
  if (provider === 'openai') return openAiKey;
  return anthropicKey;
}

async function translate(provider: Provider, skillMarkdown: string): Promise<string> {
  const apiKey = await getProviderKey(provider);
  if (!apiKey) {
    const missing =
      provider === 'gemini'
        ? 'GEMINI_API_KEY'
        : provider === 'openai'
          ? 'OPENAI_API_KEY'
          : 'ANTHROPIC_API_KEY';
    throw new Error(`Missing ${missing}`);
  }

  if (provider === 'openai') return translateWithOpenAI(apiKey, skillMarkdown);
  if (provider === 'claude') return translateWithClaude(apiKey, skillMarkdown);
  return translateWithGemini(apiKey, skillMarkdown);
}

Deno.serve(async (req) => {
  const headers = corsHeaders();

  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers });
    }
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

    const { provider, skill_path, skillMarkdown } = (await req.json()) as RequestBody;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!supabaseUrl || !serviceKey) {
      return new Response('Missing Supabase configuration', { status: 500, headers });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Check cache
    const cache = await supabase
      .from('skill_translations')
      .select('translated_markdown')
      .eq('provider', provider)
      .eq('lang', LANG)
      .eq('skill_path', skill_path)
      .maybeSingle();

    if (!cache.error && cache.data?.translated_markdown) {
      return new Response(JSON.stringify({ text: cache.data.translated_markdown }), {
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }

    // 2) Translate
    const translated = await translate(provider, skillMarkdown);

    // 3) Upsert
    await supabase.from('skill_translations').upsert(
      {
        provider,
        lang: LANG,
        skill_path,
        translated_markdown: translated,
      },
      { onConflict: 'provider,lang,skill_path' }
    );

    return new Response(JSON.stringify({ text: translated }), {
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('translate_skill error:', message);
    return new Response(message, { status: 500, headers });
  }
});

