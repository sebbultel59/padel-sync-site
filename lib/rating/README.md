# Système de Rating Elo pour Padel Sync

Ce dossier contient l'implémentation du système de rating Elo simplifié pour les matchs de padel.

## Structure

- **`eloCalculator.ts`** : Fonction pure TypeScript pour calculer les mises à jour de rating
- **`updateRatingsForMatch.ts`** : Fonction asynchrone pour mettre à jour les ratings depuis Supabase
- **`ratingUtils.ts`** : Utilitaires (conversion rating → level/xp)

## Utilisation

### 1. Calculer les mises à jour de rating (fonction pure)

```typescript
import { computeRatingUpdatesForMatch, type MatchResultInput } from './lib/rating/eloCalculator';

const matchResult: MatchResultInput = {
  team1: {
    players: [
      { userId: 'user1', rating: 50 },
      { userId: 'user2', rating: 55 },
    ],
  },
  team2: {
    players: [
      { userId: 'user3', rating: 60 },
      { userId: 'user4', rating: 65 },
    ],
  },
  winnerTeam: 1, // L'équipe 1 a gagné
  matchType: 'ranked', // Optionnel, défaut 'ranked'
};

const updates = computeRatingUpdatesForMatch(matchResult);
// updates contient ratingBefore, ratingAfter, delta, win pour chaque joueur
```

### 2. Mettre à jour les ratings depuis Supabase (fonction async)

```typescript
import { createClient } from '@supabase/supabase-js';
import { updateRatingsForMatch } from './lib/rating/updateRatingsForMatch';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const result = await updateRatingsForMatch(supabase, matchId);

if (result.success) {
  console.log('Ratings mis à jour:', result.updates);
} else {
  console.error('Erreur:', result.error);
}
```

### 3. Appeler l'Edge Function depuis l'app

```typescript
// Depuis l'app React Native
const response = await fetch(`${SUPABASE_URL}/functions/v1/update-match-ratings`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  },
  body: JSON.stringify({ match_id: matchId }),
});

const data = await response.json();
if (data.success) {
  console.log('Ratings mis à jour avec succès');
}
```

## Intégration

### Option 1: Appel manuel depuis l'app

Quand un match passe à `status = 'completed'`, appeler l'Edge Function :

```typescript
// Dans votre code d'enregistrement de résultat de match
await supabase.functions.invoke('update-match-ratings', {
  body: { match_id: matchId },
});
```

### Option 2: Trigger SQL (recommandé)

Un trigger SQL a été créé dans `supabase/migrations/20251206000000_add_trigger_update_ratings_on_match_completed.sql`.

Ce trigger :
1. Détecte quand `match_results.status` passe à `'completed'`
2. Ajoute automatiquement le match à une queue (`rating_update_queue`)
3. L'app ou un worker peut ensuite traiter la queue

Pour traiter la queue depuis l'app :

```typescript
// Récupérer les matchs en attente
const { data: pending } = await supabase.rpc('get_pending_rating_updates', { p_limit: 10 });

for (const entry of pending) {
  // Appeler l'Edge Function
  const result = await updateRatingsForMatch(supabase, entry.match_id);
  
  // Marquer comme traité
  await supabase.rpc('mark_rating_update_completed', {
    p_queue_id: entry.queue_id,
    p_success: result.success,
    p_error_message: result.error || null,
  });
}
```

## Formule Elo

- **Formule** : `rating_new = rating_old + K * (result - expected)`
- **K** : 12 pour ranked, 14.4 pour tournament, 0 pour friendly
- **Expected** : `1 / (1 + 10^((rating_opponent - rating_team) / 25))`
- **Bornes** : Rating toujours entre 0 et 100

## XP et Statistiques

- **XP gagné** : +10 pour victoire, +4 pour défaite
- **Statistiques** : `matches_played`, `wins`, `losses` sont mis à jour automatiquement
- **Level/XP** : Calculés automatiquement depuis le rating (via trigger SQL)

