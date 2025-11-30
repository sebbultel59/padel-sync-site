-- Script SQL à exécuter dans Supabase Dashboard → SQL Editor
-- Crée le bucket club-assets pour les images d'événements
-- Date: 2025-01-XX

-- 1. Créer le bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('club-assets', 'club-assets', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 2. Supprimer les politiques existantes (pour éviter les doublons)
DROP POLICY IF EXISTS "Public can read club assets" ON storage.objects;
DROP POLICY IF EXISTS "Club managers can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Club managers can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Club managers can delete assets" ON storage.objects;

-- 3. Permettre à tous de lire les assets (puisque le bucket est public)
CREATE POLICY "Public can read club assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'club-assets');

-- 4. Permettre aux club_managers d'uploader des assets
CREATE POLICY "Club managers can upload assets"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'club-assets'
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

-- 5. Permettre aux club_managers de mettre à jour leurs assets
CREATE POLICY "Club managers can update assets"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'club-assets'
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
  bucket_id = 'club-assets'
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

-- 6. Permettre aux club_managers de supprimer leurs assets
CREATE POLICY "Club managers can delete assets"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'club-assets'
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

-- Vérification
SELECT 
  'Bucket club-assets créé avec succès!' as message,
  id,
  name,
  public
FROM storage.buckets
WHERE id = 'club-assets';

