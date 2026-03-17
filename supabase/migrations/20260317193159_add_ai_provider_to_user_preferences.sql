/*
  # Add AI Provider to User Preferences

  ## Overview
  This migration adds an ai_provider column to the user_preferences table
  to allow users to select their preferred AI provider.

  ## Changes
  - Adds `ai_provider` column to `user_preferences` table
  - Default value is 'gemini'
  - Allowed values: gemini, openai, claude

  ## Important Notes
  1. Uses IF NOT EXISTS to prevent errors if column already exists
  2. Sets default to 'gemini' for existing and new users
*/

-- Add ai_provider column to user_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_preferences' AND column_name = 'ai_provider'
  ) THEN
    ALTER TABLE user_preferences
    ADD COLUMN ai_provider text DEFAULT 'gemini'
    CHECK (ai_provider IN ('gemini', 'openai', 'claude'));
  END IF;
END $$;
