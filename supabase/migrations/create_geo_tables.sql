-- Migration géo de base

CREATE TABLE IF NOT EXISTS clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  outdoor_pistes INTEGER DEFAULT 0,
  indoor BOOLEAN GENERATED ALWAYS AS (outdoor_pistes = 0) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clubs_location ON clubs(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;

ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS address_home JSONB,
  ADD COLUMN IF NOT EXISTS address_work JSONB;

ALTER TABLE matches 
  ADD COLUMN IF NOT EXISTS club_id UUID REFERENCES clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matches_club_id ON matches(club_id) WHERE club_id IS NOT NULL;


