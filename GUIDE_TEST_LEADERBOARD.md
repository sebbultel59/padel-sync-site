# Guide : Tester le Leaderboard avec les 3 scopes

## 📍 Où se trouve le leaderboard ?

### Accès principal

**Route** : `/leaderboard`

Vous pouvez y accéder de plusieurs façons :

1. **Depuis l'écran d'un club** :
   - Allez sur la page d'un club (`/clubs/[id]`)
   - Cliquez sur le bouton **"Voir le classement du club"**
   - Vous serez redirigé vers `/leaderboard` avec le scope "Mon club" pré-sélectionné

2. **Depuis l'écran des groupes** :
   - Allez sur l'écran "Groupes" (tab bar)
   - Sélectionnez un groupe actif
   - Le leaderboard compact du groupe s'affiche en bas
   - Pour voir le leaderboard complet, naviguez vers `/leaderboard` et sélectionnez "Mon groupe"

3. **Navigation directe** :
   - Dans votre code, utilisez :
   ```typescript
   router.push('/leaderboard');
   ```

## 🎯 Les 3 scopes disponibles

### 1. **Global** (Classement global par ville)

**Condition** : Vous devez avoir une adresse (ville) dans votre profil

**Ce qui est affiché** :
- Tous les joueurs de votre ville (ou de la ville de votre club principal)
- Classement basé sur le rating global
- Exclut les utilisateurs qui ont opt-out (`hide_from_public_leaderboards = true`)

**Comment tester** :
1. Assurez-vous d'avoir une adresse dans votre profil (`address_home` ou `address_work` avec un champ `city`)
2. Allez sur `/leaderboard`
3. Cliquez sur le bouton **"Global"**
4. Vérifiez que votre position est correcte

### 2. **Mon club** (Classement du club)

**Condition** : Vous devez être membre d'un club

**Ce qui est affiché** :
- Tous les membres de votre club
- Classement basé sur le rating
- Nombre de matchs joués dans le club

**Comment tester** :
1. Assurez-vous d'être membre d'un club
2. Allez sur `/leaderboard`
3. Cliquez sur le bouton **"Mon club"**
4. Vérifiez que votre position est correcte
5. Vérifiez que seuls les membres de votre club apparaissent

**Accès rapide** :
- Depuis la page d'un club, cliquez sur **"Voir le classement du club"**

### 3. **Mon groupe** (Classement du groupe actif)

**Condition** : Vous devez avoir un groupe actif sélectionné

**Ce qui est affiché** :
- Tous les membres du groupe actif
- Classement basé sur le rating
- Nombre de matchs joués dans le groupe

**Comment tester** :
1. Allez sur l'écran "Groupes" (tab bar)
2. Sélectionnez un groupe (il devient "actif")
3. Allez sur `/leaderboard`
4. Cliquez sur le bouton **"Mon groupe"**
5. Vérifiez que votre position est correcte
6. Vérifiez que seuls les membres du groupe apparaissent

## ✅ Checklist de test

### Test 1 : Vérifier que les 3 scopes sont accessibles

- [ ] **Global** : Bouton disponible si vous avez une adresse
- [ ] **Mon club** : Bouton disponible si vous êtes membre d'un club
- [ ] **Mon groupe** : Bouton disponible si vous avez un groupe actif

### Test 2 : Vérifier votre position dans chaque scope

Pour chaque scope disponible :

- [ ] Votre position est affichée (votre ligne est surlignée)
- [ ] Votre rang est correct
- [ ] Votre rating est correct
- [ ] Votre niveau (level) est correct
- [ ] Votre XP est correct

### Test 3 : Vérifier que les rangs se mettent à jour après un match

1. **Avant le match** :
   - Notez votre position dans chaque scope
   - Notez votre rating

2. **Enregistrez un match** :
   - Allez sur un match confirmé
   - Enregistrez le résultat (victoire ou défaite)
   - Attendez la fin du traitement

3. **Après le match** :
   - Retournez sur `/leaderboard`
   - Vérifiez que votre rating a changé
   - Vérifiez que votre position a changé (si nécessaire)
   - Vérifiez que votre niveau/XP a changé (si vous avez gagné assez de XP)

### Test 4 : Vérifier les données affichées

Pour chaque entrée du leaderboard, vérifiez :

- [ ] Le rang est affiché correctement (#1, #2, #3, etc.)
- [ ] Le niveau (level) est affiché avec la bonne couleur
- [ ] Le pseudo/nom du joueur est affiché
- [ ] Le rating est affiché
- [ ] Le nombre de matchs est affiché (pour scope club/group)
- [ ] La barre de XP est affichée (pour scope full)
- [ ] Cliquer sur un joueur ouvre son profil

## 🔍 Vérifications SQL

Pour vérifier manuellement les données :

### Vérifier votre rating

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

### Vérifier votre rang global

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

### Vérifier votre rang dans le club

```sql
SELECT 
  rank,
  user_id,
  pseudo,
  rating,
  level,
  matches_count_in_club
FROM club_leaderboard('VOTRE_CLUB_ID')
WHERE user_id = 'VOTRE_USER_ID';
```

### Vérifier votre rang dans le groupe

```sql
SELECT 
  rank,
  user_id,
  pseudo,
  rating,
  level,
  matches_count_in_group
FROM group_leaderboard('VOTRE_GROUP_ID')
WHERE user_id = 'VOTRE_USER_ID';
```

## 🐛 Problèmes courants

### Le scope "Global" n'est pas disponible

**Cause** : Vous n'avez pas de ville dans votre profil

**Solution** :
1. Allez sur votre profil
2. Ajoutez une adresse (domicile ou travail) avec une ville
3. Ou vérifiez que votre club principal a une adresse avec une ville

### Le scope "Mon club" n'est pas disponible

**Cause** : Vous n'êtes membre d'aucun club

**Solution** :
1. Rejoignez un club
2. Ou créez un club et devenez membre

### Le scope "Mon groupe" n'est pas disponible

**Cause** : Aucun groupe n'est actif

**Solution** :
1. Allez sur l'écran "Groupes"
2. Sélectionnez un groupe (il devient actif)
3. Retournez sur le leaderboard

### Les rangs ne se mettent pas à jour après un match

**Causes possibles** :
1. Le match n'a pas été enregistré correctement
2. L'Edge Function `record-match-result` n'a pas mis à jour les ratings
3. Le match n'était pas de type "ranked" ou "tournament"

**Vérifications** :
1. Vérifiez les logs de l'Edge Function
2. Vérifiez que `player_ratings` a été mis à jour
3. Vérifiez que `rating_history` contient une nouvelle entrée

## 📱 Navigation dans l'app

Pour naviguer vers le leaderboard depuis le code :

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

