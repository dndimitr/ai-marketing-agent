/*
  # Create AI API Keys table

  Stores provider API keys centrally in Supabase. Access is restricted to
  service-role (Edge Functions / backend), not to anon clients.
*/

CREATE TABLE IF NOT EXISTS ai_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('gemini', 'openai', 'claude')),
  api_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_api_keys_provider_idx
  ON ai_api_keys(provider);

ALTER TABLE ai_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access from anon"
  ON ai_api_keys
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

