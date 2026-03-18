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
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info',
  } as const;

  try {
    // Handle CORS preflight explicitly (the browser may send OPTIONS before POST).
    if (req.method === 'OPTIONS') {
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders,
      });
    }

    const { provider, skillMarkdown, history, message } =
      (await req.json()) as RequestBody;

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    const apiKey =
      provider === 'gemini'
        ? geminiKey
        : provider === 'openai'
          ? openAiKey
          : anthropicKey;

    if (!apiKey) {
      const missing =
        provider === 'gemini'
          ? 'GEMINI_API_KEY'
          : provider === 'openai'
            ? 'OPENAI_API_KEY'
            : 'ANTHROPIC_API_KEY';
      return new Response(`Missing ${missing}`, { status: 500, headers: corsHeaders });
    }

    const text = await callProvider(
      provider,
      apiKey,
      skillMarkdown,
      history,
      message,
    );

    return new Response(JSON.stringify({ text }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  } catch (err) {
    console.error('call_ai error', err);
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message, {
      status: 500,
      headers: corsHeaders,
    });
  }
});

