# 🏆 Guide rapide : Tester le Leaderboard

## 📍 Comment accéder au leaderboard

### Option 1 : Navigation directe (dans l'app)

Dans votre app React Native, naviguez vers :
```
/leaderboard
```

### Option 2 : Depuis l'écran d'un club

1. Allez sur la page d'un club (`/clubs/[id]`)
2. Cliquez sur le bouton **"Voir le classement du club"**
3. Vous serez redirigé vers le leaderboard avec le scope "Mon club" pré-sélectionné

### Option 3 : Depuis l'écran des groupes

1. Allez sur l'écran "Groupes" (onglet dans la tab bar)
2. Sélectionnez un groupe (il devient actif)
3. Le leaderboard compact du groupe s'affiche en bas de l'écran
4. Pour voir le leaderboard complet, naviguez vers `/leaderboard` et sélectionnez "Mon groupe"

## 🎯 Les 3 scopes

Une fois sur `/leaderboard`, vous verrez **3 boutons** en haut :

### 1. **Global** 🌍
- **Condition** : Vous devez avoir une adresse (ville) dans votre profil
- **Affiche** : Tous les joueurs de votre ville, classés par rating
- **Test** : Cliquez sur "Global" → Vérifiez votre position

### 2. **Mon club** 🏢
- **Condition** : Vous devez être membre d'un club
- **Affiche** : Tous les membres de votre club, classés par rating
- **Test** : Cliquez sur "Mon club" → Vérifiez votre position

### 3. **Mon groupe** 👥
- **Condition** : Vous devez avoir un groupe actif sélectionné
- **Affiche** : Tous les membres du groupe actif, classés par rating
- **Test** : Cliquez sur "Mon groupe" → Vérifiez votre position

## ✅ Checklist de test

### Étape 1 : Vérifier l'accès aux scopes

- [ ] Ouvrez `/leaderboard` dans l'app
- [ ] Vérifiez que les 3 boutons sont visibles
- [ ] Vérifiez que les boutons non disponibles sont grisés

### Étape 2 : Tester chaque scope disponible

Pour chaque scope (Global, Mon club, Mon groupe) :

- [ ] Cliquez sur le bouton du scope
- [ ] Vérifiez que la liste des joueurs s'affiche
- [ ] Vérifiez que **votre ligne est surlignée** (vous êtes le joueur actuel)
- [ ] Vérifiez que votre **rang** est correct (#1, #2, etc.)
- [ ] Vérifiez que votre **rating** est affiché
- [ ] Vérifiez que votre **niveau (level)** est affiché avec la bonne couleur

### Étape 3 : Vérifier la mise à jour après un match

1. **Avant le match** :
   - Notez votre position dans chaque scope
   - Notez votre rating actuel

2. **Enregistrez un match** :
   - Allez sur un match confirmé
   - Enregistrez le résultat (victoire ou défaite)
   - Attendez quelques secondes

3. **Après le match** :
   - Retournez sur `/leaderboard`
   - Vérifiez que votre **rating a changé**
   - Vérifiez que votre **position a changé** (si nécessaire)
   - Vérifiez que votre **niveau/XP a changé** (si vous avez gagné assez de XP)

## 🔍 Vérifications SQL (optionnel)

Si vous voulez vérifier manuellement dans Supabase :

### Votre rating actuel

```sql
SELECT 
  player_id,
  rating,
  level,
  xp,
  matches_played,
  wins,
  losses
FROM player_ratings
WHERE player_id = 'VOTRE_USER_ID';
```

### Votre rang global

```sql
SELECT 
  rank_global,
  user_id,
  display_name,
  rating,
  level
FROM leaderboard_view
WHERE user_id = 'VOTRE_USER_ID';
```

### Votre rang dans le club

```sql
-- Remplacez 'VOTRE_CLUB_ID' par l'ID de votre club
SELECT 
  rank,
  user_id,
  pseudo,
  rating,
  level
FROM club_leaderboard('VOTRE_CLUB_ID')
WHERE user_id = 'VOTRE_USER_ID';
```

### Votre rang dans le groupe

```sql
-- Remplacez 'VOTRE_GROUP_ID' par l'ID de votre groupe
SELECT 
  rank,
  user_id,
  pseudo,
  rating,
  level
FROM group_leaderboard('VOTRE_GROUP_ID')
WHERE user_id = 'VOTRE_USER_ID';
```

## 🐛 Problèmes courants

### ❌ Le scope "Global" est grisé

**Solution** : Ajoutez une adresse avec une ville dans votre profil

### ❌ Le scope "Mon club" est grisé

**Solution** : Rejoignez un club ou créez-en un

### ❌ Le scope "Mon groupe" est grisé

**Solution** : Sélectionnez un groupe actif depuis l'écran "Groupes"

### ❌ Les rangs ne se mettent pas à jour après un match

**Vérifications** :
1. Vérifiez que le match a été enregistré avec succès
2. Vérifiez les logs de l'Edge Function `record-match-result`
3. Vérifiez que `player_ratings` a été mis à jour dans Supabase
4. Vérifiez que `rating_history` contient une nouvelle entrée

## 📱 Code pour naviguer vers le leaderboard

Si vous voulez ajouter un lien dans votre code :

```typescript
import { useRouter } from 'expo-router';

const router = useRouter();

// Leaderboard global
router.push('/leaderboard');

// Leaderboard du club
router.push({
  pathname: '/leaderboard',
  params: {
    initialScope: 'club',
    clubId: 'VOTRE_CLUB_ID',
  },
});

// Leaderboard du groupe
router.push({
  pathname: '/leaderboard',
  params: {
    initialScope: 'group',
    groupId: 'VOTRE_GROUP_ID',
  },
});
```

