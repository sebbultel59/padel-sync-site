# Instructions pour corriger les vues avec SECURITY DEFINER

## 📋 Vue d'ensemble

Il reste **10 vues** à corriger qui ne sont pas définies dans les migrations :
- `v_slot_ready`
- `v_slot_dispo`
- `v_ready_60`
- `v_ready_90`
- `v_match_candidates`
- `v_slots_ready_4_no_match`
- `v_matches_extended`
- `v_slots_hot_3_no_match`
- `v_match_participants`
- `club_memberships`

## 🔧 Étapes pour corriger

### Étape 1 : Récupérer les définitions des vues

1. Ouvrez le **Dashboard Supabase** → **SQL Editor**
2. Ouvrez le fichier : `supabase/migrations/get_view_definitions.sql`
3. Exécutez le script
4. **Copiez toutes les définitions** obtenues (une par vue)

### Étape 2 : Compléter la migration

1. Ouvrez le fichier : `supabase/migrations/20250104000001_recreate_security_definer_views.sql`
2. Pour chaque vue, remplacez le commentaire `-- TODO: Remplacer par la définition réelle` par :
   ```sql
   DROP VIEW IF EXISTS [nom_vue] CASCADE;
   CREATE VIEW [nom_vue] AS
   [définition copiée depuis l'étape 1];
   ```

### Étape 3 : Exécuter la migration

1. Dans le **SQL Editor** de Supabase
2. Ouvrez `supabase/migrations/20250104000001_recreate_security_definer_views.sql`
3. Exécutez la migration complétée

### Étape 4 : Vérifier

1. Exécutez le script de vérification : `supabase/migrations/verify_security_fixes.sql`
2. Relancez le linter Supabase : `supabase db lint` ou via le Dashboard
3. Vérifiez que toutes les erreurs "security_definer_view" ont disparu

## 📝 Exemple de transformation

**Avant (dans get_view_definitions.sql) :**
```sql
SELECT pg_get_viewdef('v_slot_ready'::regclass, true);
-- Résultat: SELECT ... FROM ... WHERE ...
```

**Après (dans la migration) :**
```sql
DROP VIEW IF EXISTS v_slot_ready CASCADE;
CREATE VIEW v_slot_ready AS
SELECT ... FROM ... WHERE ...;
```

## ⚠️ Notes importantes

1. **Ordre des dépendances** : Si une vue dépend d'une autre, recréez d'abord la vue dépendante
2. **CASCADE** : Le `CASCADE` supprimera automatiquement les dépendances, mais elles seront recréées ensuite
3. **Backup** : Assurez-vous d'avoir un backup avant d'exécuter la migration
4. **Test** : Testez que l'application fonctionne toujours après la migration

## 🚀 Alternative : Script automatique

Si vous préférez, je peux créer un script qui génère automatiquement la migration complète. Dites-moi si vous voulez que je le fasse !

