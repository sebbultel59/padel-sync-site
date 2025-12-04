# Prochaines étapes : Système de Rating et Leaderboard

## ✅ Ce qui est déjà fait

1. **Système de calcul Elo** : `lib/rating/eloCalculator.ts` avec `computeRatingUpdatesForMatch()`
2. **Edge Function `update-match-ratings`** : Prête à traiter les mises à jour de ratings
3. **Trigger SQL avec queue** : `rating_update_queue` créée automatiquement quand un match est complété
4. **Hook `useLeaderboard`** : Connecté à `leaderboard_view` pour afficher les classements
5. **Composant `<Leaderboard />`** : Utilise le hook et affiche les données réelles
6. ✅ **Insertion dans `rating_history`** : Ajoutée dans `record-match-result`
7. ✅ **Mise à jour de `level` et `xp`** : Ajoutée dans `record-match-result`

## 🎯 État actuel

L'Edge Function `record-match-result` :
- ✅ Met à jour les ratings dans `player_ratings` (rating, level, xp, matches_played, wins, losses)
- ✅ Insère dans `rating_history` pour chaque joueur
- ✅ Crée les `match_rating_effects`
- ✅ Met à jour le statut du match à 'completed'

Le leaderboard :
- ✅ Utilise `leaderboard_view` qui lit depuis `player_ratings`
- ✅ Se met à jour automatiquement quand les ratings changent
- ✅ Supporte 3 scopes : global, club, group

## 🚀 Actions à faire maintenant

### 1. Tester le système complet

**Test manuel** :
1. Enregistrer un match via l'app
2. Vérifier dans Supabase Dashboard :
   - `player_ratings` : rating, level, xp mis à jour
   - `rating_history` : nouvelles entrées créées
   - `match_results` : status = 'completed'
3. Ouvrir l'écran de classement dans l'app
4. Vérifier que les rangs sont corrects

**Commandes SQL pour vérifier** :
```sql
-- Voir les ratings mis à jour
SELECT player_id, rating, level, xp, matches_played, wins, losses 
FROM player_ratings 
ORDER BY rating DESC 
LIMIT 10;

-- Voir l'historique récent
SELECT user_id, rating_before, rating_after, delta, match_id, created_at
FROM rating_history
ORDER BY created_at DESC
LIMIT 10;

-- Voir le leaderboard
SELECT user_id, display_name, rating, rank_global, rank_club
FROM leaderboard_view
ORDER BY rating DESC
LIMIT 10;
```

### 2. Vérifier le leaderboard dans l'app

- [ ] Ouvrir `/leaderboard` dans l'app
- [ ] Tester le scope "Global"
- [ ] Tester le scope "Mon club" (si vous avez un club)
- [ ] Tester le scope "Mon groupe" (si vous avez un groupe actif)
- [ ] Vérifier que votre position est correcte
- [ ] Vérifier que les rangs se mettent à jour après un match

### 3. (Optionnel) Désactiver le trigger de queue

Si vous n'utilisez pas l'approche avec queue, vous pouvez désactiver le trigger :

```sql
DROP TRIGGER IF EXISTS trigger_queue_rating_update ON match_results;
```

Cela évite de créer des entrées inutiles dans `rating_update_queue`.

## 📋 Checklist de test complète

- [ ] Enregistrer un match et vérifier que `player_ratings` est mis à jour
- [ ] Vérifier que `rating_history` contient les entrées
- [ ] Vérifier que `leaderboard_view` se met à jour (rafraîchir la page)
- [ ] Tester les 3 scopes du leaderboard (global, club, group)
- [ ] Vérifier que les rangs (rank_global, rank_club) sont corrects
- [ ] Tester avec plusieurs matchs pour voir l'évolution des ratings
- [ ] Vérifier que les niveaux (level) et XP se mettent à jour correctement

## 🎉 Résultat attendu

Après ces tests, vous devriez avoir :
- ✅ Un système de rating **vivant** qui se met à jour à chaque match
- ✅ Un leaderboard **réel** qui reflète l'activité des joueurs
- ✅ Un historique **traçable** de tous les changements de rating
- ✅ Des niveaux et XP qui **évoluent** avec les performances

**Vous pouvez maintenant dire aux clubs : "Regardez, vos classements sont VIVANTS !"** 🏆
