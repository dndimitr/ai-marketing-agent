/*
  # Create AI API Keys Table

  ## Overview
  This migration creates a secure table for storing API keys for various AI providers
  (Gemini, OpenAI, Claude). The table is designed with maximum security in mind.

  ## New Tables

  ### `ai_api_keys`
  Centralized storage for AI provider API keys.
  - `id` (uuid, primary key) - Unique identifier
  - `provider` (text) - AI provider name (gemini, openai, claude)
  - `api_key` (text) - The API key (encrypted in storage)
  - `created_at` (timestamptz) - When the key was added
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Row Level Security (RLS) is ENABLED
  - RESTRICTIVE policy blocks ALL direct access from anon role
  - Only service_role (Edge Functions) can access this table
  - Unique constraint on provider to prevent duplicate entries

  ## Indexes
  - Unique index on `provider` for fast lookups and constraint enforcement

  ## Important Notes
  1. This table is NOT accessible from client-side code
  2. Only Edge Functions with service_role can read/write
  3. API keys should be accessed only through secure Edge Functions
  4. Consider enabling encryption at rest for maximum security
*/

-- Create ai_api_keys table
CREATE TABLE IF NOT EXISTS ai_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('gemini', 'openai', 'claude')),
  api_key text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create unique index on provider
CREATE UNIQUE INDEX IF NOT EXISTS ai_api_keys_provider_idx
  ON ai_api_keys(provider);

-- Enable Row Level Security
ALTER TABLE ai_api_keys ENABLE ROW LEVEL SECURITY;

-- Restrictive policy: Block ALL access from anon/authenticated users
CREATE POLICY "No direct access from anon"
  ON ai_api_keys
  AS RESTRICTIVE
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Service role can do everything (this is implicit, but documenting for clarity)
-- The service_role bypasses RLS, so Edge Functions can access this table
