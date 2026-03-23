-- Enhance users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS points INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge TEXT DEFAULT 'newcomer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_likes INT DEFAULT 0;

-- Terminals (transport stops/hubs - the map markers)
CREATE TABLE IF NOT EXISTS terminals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL DEFAULT 'Jeep',
  details TEXT,
  schedule JSONB,
  images TEXT[] DEFAULT '{}',
  likes INT DEFAULT 0,
  dislikes INT DEFAULT 0,
  outdated_votes INT DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connections (route segments between terminals)
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  from_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  to_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  geometry JSONB,
  color TEXT DEFAULT '#4A90D9',
  fare NUMERIC,
  duration_secs INT,
  waypoints JSONB DEFAULT '[]',
  budget_level TEXT DEFAULT 'medium',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  likes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Votes (likes/dislikes/outdated tags on terminals and connections)
CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('terminal', 'connection')),
  entity_id UUID NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  vote_type TEXT NOT NULL CHECK (vote_type IN ('like', 'dislike', 'outdated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_type, entity_id, user_id, vote_type)
);

-- Challenges (gamification)
CREATE TABLE IF NOT EXISTS challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  difficulty TEXT DEFAULT 'easy' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  connection_ids UUID[] DEFAULT '{}',
  reward_points INT DEFAULT 10,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  likes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Challenge completions
CREATE TABLE IF NOT EXISTS challenge_completions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  challenge_id UUID REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(challenge_id, user_id)
);
