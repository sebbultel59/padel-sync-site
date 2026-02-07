-- Migration: Zones + clubs-first
-- Date: 2026-02-07

-- 1) Zones
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  lat_center DOUBLE PRECISION,
  lng_center DOUBLE PRECISION,
  default_radius_km INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zones_region ON zones(region);
CREATE INDEX IF NOT EXISTS idx_zones_active ON zones(is_active) WHERE is_active = true;

-- Seed zones
INSERT INTO zones (region, name, lat_center, lng_center, default_radius_km, is_active)
VALUES
  ('HAUTS-DE-FRANCE', 'NORD – Lille et alentours', 50.6292, 3.0573, 30, true),
  ('HAUTS-DE-FRANCE', 'NORD – Dunkerque · Calais · Boulogne · Audomarois', 51.0344, 2.3773, 45, true),
  ('HAUTS-DE-FRANCE', 'PAS-DE-CALAIS – Arras · Lens · Béthune', 50.2910, 2.7776, 35, false),
  ('HAUTS-DE-FRANCE', 'NORD – Valenciennes · Cambrai', 50.3571, 3.5250, 35, false),
  ('HAUTS-DE-FRANCE', 'SOMME – Amiens et alentours', 49.8941, 2.2958, 35, false),

  ('ÎLE-DE-FRANCE', 'ÎLE-DE-FRANCE – Paris intra-muros', 48.8566, 2.3522, 12, false),
  ('ÎLE-DE-FRANCE', 'ÎLE-DE-FRANCE – Paris Ouest', 48.8790, 2.1900, 12, false),
  ('ÎLE-DE-FRANCE', 'ÎLE-DE-FRANCE – Paris Est', 48.8566, 2.4500, 12, false),
  ('ÎLE-DE-FRANCE', 'ÎLE-DE-FRANCE – Paris Sud', 48.8120, 2.3000, 12, false),
  ('ÎLE-DE-FRANCE', 'ÎLE-DE-FRANCE – Paris Nord', 48.9300, 2.3600, 12, false),

  ('NOUVELLE-AQUITAINE', 'GIRONDE – Bordeaux et métropole', 44.8378, -0.5792, 30, true),
  ('NOUVELLE-AQUITAINE', 'GIRONDE – Bassin d’Arcachon', 44.6613, -1.1720, 45, false),
  ('NOUVELLE-AQUITAINE', 'PYRÉNÉES-ATLANTIQUES – Bayonne · Biarritz', 43.4929, -1.4748, 45, false),
  ('NOUVELLE-AQUITAINE', 'PYRÉNÉES-ATLANTIQUES – Pau · Béarn', 43.2951, -0.3708, 40, false),
  ('NOUVELLE-AQUITAINE', 'CHARENTE-MARITIME – La Rochelle · Rochefort', 46.1591, -1.1520, 45, false),

  ('AUVERGNE–RHÔNE-ALPES', 'RHÔNE – Lyon et métropole', 45.7640, 4.8357, 30, false),
  ('AUVERGNE–RHÔNE-ALPES', 'ISÈRE – Grenoble et alentours', 45.1885, 5.7245, 35, false),
  ('AUVERGNE–RHÔNE-ALPES', 'HAUTE-SAVOIE – Annecy · Chambéry', 45.8992, 6.1294, 45, false),
  ('AUVERGNE–RHÔNE-ALPES', 'LOIRE – Saint-Étienne et alentours', 45.4397, 4.3872, 35, false),
  ('AUVERGNE–RHÔNE-ALPES', 'PUY-DE-DÔME – Clermont-Ferrand et alentours', 45.7772, 3.0870, 35, false),

  ('OCCITANIE', 'HAUTE-GARONNE – Toulouse et métropole', 43.6045, 1.4442, 35, false),
  ('OCCITANIE', 'HÉRAULT – Montpellier et alentours', 43.6119, 3.8772, 35, false),
  ('OCCITANIE', 'GARD – Nîmes · Alès', 43.8367, 4.3601, 35, false),
  ('OCCITANIE', 'PYRÉNÉES-ORIENTALES – Perpignan et alentours', 42.6887, 2.8948, 45, false),

  ('PROVENCE–ALPES–CÔTE D’AZUR', 'BOUCHES-DU-RHÔNE – Aix · Marseille', 43.2965, 5.3698, 40, false),
  ('PROVENCE–ALPES–CÔTE D’AZUR', 'ALPES-MARITIMES – Nice · Antibes · Cannes', 43.7102, 7.2620, 45, false),
  ('PROVENCE–ALPES–CÔTE D’AZUR', 'VAR – Toulon et alentours', 43.1242, 5.9280, 40, false),

  ('GRAND EST', 'BAS-RHIN – Strasbourg et Eurométropole', 48.5734, 7.7521, 35, false),
  ('GRAND EST', 'MOSELLE – Metz · Thionville', 49.1193, 6.1757, 35, false),
  ('GRAND EST', 'MEURTHE-ET-MOSELLE – Nancy et Lorraine', 48.6921, 6.1844, 35, false),
  ('GRAND EST', 'MARNE – Reims et alentours', 49.2583, 4.0317, 35, false),

  ('PAYS DE LA LOIRE', 'LOIRE-ATLANTIQUE – Nantes et alentours', 47.2184, -1.5536, 35, false),
  ('PAYS DE LA LOIRE', 'ILLE-ET-VILAINE – Rennes et alentours', 48.1173, -1.6778, 35, false),
  ('PAYS DE LA LOIRE', 'MAINE-ET-LOIRE – Angers · Cholet', 47.4784, -0.5632, 35, false),

  ('CENTRE–VAL DE LOIRE', 'INDRE-ET-LOIRE – Tours et alentours', 47.3941, 0.6848, 35, false),
  ('CENTRE–VAL DE LOIRE', 'LOIRET – Orléans et alentours', 47.9029, 1.9093, 35, false)
ON CONFLICT (name) DO NOTHING;

-- 2) Zone references
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comfort_radius_km INTEGER;

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_zone_id ON profiles(zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clubs_zone_id ON clubs(zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_zone_id ON matches(zone_id) WHERE zone_id IS NOT NULL;

-- 3) User clubs
CREATE TABLE IF NOT EXISTS user_clubs (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  club_id UUID NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  is_accepted BOOLEAN NOT NULL DEFAULT true,
  is_preferred BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, club_id)
);

CREATE INDEX IF NOT EXISTS idx_user_clubs_user ON user_clubs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clubs_club ON user_clubs(club_id);
CREATE INDEX IF NOT EXISTS idx_user_clubs_accepted ON user_clubs(user_id, is_accepted) WHERE is_accepted = true;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_preferred_club ON user_clubs(user_id) WHERE is_preferred = true;

ALTER TABLE user_clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their clubs" ON user_clubs;
CREATE POLICY "Users can manage their clubs"
  ON user_clubs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read clubs for shared groups" ON user_clubs;
CREATE POLICY "Users can read clubs for shared groups"
  ON user_clubs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM group_members gm_self
      JOIN group_members gm_other
        ON gm_other.group_id = gm_self.group_id
      WHERE gm_self.user_id = auth.uid()
        AND gm_other.user_id = user_clubs.user_id
    )
  );

-- 4) Best-effort assign clubs to nearest zone (if coords are present)
UPDATE clubs c
SET zone_id = (
  SELECT z.id
  FROM zones z
  WHERE z.lat_center IS NOT NULL AND z.lng_center IS NOT NULL
  ORDER BY ((c.lat - z.lat_center) * (c.lat - z.lat_center) + (c.lng - z.lng_center) * (c.lng - z.lng_center))
  LIMIT 1
)
WHERE c.zone_id IS NULL AND c.lat IS NOT NULL AND c.lng IS NOT NULL;
