import { createClient } from '@supabase/supabase-js';

type Role = 'user' | 'model';
type Provider = 'gemini' | 'openai' | 'claude';

interface Message {
  role: Role;
  content: string;
}

interface RequestBody {
  provider: Provider;
  skillMarkdown: string;
  history: Message[];
  message: string;
}

function buildSystemInstruction(skillMarkdown: string): string {
  return `
ROLE
You are a senior marketing strategist and practitioner.
You must strictly follow the SKILL GUIDELINES provided below.
If general knowledge conflicts with the SKILL GUIDELINES, the SKILL GUIDELINES ALWAYS take priority.

SKILL GUIDELINES (SOURCE OF TRUTH)
${skillMarkdown}

ANSWER STYLE
- Always be concrete, actionable, and prioritized.
- Use short sections, bullets, or numbered playbooks.
- Whenever possible, give specific examples (headlines, CTAs, structures, copy variants, test ideas).
- Clearly state assumptions if you must guess, but still give a recommendation.

BEHAVIOR
- If the user is unclear, ask 1–2 focused clarification questions while still giving a useful first recommendation.
`.trim();
}

function trimHistory(history: Message[]): Message[] {
  const MAX_HISTORY = 16;
  return history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
}

async function callProvider(
  provider: Provider,
  apiKey: string,
  skillMarkdown: string,
  history: Message[],
  message: string,
): Promise<string> {
  const systemInstruction = buildSystemInstruction(skillMarkdown);
  const trimmed = trimHistory(history);

  if (provider === 'openai') {
    const openAiMessages = [
      { role: 'system', content: systemInstruction },
      ...trimmed.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: message },
    ];

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: openAiMessages,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI error: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  }

  if (provider === 'claude') {
    const claudeMessages = [
      {
        role: 'user',
        content: [{ type: 'text', text: `SYSTEM INSTRUCTION:\n${systemInstruction}` }],
      },
      ...trimmed.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: [{ type: 'text', text: m.content }],
      })),
      {
        role: 'user',
        content: [{ type: 'text', text: message }],
      },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: claudeMessages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Claude error: ${res.status} ${await res.text()}`);
    }

    const json = await res.json();
    const textPart = json.content?.find((p: any) => p.type === 'text');
    return textPart?.text ?? '';
  }

  // Gemini (default)
  const geminiHistory = trimmed.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: systemInstruction }] },
          ...geminiHistory,
          { role: 'user', parts: [{ text: message }] },
        ],
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini error: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const text =
    json.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join(' ') ?? '';
  return text;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { provider, skillMarkdown, history, message } =
      (await req.json()) as RequestBody;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceKey) {
      console.error('Missing Supabase env vars in function');
      return new Response('Missing Supabase configuration', { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: keyRow, error } = await supabase
      .from('ai_api_keys')
      .select('api_key')
      .eq('provider', provider)
      .single();

    if (error || !keyRow) {
      console.error('Missing API key row', error);
      return new Response('Missing API key', { status: 500 });
    }

    const text = await callProvider(
      provider,
      keyRow.api_key,
      skillMarkdown,
      history,
      message,
    );

    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('call_ai error', err);
    return new Response('Internal error', { status: 500 });
  }
});

