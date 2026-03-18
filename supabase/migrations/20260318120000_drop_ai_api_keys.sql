/*
  # Drop AI API Keys table

  The application switched to using Supabase Edge Function Secrets for
  provider API keys instead of a database table.
*/

DROP TABLE IF EXISTS public.ai_api_keys CASCADE;

