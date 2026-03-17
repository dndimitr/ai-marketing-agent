import { GoogleGenAI } from "@google/genai";
import { AIProvider, Message } from "../types";

function buildSystemInstruction(skillMarkdown: string, provider: AIProvider): string {
  const base = `
ROLE
You are a senior marketing strategist and practitioner.
You must strictly follow the SKILL GUIDELINES provided below. 
If general knowledge conflicts with the SKILL GUIDELINES, the SKILL GUIDELINES ALWAYS take priority.

SKILL GUIDELINES (SOURCE OF TRUTH)
${skillMarkdown}

TOOLS
- You have access to the 'urlContext' tool. When the user provides a website URL, first fetch and analyze its content (SEO, copy, structure, UX, funnel).
- You have access to 'googleSearch' for real‑time or missing information. Use it when:
  - Data needs to be up to date (benchmarks, trends, platform rules), or
  - You lack enough information from the page and SKILL GUIDELINES.

ANSWER STYLE
- Always be concrete, actionable, and prioritized.
- Use short sections, bullets, or numbered playbooks.
- Whenever possible, give specific examples (headlines, CTAs, structures, copy variants, test ideas).
- Clearly state assumptions if you must guess, but still give a recommendation.

BEHAVIOR
- If the user is unclear, ask 1–2 focused clarification questions while still giving a useful first recommendation.
`.trim();

  if (provider === 'gemini') {
    return `${base}

TOOLS
- You have access to the 'urlContext' tool. When the user provides a website URL, first fetch and analyze its content (SEO, copy, structure, UX, funnel).
- You have access to 'googleSearch' for real‑time or missing information. Use it when:
  - Data needs to be up to date (benchmarks, trends, platform rules), or
  - You lack enough information from the page and SKILL GUIDELINES.

If you need external data, call 'googleSearch' instead of guessing.
`.trim();
  }

  // OpenAI / Claude – no tools wired up, just follow guidelines.
  return `${base}

TOOLS
- You do not have direct browsing tools. If you lack information, explain what extra data you would need from the user.
`.trim();
}

function trimHistory(history: Message[]): Message[] {
  const MAX_HISTORY = 16;
  return history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
}

export async function chatWithSkill(
  skillMarkdown: string,
  history: Message[],
  message: string,
  provider: AIProvider,
  apiKey?: string
) {
  const trimmedHistory = trimHistory(history);
  const systemInstruction = buildSystemInstruction(skillMarkdown, provider);

  if (provider === 'openai') {
    const key = apiKey || import.meta.env.VITE_OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API key is missing.');

    const openAiMessages = [
      { role: 'system', content: systemInstruction },
      ...trimmedHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        messages: openAiMessages,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content ?? '';
  }

  if (provider === 'claude') {
    const key = apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!key) throw new Error('Claude (Anthropic) API key is missing.');

    const claudeMessages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: `SYSTEM INSTRUCTION:\n${systemInstruction}` },
        ],
      },
      ...trimmedHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: [{ type: 'text', text: msg.content }],
      })),
      {
        role: 'user',
        content: [{ type: 'text', text: message }],
      },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: claudeMessages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude error: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    const textPart = json.content?.find((p: any) => p.type === 'text');
    return textPart?.text ?? '';
  }

  // Default: Gemini
  const key = apiKey || process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key is missing.');

  const ai = new GoogleGenAI({ apiKey: key });
  const model = "gemini-3.1-pro-preview";

  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction,
      tools: [
        { urlContext: {} },
        { googleSearch: {} }
      ]
    },
    history: trimmedHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.content }]
    }))
  });

  const result = await chat.sendMessage({ message });
  return result.text;
}
