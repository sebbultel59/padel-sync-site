# Résolution de la récursion infinie RLS - group_members

## Problème

Erreur au lancement :
```
"infinite recursion detected in policy for relation \"group_members\""
```

## Cause

Les politiques RLS (Row Level Security) de la table `group_members` créent une récursion infinie :
- Une politique dit "un utilisateur peut voir les membres d'un groupe s'il est membre"
- Pour vérifier s'il est membre, on doit interroger `group_members`
- Mais pour interroger `group_members`, on doit vérifier la politique RLS
- Qui dit "un utilisateur peut voir les membres s'il est membre"
- → Boucle infinie

## Solution

Utiliser des fonctions `SECURITY DEFINER` qui contournent RLS pour éviter la récursion.

### Migrations à exécuter

**Ordre d'exécution important :**

1. **`fix_group_members_rls_recursion.sql`** (à exécuter en premier)
   - Supprime les anciennes politiques RLS de `group_members`
   - Crée la fonction `is_member_of_group()` avec `SECURITY DEFINER`
   - Crée de nouvelles politiques RLS qui utilisent cette fonction

2. **`fix_groups_rls_for_club_managers.sql`** (peut être exécuté après)
   - Utilise aussi `is_member_of_group()` pour éviter la récursion
   - Met à jour les politiques RLS de `groups`

### Comment exécuter

1. Ouvrez le **Dashboard Supabase** → **SQL Editor**
2. Exécutez `fix_group_members_rls_recursion.sql` en premier
3. Exécutez `fix_groups_rls_for_club_managers.sql` ensuite
4. Redémarrez l'application

### Vérification

Après avoir exécuté les migrations, vérifiez que tout fonctionne :

```sql
-- Vérifier que la fonction existe
SELECT routine_name
FROM information_schema.routines 
WHERE routine_name = 'is_member_of_group';

-- Vérifier les politiques RLS de group_members
SELECT policyname, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'group_members';
```

## Détails techniques

### Fonction `is_member_of_group()`

Cette fonction utilise `SECURITY DEFINER` pour contourner RLS :
- Elle peut lire `group_members` sans être bloquée par les politiques RLS
- Elle évite ainsi la récursion infinie
- Elle est utilisée dans les politiques RLS pour vérifier l'appartenance

### Nouvelles politiques RLS

**Pour `group_members` :**
- `Users can view their own memberships` : Voir ses propres membreships (pas de récursion)
- `Members can view other members of their groups` : Utilise `is_member_of_group()` pour éviter la récursion
- `RPC functions can insert/update/delete members` : Permet aux fonctions RPC de gérer les membres

**Pour `groups` :**
- `Members can view their groups` : Utilise `is_member_of_group()` au lieu d'une sous-requête directe

## Après correction

Une fois les migrations exécutées, l'erreur de récursion devrait disparaître et l'application devrait démarrer normalement.








