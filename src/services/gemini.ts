import { AIProvider, Message } from "../types";

function trimHistory(history: Message[]): Message[] {
  const MAX_HISTORY = 16;
  return history.length > MAX_HISTORY ? history.slice(-MAX_HISTORY) : history;
}

export async function chatWithSkill(
  skillMarkdown: string,
  history: Message[],
  message: string,
  provider: AIProvider
) {
  const trimmedHistory = trimHistory(history);

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/call_ai`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY!,
      },
      body: JSON.stringify({
        provider,
        skillMarkdown,
        history: trimmedHistory,
        message,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`call_ai error: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  return json.text as string;
}
