# 🧪 Guide de test du système de badges

## ✅ Vérifications préalables

### 1. Vérifier que la migration est appliquée

Dans le **Dashboard Supabase** → **SQL Editor**, exécutez :

```sql
-- Vérifier que les tables existent
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('badge_definitions', 'user_badges');

-- Vérifier que les badges sont créés
SELECT code, label, category, is_active 
FROM badge_definitions 
WHERE is_active = true 
ORDER BY category, code
LIMIT 10;
```

**Résultat attendu** : Vous devriez voir les tables et au moins 15 badges actifs.

### 2. Vérifier que les Edge Functions sont déployées

Dans le **Dashboard Supabase** → **Edge Functions**, vérifiez que :
- ✅ `evaluate-badges` est déployée
- ✅ `record-match-result` est déployée

Si elles ne sont pas déployées, exécutez :
```bash
supabase functions deploy evaluate-badges
supabase functions deploy record-match-result
```

## 🎮 Test en conditions réelles

### Étape 1 : Enregistrer un match classé

1. **Ouvrez l'application** Padel Sync
2. **Allez dans l'onglet "Matches"**
3. **Sélectionnez un match confirmé**
4. **Cliquez sur "Enregistrer le résultat"**
5. **Remplissez le formulaire** :
   - Sélectionnez l'équipe gagnante (2 joueurs)
   - Sélectionnez l'équipe perdante (2 joueurs)
   - Entrez le score (au moins 2 sets)
   - Type de match : **Classé** ou **Tournoi**
   - Type de résultat : **Normal**
6. **Validez**

### Étape 2 : Vérifier la notification de badge

Après la validation, vous devriez voir :

1. **L'écran de résumé du match** avec :
   - ✅ Le changement de rating
   - ✅ Le niveau et XP
   - ✅ **Une notification animée en haut** si un badge est débloqué
   - ✅ **Une section "Badges débloqués"** avec les badges

2. **La notification** :
   - Apparaît en haut de l'écran avec une animation
   - Affiche "🎉 Badge débloqué !" et le nom du badge
   - Disparaît automatiquement après 5 secondes
   - Peut être fermée manuellement

### Étape 3 : Vérifier dans le profil

1. **Allez dans l'onglet "Profil"**
2. **Faites défiler** jusqu'à la section "Trophées"
3. **Vérifiez** :
   - ✅ Le compteur "Trophées : X/Y" est mis à jour
   - ✅ Les badges rares s'affichent (si vous en avez)
   - ✅ Les badges récents s'affichent (si vous en avez)
   - ✅ Le bouton "Voir tous" fonctionne

### Étape 4 : Vérifier l'écran "Mes trophées"

1. **Cliquez sur "Voir tous mes trophées"**
2. **Vérifiez** :
   - ✅ Tous les badges sont affichés, groupés par catégorie
   - ✅ Les badges débloqués sont en couleur
   - ✅ Les badges verrouillés sont grisés
   - ✅ Les badges sont triés (débloqués d'abord, puis verrouillés)

## 🔍 Vérifications dans Supabase

### Vérifier les badges débloqués

Dans le **Dashboard Supabase** → **SQL Editor** :

```sql
-- Voir tous les badges débloqués pour un utilisateur
-- Remplacez 'VOTRE_USER_ID' par votre UUID
SELECT 
  ub.unlocked_at,
  bd.code,
  bd.label,
  bd.category,
  ub.source_match_id
FROM user_badges ub
JOIN badge_definitions bd ON ub.badge_id = bd.id
WHERE ub.user_id = 'VOTRE_USER_ID'::uuid
ORDER BY ub.unlocked_at DESC;
```

### Vérifier les logs des Edge Functions

Dans le **Dashboard Supabase** → **Edge Functions** → **Logs** :

1. **Vérifiez les logs de `record-match-result`** :
   - Recherchez : `badge(s) débloqué(s) pour l'utilisateur courant`
   - Vérifiez qu'il n'y a pas d'erreurs

2. **Vérifiez les logs de `evaluate-badges`** :
   - Recherchez : `Badges evaluated for player`
   - Vérifiez qu'il n'y a pas d'erreurs

## 🐛 Dépannage

### Problème : La notification n'apparaît pas

**Causes possibles** :
1. Aucun badge n'a été débloqué (normal si vous avez déjà tous les badges de base)
2. L'Edge Function `evaluate-badges` n'est pas déployée
3. Erreur dans les logs de l'Edge Function

**Solution** :
- Vérifiez les logs des Edge Functions
- Vérifiez que vous avez enregistré un match **classé** ou **tournoi** (pas amical)
- Vérifiez que vous avez rempli les critères pour débloquer un badge

### Problème : Les badges ne s'affichent pas dans le profil

**Causes possibles** :
1. La migration n'a pas été appliquée
2. Erreur dans le hook `usePlayerBadges`

**Solution** :
- Vérifiez que les tables existent (voir étape 1)
- Vérifiez les logs de la console dans l'app
- Rechargez l'application

### Problème : L'Edge Function retourne une erreur

**Causes possibles** :
1. La migration n'a pas été appliquée
2. Les tables n'existent pas
3. Erreur de permissions RLS

**Solution** :
- Vérifiez que la migration `20251203162630_add_player_badges.sql` est appliquée
- Vérifiez les logs de l'Edge Function
- Vérifiez les politiques RLS sur `badge_definitions` et `user_badges`

## 📊 Badges disponibles pour test

Voici quelques badges faciles à débloquer pour tester :

1. **VOLUME_5_MATCHES** : Jouer 5 matchs (tous types)
2. **RANKED_10_MATCHES** : Jouer 10 matchs classés
3. **STREAK_3_WINS** : Gagner 3 matchs d'affilée
4. **SOCIAL_5_PARTNERS** : Jouer avec 5 partenaires différents

## ✅ Checklist de test

- [ ] Migration appliquée
- [ ] Edge Functions déployées
- [ ] Match classé/tournoi enregistré
- [ ] Notification de badge affichée
- [ ] Badges visibles dans le profil
- [ ] Écran "Mes trophées" fonctionne
- [ ] Badges enregistrés dans la base de données

## 🎉 Résultat attendu

Si tout fonctionne, vous devriez :
1. ✅ Voir une notification animée quand un badge est débloqué
2. ✅ Voir les badges dans votre profil
3. ✅ Pouvoir naviguer vers l'écran "Mes trophées"
4. ✅ Voir les badges groupés par catégorie

---

**Note** : Les badges se débloquent uniquement pour les matchs **classés** ou **tournoi**. Les matchs amicaux ne débloquent pas de badges.

