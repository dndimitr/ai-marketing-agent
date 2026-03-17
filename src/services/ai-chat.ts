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

  const functionUrl = `${supabaseUrl}/functions/v1/ai-chat`;

  const { data: { session } } = await supabase.auth.getSession();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || anonKey}`,
    },
    body: JSON.stringify({
      provider,
      skillContent,
      messages,
      userMessage,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get AI response');
  }

  const data = await response.json();
  return data.response;
}
