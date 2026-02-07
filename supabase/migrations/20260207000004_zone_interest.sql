-- Migration: Zone interest tracking
-- Date: 2026-02-07

CREATE TABLE IF NOT EXISTS zone_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, zone_id)
);

ALTER TABLE zone_interest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their zone interest" ON zone_interest;
CREATE POLICY "Users can manage their zone interest"
  ON zone_interest
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

