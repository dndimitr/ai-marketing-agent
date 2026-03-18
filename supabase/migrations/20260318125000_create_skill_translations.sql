/*
  # Skill translations cache

  Caches translated SKILL.md contents per provider/lang/skill_path so the UI
  can show English immediately and then swap in Bulgarian when available.
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

