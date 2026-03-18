import { supabase } from './supabase';
import { AIProvider } from '../types';

export async function translateSkill(
  provider: AIProvider,
  skillPath: string,
  skillMarkdown: string
): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error('Missing Supabase URL');
  if (!anonKey) throw new Error('Missing Supabase anon key');

  const functionUrl = `${supabaseUrl}/functions/v1/translate_skill`;

  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${session?.access_token || anonKey}`,
    },
    body: JSON.stringify({
      provider,
      skill_path: skillPath,
      skillMarkdown,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Failed to translate skill');
  }

  const json = await response.json();
  return json.text as string;
}

