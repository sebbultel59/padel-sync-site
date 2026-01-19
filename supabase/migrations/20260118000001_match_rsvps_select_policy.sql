-- Migration: Allow group members to read RSVPs for matches in their groups
-- Date: 2026-01-18

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'match_rsvps'
      AND policyname = 'Members can view RSVPs for their group matches'
  ) THEN
    CREATE POLICY "Members can view RSVPs for their group matches"
      ON match_rsvps
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1
          FROM matches m
          JOIN group_members gm ON gm.group_id = m.group_id
          WHERE m.id = match_rsvps.match_id
            AND gm.user_id = auth.uid()
        )
      );
  END IF;
END $$;
