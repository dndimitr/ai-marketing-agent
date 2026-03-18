/*
  # Add per-user chat history support

  1. Changes to Tables
    - `chat_sessions`
      - Add `user_id` column (references auth.users)
      - Add index on `user_id` for performance
    - `user_preferences`
      - Add `user_id` column (references auth.users)
      - Add `save_chat_history` boolean flag (default true)
      - Add index on `user_id` for performance

  2. Security Changes
    - Drop all "Anyone can..." RLS policies (open access)
    - Create user-scoped RLS policies for `chat_sessions`:
      - Users can only SELECT/INSERT/UPDATE/DELETE their own sessions
    - Create user-scoped RLS policies for `chat_messages`:
      - Users can only access messages from their own sessions
    - Create user-scoped RLS policies for `user_preferences`:
      - Users can only SELECT/INSERT/UPDATE/DELETE their own preferences

  3. Important Notes
    - All policies now use `auth.uid()` to ensure data isolation
    - `chat_messages` policies verify ownership through `chat_sessions.user_id`
    - The `save_chat_history` toggle allows users to control chat persistence
*/

-- Chat sessions: scope by user_id
ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- User preferences: scope by user_id + add feature toggle
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS save_chat_history boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Drop old open policies (created in 20260317191236_create_marketing_agent_tables.sql)
DROP POLICY IF EXISTS "Anyone can view chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Anyone can create chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Anyone can update chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Anyone can delete chat sessions" ON chat_sessions;

DROP POLICY IF EXISTS "Anyone can view chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Anyone can create chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Anyone can update chat messages" ON chat_messages;
DROP POLICY IF EXISTS "Anyone can delete chat messages" ON chat_messages;

DROP POLICY IF EXISTS "Anyone can view preferences" ON user_preferences;
DROP POLICY IF EXISTS "Anyone can create preferences" ON user_preferences;
DROP POLICY IF EXISTS "Anyone can update preferences" ON user_preferences;
DROP POLICY IF EXISTS "Anyone can delete preferences" ON user_preferences;

-- chat_sessions RLS
CREATE POLICY "Own chat sessions select" ON chat_sessions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Own chat sessions insert" ON chat_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own chat sessions update" ON chat_sessions
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own chat sessions delete" ON chat_sessions
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- chat_messages RLS (scoped via chat_sessions.user_id)
CREATE POLICY "Own chat messages select" ON chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM chat_sessions cs
      WHERE cs.id = chat_messages.session_id
        AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "Own chat messages insert" ON chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM chat_sessions cs
      WHERE cs.id = chat_messages.session_id
        AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "Own chat messages update" ON chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM chat_sessions cs
      WHERE cs.id = chat_messages.session_id
        AND cs.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM chat_sessions cs
      WHERE cs.id = chat_messages.session_id
        AND cs.user_id = auth.uid()
    )
  );

CREATE POLICY "Own chat messages delete" ON chat_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM chat_sessions cs
      WHERE cs.id = chat_messages.session_id
        AND cs.user_id = auth.uid()
    )
  );

-- user_preferences RLS
CREATE POLICY "Own preferences select" ON user_preferences
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Own preferences insert" ON user_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own preferences update" ON user_preferences
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Own preferences delete" ON user_preferences
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
