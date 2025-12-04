# Application des migrations pour l'agenda des événements

## Problème

Si vous obtenez l'erreur :
```
column club_events.date_start does not exist
```

Cela signifie que la table `club_events` n'a pas encore été créée dans votre base de données Supabase.

## Solution : Exécuter les migrations

### Étape 1 : Créer la table club_events

1. **Ouvrez le Dashboard Supabase** : https://supabase.com/dashboard
2. **Sélectionnez votre projet**
3. **Allez dans SQL Editor** (menu de gauche)
4. **Copiez-collez le contenu** du fichier `APPLY_CLUB_EVENTS_MIGRATION.sql`
5. **Cliquez sur "Run"** (ou appuyez sur Ctrl+Enter / Cmd+Enter)

Vous devriez voir le message : `Table club_events créée avec succès!`

### Étape 2 : Créer le bucket club-assets (pour les images)

1. **Toujours dans SQL Editor**
2. **Copiez-collez le contenu** du fichier `APPLY_CLUB_ASSETS_BUCKET.sql`
3. **Cliquez sur "Run"**

Vous devriez voir le message : `Bucket club-assets créé avec succès!`

### Étape 3 : Vérification

Exécutez cette requête pour vérifier que tout est en place :

```sql
-- Vérifier que la table existe
SELECT 
  table_name,
  column_name,
  data_type
FROM information_schema.columns 
WHERE table_name = 'club_events'
ORDER BY ordinal_position;

-- Vérifier que le bucket existe
SELECT id, name, public
FROM storage.buckets
WHERE id = 'club-assets';
```

## Alternative : Via Supabase CLI

Si vous utilisez Supabase CLI localement :

```bash
# Appliquer toutes les migrations
supabase db push

# Ou appliquer une migration spécifique
supabase migration up create_club_events_table
```

## Test rapide

Après avoir exécuté les migrations, testez dans l'application :

1. **Connectez-vous en tant que club_manager**
2. **Allez dans la Page Club** de votre club
3. **Cliquez sur "Créer" dans la section Agenda**
4. **Créez un événement test**

Si tout fonctionne, vous devriez voir l'événement apparaître dans l'agenda !

## Dépannage

### Erreur : "relation clubs does not exist"
→ La table `clubs` n'existe pas. Exécutez d'abord `create_geo_tables.sql`

### Erreur : "relation profiles does not exist"
→ La table `profiles` n'existe pas. Vérifiez que votre base de données est correctement initialisée.

### Erreur : "permission denied"
→ Vérifiez que vous êtes connecté avec un compte ayant les droits d'administration dans Supabase.

### Le bucket n'apparaît pas dans Storage
→ Allez dans **Storage** → **Buckets** dans le Dashboard Supabase et vérifiez que `club-assets` est listé. Si ce n'est pas le cas, créez-le manuellement :
   - Nom : `club-assets`
   - Public : ✅ Activé
   - File size limit : 5 MB (ou plus)
   - Allowed MIME types : `image/jpeg, image/png, image/webp`





