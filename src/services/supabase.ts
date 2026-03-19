import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface ChatSession {
  id: string;
  skill_name: string;
  skill_path: string;
  skill_category?: string;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'model';
  content: string;
  created_at: string;
}

export interface UserPreferences {
  id: string;
  favorite_skills: string[];
  last_visited_skill?: string;
  ai_provider?: string;
  theme: string;
  save_chat_history: boolean;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillAnalytics {
  id: string;
  skill_name: string;
  skill_path: string;
  view_count: number;
  chat_count: number;
  last_accessed: string;
  created_at: string;
}

export async function createChatSession(
  skillName: string,
  skillPath: string,
  skillCategory?: string
): Promise<ChatSession | null> {
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch {
    return null;
  }
  const user = userId ? { id: userId } : null;
  if (!user) return null;

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({
      skill_name: skillName,
      skill_path: skillPath,
      skill_category: skillCategory,
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating chat session:', error);
    return null;
  }

  return data;
}

export async function saveChatMessage(
  sessionId: string,
  role: 'user' | 'model',
  content: string
): Promise<ChatMessage | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving chat message:', error);
    return null;
  }

  await supabase
    .from('chat_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId);

  return data;
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching chat messages:', error);
    return [];
  }

  return data || [];
}

export async function getRecentSessions(limit = 10): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent sessions:', error);
    return [];
  }

  return data || [];
}

export async function trackSkillView(skillName: string, skillPath: string): Promise<void> {
  const { data: existing } = await supabase
    .from('skill_analytics')
    .select('*')
    .eq('skill_path', skillPath)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('skill_analytics')
      .update({
        view_count: existing.view_count + 1,
        last_accessed: new Date().toISOString(),
      })
      .eq('skill_path', skillPath);
  } else {
    await supabase
      .from('skill_analytics')
      .insert({
        skill_name: skillName,
        skill_path: skillPath,
        view_count: 1,
        chat_count: 0,
      });
  }
}

export async function trackChatCreated(skillPath: string): Promise<void> {
  const { data: existing } = await supabase
    .from('skill_analytics')
    .select('*')
    .eq('skill_path', skillPath)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('skill_analytics')
      .update({
        chat_count: existing.chat_count + 1,
      })
      .eq('skill_path', skillPath);
  }
}

export async function getPopularSkills(limit = 5): Promise<SkillAnalytics[]> {
  const { data, error } = await supabase
    .from('skill_analytics')
    .select('*')
    .order('view_count', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching popular skills:', error);
    return [];
  }

  return data || [];
}

export async function getUserPreferences(): Promise<UserPreferences | null> {
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch {
    return null;
  }

  const user = userId ? { id: userId } : null;
  if (!user) return null;

  const { data, error } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user preferences:', error);
    return null;
  }

  if (!data) {
    const { data: newPrefs, error: insertError } = await supabase
      .from('user_preferences')
      .insert({
        user_id: user.id,
        favorite_skills: [],
        theme: 'light',
        ai_provider: 'gemini',
        save_chat_history: true
      })
      .select()
      .single();
    if (insertError) {
      console.error('Error creating user preferences:', insertError);
      return null;
    }
    return newPrefs;
  }

  return data;
}

export async function updateUserPreferences(
  preferences: Partial<UserPreferences>
): Promise<void> {
  const current = await getUserPreferences();
  if (!current) return;

  await supabase
    .from('user_preferences')
    .update({
      ...preferences,
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id);
}

export async function toggleFavoriteSkill(skillPath: string): Promise<void> {
  const prefs = await getUserPreferences();
  if (!prefs) return;

  const favorites = prefs.favorite_skills || [];
  const index = favorites.indexOf(skillPath);

  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(skillPath);
  }

  await updateUserPreferences({ favorite_skills: favorites });
}
