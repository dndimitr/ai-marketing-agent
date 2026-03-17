/*
  # Create Marketing Agent Database Schema

  ## Overview
  This migration creates the database schema for the Marketing Agent application,
  which helps users learn and apply marketing skills through AI-powered assistance.

  ## New Tables

  ### 1. `chat_sessions`
  Stores user chat sessions with metadata about the skill being discussed.
  - `id` (uuid, primary key) - Unique identifier for each session
  - `skill_name` (text) - Name of the marketing skill being discussed
  - `skill_path` (text) - GitHub path to the skill content
  - `skill_category` (text) - Category of the skill (e.g., SEO, Content, etc.)
  - `created_at` (timestamptz) - When the session was created
  - `updated_at` (timestamptz) - Last time the session was updated

  ### 2. `chat_messages`
  Stores individual messages within chat sessions.
  - `id` (uuid, primary key) - Unique identifier for each message
  - `session_id` (uuid, foreign key) - Reference to parent chat session
  - `role` (text) - Who sent the message ('user' or 'model')
  - `content` (text) - The message content
  - `created_at` (timestamptz) - When the message was sent

  ### 3. `user_preferences`
  Stores user preferences and favorite skills.
  - `id` (uuid, primary key) - Unique identifier
  - `favorite_skills` (jsonb) - Array of favorite skill paths
  - `last_visited_skill` (text) - Last skill the user visited
  - `theme` (text) - UI theme preference (default: 'light')
  - `created_at` (timestamptz) - When preferences were created
  - `updated_at` (timestamptz) - Last update timestamp

  ### 4. `skill_analytics`
  Tracks usage analytics for skills to understand which are most popular.
  - `id` (uuid, primary key) - Unique identifier
  - `skill_name` (text) - Name of the skill
  - `skill_path` (text) - Path to the skill
  - `view_count` (integer) - Number of times viewed
  - `chat_count` (integer) - Number of chat sessions created
  - `last_accessed` (timestamptz) - Last time this skill was accessed
  - `created_at` (timestamptz) - When the record was created

  ## Security
  - Row Level Security (RLS) is enabled on all tables
  - Public access is allowed for reading analytics (to show popular skills)
  - All other operations are open for now (can be restricted with auth later)

  ## Indexes
  - Index on `session_id` in chat_messages for fast message retrieval
  - Index on `skill_path` in skill_analytics for quick lookups

  ## Important Notes
  1. This schema is designed to work without authentication initially
  2. When authentication is added, RLS policies should be updated
  3. All timestamps use `timestamptz` for timezone awareness
  4. JSONB is used for flexible storage of favorite skills
*/

-- Create chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name text NOT NULL,
  skill_path text NOT NULL,
  skill_category text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'model')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create user_preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  favorite_skills jsonb DEFAULT '[]'::jsonb,
  last_visited_skill text,
  theme text DEFAULT 'light',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create skill_analytics table
CREATE TABLE IF NOT EXISTS skill_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name text NOT NULL,
  skill_path text NOT NULL UNIQUE,
  view_count integer DEFAULT 0,
  chat_count integer DEFAULT 0,
  last_accessed timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_skill_analytics_path ON skill_analytics(skill_path);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for chat_sessions
CREATE POLICY "Anyone can view chat sessions"
  ON chat_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update chat sessions"
  ON chat_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete chat sessions"
  ON chat_sessions FOR DELETE
  USING (true);

-- Create RLS policies for chat_messages
CREATE POLICY "Anyone can view chat messages"
  ON chat_messages FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update chat messages"
  ON chat_messages FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete chat messages"
  ON chat_messages FOR DELETE
  USING (true);

-- Create RLS policies for user_preferences
CREATE POLICY "Anyone can view preferences"
  ON user_preferences FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create preferences"
  ON user_preferences FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update preferences"
  ON user_preferences FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete preferences"
  ON user_preferences FOR DELETE
  USING (true);

-- Create RLS policies for skill_analytics
CREATE POLICY "Anyone can view analytics"
  ON skill_analytics FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create analytics"
  ON skill_analytics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update analytics"
  ON skill_analytics FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can delete analytics"
  ON skill_analytics FOR DELETE
  USING (true);
