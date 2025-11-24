-- Ensure the club-logos bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-logos', 'club-logos', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Allow anyone to read club logos
DROP POLICY IF EXISTS "Public can read club logos" ON storage.objects;
CREATE POLICY "Public can read club logos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'club-logos');

-- Allow club managers & super admins to upload logos
DROP POLICY IF EXISTS "Club managers can upload logos" ON storage.objects;
CREATE POLICY "Club managers can upload logos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'club-logos'
  AND (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('club_manager', 'super_admin')
    )
  )
);

-- Allow updates (needed for upsert)
DROP POLICY IF EXISTS "Club managers can update logos" ON storage.objects;
CREATE POLICY "Club managers can update logos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'club-logos'
  AND (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('club_manager', 'super_admin')
    )
  )
)
WITH CHECK (
  bucket_id = 'club-logos'
  AND (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('club_manager', 'super_admin')
    )
  )
);

-- Allow deleting logos (optional but useful)
DROP POLICY IF EXISTS "Club managers can delete logos" ON storage.objects;
CREATE POLICY "Club managers can delete logos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'club-logos'
  AND (
    auth.role() = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('club_manager', 'super_admin')
    )
  )
);

