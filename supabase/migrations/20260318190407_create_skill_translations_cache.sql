/*
  # Skill translations cache

  ## Overview
  This migration creates a cache table for translated SKILL.md contents.
  The UI can show English immediately and then swap in Bulgarian when available.

  ## New Tables
  
  ### `skill_translations`
  Stores cached translations of skill documentation.
  
  **Columns:**
  - `id` (uuid, primary key) - Unique identifier
  - `provider` (text, not null) - AI provider name (gemini, openai, claude)
  - `lang` (text, not null, default: 'bg') - Language code (currently only Bulgarian)
  - `skill_path` (text, not null) - Path to the skill file
  - `translated_markdown` (text, not null) - The translated markdown content
  - `created_at` (timestamptz) - When the translation was first cached
  - `updated_at` (timestamptz) - When the translation was last updated

  ## Indexes
  - Unique composite index on (provider, lang, skill_path) for fast lookups
    and preventing duplicate translations

  ## Security
  - RLS is enabled on the table
  - A restrictive policy blocks all direct access from anonymous clients
  - Edge Functions use the service role key and bypass RLS to manage the cache

  ## Important Notes
  1. This is a cache table - data can be regenerated if lost
  2. Only Edge Functions should write to this table
  3. The unique index ensures one translation per provider/language/skill combination
  4. Currently only Bulgarian (bg) translations are supported
*/

CREATE TABLE IF NOT EXISTS public.skill_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('gemini', 'openai', 'claude')),
  lang text NOT NULL DEFAULT 'bg' CHECK (lang = 'bg'),
  skill_path text NOT NULL,
  translated_markdown text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS skill_translations_provider_lang_skill_path_idx
  ON public.skill_translations(provider, lang, skill_path);

ALTER TABLE public.skill_translations ENABLE ROW LEVEL SECURITY;

-- No direct access from anon clients; Edge Functions use service role and bypass RLS.
CREATE POLICY "No direct access from anon"
  ON public.skill_translations
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);
