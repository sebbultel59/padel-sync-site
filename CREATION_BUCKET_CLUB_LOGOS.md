# Création du bucket "club-logos" dans Supabase Storage

## Pourquoi

Le bucket `club-logos` est nécessaire pour stocker les logos des clubs uploadés depuis l'application.

## Comment créer le bucket

1. **Ouvrez le Dashboard Supabase** : https://supabase.com/dashboard
2. **Sélectionnez votre projet**
3. **Allez dans Storage** (menu de gauche)
4. **Cliquez sur "New bucket"**
5. **Configurez le bucket** :
   - **Name** : `club-logos`
   - **Public bucket** : ✅ Activé (pour que les logos soient accessibles publiquement)
   - **File size limit** : 5 MB (ou plus selon vos besoins)
   - **Allowed MIME types** : `image/jpeg, image/png, image/webp` (ou laissez vide pour tous)

6. **Cliquez sur "Create bucket"**

## Configuration des politiques RLS (optionnel)

Si vous voulez restreindre l'accès, vous pouvez créer des politiques RLS :

```sql
-- Permettre à tous de lire les logos (puisque le bucket est public)
-- Les politiques sont généralement gérées automatiquement pour les buckets publics

-- Si vous voulez restreindre l'upload aux club_managers uniquement :
CREATE POLICY "Club managers can upload logos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'club-logos'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'club_manager'
  )
);
```

## Vérification

Après avoir créé le bucket, testez l'upload d'un logo depuis l'application :
1. Allez dans la page de gestion du club
2. Cliquez sur "Choisir un logo"
3. Sélectionnez une image depuis la galerie
4. Le logo devrait être uploadé et affiché

## Alternative : Utiliser un bucket existant

Si vous préférez utiliser un bucket existant (comme `avatars` ou `group-avatars`), modifiez le code dans `app/clubs/[id]/manage.js` :

```javascript
// Remplacer "club-logos" par le nom de votre bucket
.from("avatars")  // ou "group-avatars"
```

