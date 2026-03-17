import { Message } from '../types';
import { supabase } from './supabase';

export async function chatWithAI(
  provider: string,
  skillContent: string,
  messages: Message[],
  userMessage: string
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL');
  }

  const functionUrl = `${supabaseUrl}/functions/v1/call_ai`;

  const { data: { session } } = await supabase.auth.getSession();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error('Missing Supabase anon key');

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${session?.access_token || anonKey}`,
    },
    body: JSON.stringify({
      provider,
      skillMarkdown: skillContent,
      history: messages,
      message: userMessage,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to get AI response');
  }

  const data = await response.json();
  return data.text;
}
