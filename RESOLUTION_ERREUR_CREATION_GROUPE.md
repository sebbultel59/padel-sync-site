# Résolution des erreurs de création de groupe

## Problèmes identifiés

1. **Erreur 42702** : "column reference \"club_id\" is ambiguous"
   - L'ambiguïté vient de la fonction `rpc_create_group` où `club_id` peut faire référence à plusieurs choses

2. **Erreur 42501** : "permission denied for table groups"
   - Les politiques RLS ne permettent pas l'insertion, même via les fonctions RPC

## Solution

### Ordre d'exécution des migrations

Exécutez ces migrations dans l'ordre dans **Supabase Dashboard** → **SQL Editor** :

1. **`fix_rpc_create_group_ambiguous_club_id.sql`** (en premier)
   - Corrige l'ambiguïté sur `club_id` dans la fonction RPC
   - Utilise des alias explicites pour toutes les colonnes
   - Préfixe toutes les références de colonnes avec l'alias de table

2. **`verify_and_fix_groups_permissions.sql`** (ensuite)
   - Vérifie et corrige les politiques RLS pour `groups`
   - S'assure que la fonction `rpc_create_group` a les bonnes permissions
   - Vérifie que la fonction utilise `SECURITY DEFINER`

### Vérification après exécution

Après avoir exécuté les migrations, vérifiez que tout fonctionne :

```sql
-- Vérifier que la fonction existe et utilise SECURITY DEFINER
SELECT 
  p.proname AS function_name,
  p.prosecdef AS is_security_definer,
  n.nspname AS schema
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'rpc_create_group';

-- Vérifier les politiques RLS sur groups
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'groups'
AND cmd = 'INSERT';
```

### Test

Après avoir exécuté les migrations :
1. Redémarrez l'application
2. Essayez de créer un groupe en tant que club_manager
3. L'erreur devrait disparaître

## Détails techniques

### Correction de l'ambiguïté club_id

Le problème venait du fait que PostgreSQL ne savait pas si `club_id` faisait référence à :
- La colonne `club_id` de la table `groups`
- La colonne `club_id` de la table `profiles`
- Le paramètre `p_club_id` de la fonction
- La variable `v_final_club_id`

**Solution** : Préfixer toutes les références avec l'alias de table (`p.club_id`, `g.club_id`) et utiliser des alias explicites dans les SELECT.

### Correction des permissions

Même avec `SECURITY DEFINER`, si RLS est activé et qu'il n'y a pas de politique INSERT, l'insertion peut être bloquée. La migration crée une politique INSERT permissive qui permet aux fonctions RPC de créer des groupes.

## Après correction

Une fois les migrations exécutées, vous devriez pouvoir :
- ✅ Créer des groupes en tant que club_manager
- ✅ Créer des groupes en tant que player (privés uniquement)
- ✅ Créer des groupes en tant que super_admin (tous types)

