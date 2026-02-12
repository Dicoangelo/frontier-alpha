-- Frontier Alpha Social Profiles & Follows Schema
-- Migration: 20260209_social_profiles
-- Created: 2026-02-09
-- US-015: User profiles and follow system

-- ============================================================================
-- PROFILES
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  bio TEXT,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT unique_profile_per_user UNIQUE (user_id)
);

-- Indexes for profile queries
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON frontier_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON frontier_profiles(display_name) WHERE display_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_is_public ON frontier_profiles(is_public) WHERE is_public = true;

-- ============================================================================
-- FOLLOWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS frontier_follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Users cannot follow themselves
  CONSTRAINT no_self_follow CHECK (follower_id != following_id),
  -- Unique follow relationship
  CONSTRAINT unique_follow UNIQUE (follower_id, following_id)
);

-- Indexes for follow queries
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON frontier_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON frontier_follows(following_id);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE frontier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE frontier_follows ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can read public profiles
CREATE POLICY "Anyone can view public profiles" ON frontier_profiles
  FOR SELECT USING (is_public = true);

-- Profiles: Users can always view their own profile
CREATE POLICY "Users can view own profile" ON frontier_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Profiles: Users can create their own profile
CREATE POLICY "Users can create own profile" ON frontier_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Profiles: Users can update their own profile
CREATE POLICY "Users can update own profile" ON frontier_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- Profiles: Users can delete their own profile
CREATE POLICY "Users can delete own profile" ON frontier_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- Follows: Users can view who they follow and who follows them
CREATE POLICY "Users can view own follows" ON frontier_follows
  FOR SELECT USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Follows: Users can create follows (follow someone)
CREATE POLICY "Users can follow others" ON frontier_follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

-- Follows: Users can delete their own follows (unfollow)
CREATE POLICY "Users can unfollow" ON frontier_follows
  FOR DELETE USING (auth.uid() = follower_id);

-- ============================================================================
-- SERVICE ROLE BYPASS
-- ============================================================================

CREATE POLICY "Service role full access to profiles" ON frontier_profiles
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access to follows" ON frontier_follows
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON frontier_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
