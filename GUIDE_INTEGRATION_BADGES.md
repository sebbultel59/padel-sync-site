# Guide d'intégration des badges dans l'application

## 📋 Vue d'ensemble

Le système de badges est **déjà intégré** dans l'application. Ce guide explique comment il fonctionne et comment l'utiliser.

---

## 🏗️ Architecture du système

### 1. **Base de données** (`supabase/migrations/20251203162630_add_player_badges.sql`)

- **Table `badge_definitions`** : Définit tous les badges disponibles
  - `code` : Code unique (ex: `VOLUME_5_MATCHES`)
  - `label` : Nom affiché (ex: "5 Matchs")
  - `description` : Description détaillée
  - `category` : Catégorie (`volume`, `performance`, `social`, `club`, `bar`, `other`)
  - `is_manual` : `true` si attribué manuellement, `false` si automatique
  - `is_active` : `true` si le badge est actif

- **Table `user_badges`** : Badges débloqués par les joueurs
  - `user_id` : ID du joueur
  - `badge_id` : ID du badge
  - `unlocked_at` : Date de déblocage
  - `source_match_id` : Match qui a déclenché le déblocage (pour badges automatiques)
  - `granted_by` : Admin qui a accordé le badge (pour badges manuels)

### 2. **Edge Function** (`supabase/functions/evaluate-badges/index.ts`)

Fonction qui évalue automatiquement les badges après chaque match :

- **Déclenchement** : Appelée automatiquement après l'enregistrement d'un match
- **Logique** : Vérifie les conditions de chaque badge automatique
- **Déblocage** : Insère les nouveaux badges dans `user_badges`

**Badges évalués automatiquement :**
- ✅ Volume (5, 20, 50, 100 matchs, 10 matchs classés, 5 matchs tournoi)
- ✅ Performance (séries de 3, 5, 10 victoires, upset +15)
- ✅ Social (5, 10, 20 partenaires, caméléon)

### 3. **Hook React** (`hooks/usePlayerBadges.ts`)

Hook qui récupère les badges d'un joueur :

```typescript
const {
  featuredRare,      // Badges rares débloqués (top 5)
  featuredRecent,    // Badges récents débloqués (top 5)
  allBadges,         // Tous les badges (débloqués + grisés)
  unlockedCount,     // Nombre de badges débloqués
  totalAvailable,    // Nombre total de badges disponibles
  isLoading,
  error,
  refetch
} = usePlayerBadges(userId);
```

### 4. **Composants UI**

#### A. **Profil** (`app/(tabs)/profil.js`)

Section "MES TROPHEES" qui affiche :
- Badges rares (top 3)
- Badges récents (top 3)
- Lien "Voir tous" vers la page complète

#### B. **Page Trophées** (`app/profiles/[id]/trophies.tsx`)

Écran complet affichant :
- Statistiques (X/Y badges débloqués)
- Badges groupés par catégorie
- Badges débloqués en couleur, non débloqués grisés

#### C. **Composant BadgeIcon** (`app/(tabs)/profil.js`)

Icône de badge avec :
- Couleur selon la catégorie
- Indicateur de rareté (sparkles) si `rarityScore > 50`
- Opacité réduite si non débloqué

---

## 🔄 Flux d'intégration automatique

### 1. **Enregistrement d'un match**

```
Utilisateur enregistre un match
    ↓
Edge Function `record-match-result` est appelée
    ↓
Match enregistré dans `match_results`
    ↓
Edge Function `evaluate-badges` est appelée automatiquement
    ↓
Pour chaque joueur du match :
    - Calcul des stats (nombre de matchs, série de victoires, etc.)
    - Vérification des conditions de chaque badge
    - Déblocage des nouveaux badges
    ↓
Badges débloqués retournés dans la réponse
    ↓
Affichage dans l'écran de résumé du match
```

### 2. **Affichage dans le profil**

```
Utilisateur ouvre son profil
    ↓
Hook `usePlayerBadges` est appelé
    ↓
Récupération des badges depuis la base de données
    ↓
Calcul du score de rareté pour chaque badge débloqué
    ↓
Affichage dans la section "MES TROPHEES"
```

---

## 🎨 Catégories et couleurs

| Catégorie | Icône | Couleur | Badges |
|-----------|-------|---------|--------|
| **Volume** | `trophy` | `#fbbf24` (jaune) | 5, 20, 50, 100 matchs, 10 classés, 5 tournoi |
| **Performance** | `flame` | `#ef4444` (rouge) | Série 3, 5, 10 victoires, Upset +15 |
| **Social** | `people` | `#3b82f6` (bleu) | 5, 10, 20 partenaires, Caméléon |
| **Bar/Club** | `wine` | `#ec4899` (rose) | Après-Match au Club (manuel) |

---

## 📱 Utilisation dans l'application

### 1. **Afficher les badges d'un joueur**

```typescript
import { usePlayerBadges } from '../hooks/usePlayerBadges';

function MyComponent({ userId }) {
  const { allBadges, unlockedCount, totalAvailable, isLoading } = usePlayerBadges(userId);
  
  if (isLoading) return <ActivityIndicator />;
  
  return (
    <View>
      <Text>{unlockedCount} / {totalAvailable} badges</Text>
      {allBadges.map(badge => (
        <BadgeIcon key={badge.id} badge={badge} size={40} />
      ))}
    </View>
  );
}
```

### 2. **Composant BadgeIcon**

```typescript
function BadgeIcon({ badge, size = 40 }) {
  const iconName = getBadgeIcon(badge.category); // 'trophy', 'flame', etc.
  const iconColor = badge.unlocked ? getBadgeColor(badge.category) : '#d1d5db';
  const opacity = badge.unlocked ? 1 : 0.4;
  
  return (
    <View style={{ opacity }}>
      <Ionicons name={iconName} size={size} color={iconColor} />
      {badge.unlocked && badge.rarityScore > 50 && (
        <Ionicons name="sparkles" size={10} color="#fbbf24" />
      )}
    </View>
  );
}
```

### 3. **Navigation vers la page complète**

```typescript
import { router } from 'expo-router';

// Dans le profil
<Pressable onPress={() => router.push(`/profiles/${userId}/trophies`)}>
  <Text>Voir tous</Text>
</Pressable>
```

---

## 🔧 Ajouter un nouveau badge

### 1. **Ajouter dans la base de données**

Créer une nouvelle migration SQL :

```sql
INSERT INTO badge_definitions (code, label, description, category, is_manual, is_active) 
VALUES 
  ('NOUVEAU_BADGE', 'Nouveau Badge', 'Description du badge', 'volume', false, true)
ON CONFLICT (code) DO NOTHING;
```

### 2. **Ajouter la logique d'évaluation**

Dans `supabase/functions/evaluate-badges/index.ts`, ajouter la condition :

```typescript
// Dans la fonction evaluatePlayerBadges
if (badge.code === "NOUVEAU_BADGE" && condition) {
  shouldUnlock = true;
}
```

### 3. **Tester**

1. Enregistrer un match qui devrait débloquer le badge
2. Vérifier dans la base de données que le badge est débloqué
3. Vérifier l'affichage dans le profil

---

## 🎯 Badges manuels

Le badge **"Après-Match au Club"** (`AFTER_MATCH_CLUB`) est attribué manuellement par un admin :

```typescript
// Exemple d'attribution manuelle (à implémenter dans l'interface admin)
await supabase.from('user_badges').insert({
  user_id: playerId,
  badge_id: badgeId,
  granted_by: adminUserId,
  unlocked_at: new Date().toISOString(),
});
```

---

## 📊 Score de rareté

Le score de rareté est calculé automatiquement :

- **Formule** : `100 - (nombre de joueurs qui ont le badge / 10)`
- **Plus le badge est rare** (moins de joueurs l'ont), **plus le score est élevé**
- **Badges rares** (score > 50) affichent une icône sparkles ✨

---

## ✅ État actuel de l'intégration

### ✅ **Déjà implémenté :**

1. ✅ Base de données (tables, migrations)
2. ✅ Edge Function d'évaluation automatique
3. ✅ Hook React `usePlayerBadges`
4. ✅ Affichage dans le profil (section "MES TROPHEES")
5. ✅ Page complète des trophées (`/profiles/[id]/trophies`)
6. ✅ Composant `BadgeIcon` réutilisable
7. ✅ Notification lors du déblocage (dans `result-summary.tsx`)
8. ✅ Score de rareté calculé automatiquement

### 🔄 **Appels automatiques :**

- ✅ `evaluate-badges` est appelée automatiquement après chaque match
- ✅ Les badges sont évalués pour tous les joueurs du match
- ✅ Les nouveaux badges sont insérés dans `user_badges`

### 📱 **Affichage :**

- ✅ Section "MES TROPHEES" dans le profil
- ✅ Page complète avec catégories
- ✅ Badges rares mis en avant
- ✅ Badges non débloqués grisés

---

## 🚀 Pour utiliser les badges

**Aucune action supplémentaire n'est nécessaire !** Le système est déjà opérationnel :

1. **Les badges sont évalués automatiquement** après chaque match
2. **Ils s'affichent dans le profil** de chaque joueur
3. **Les joueurs peuvent voir tous leurs badges** en cliquant sur "Voir tous"

---

## 📝 Notes importantes

- Les badges **automatiques** sont évalués uniquement après un match
- Les badges **manuels** doivent être attribués via l'interface admin (à implémenter)
- Le score de rareté est recalculé à chaque chargement des badges
- Les badges non débloqués sont affichés en gris pour montrer la progression

---

## 🔍 Debugging

### Vérifier qu'un badge est débloqué :

```sql
SELECT ub.*, bd.code, bd.label
FROM user_badges ub
JOIN badge_definitions bd ON ub.badge_id = bd.id
WHERE ub.user_id = 'USER_ID';
```

### Vérifier les badges disponibles :

```sql
SELECT * FROM badge_definitions WHERE is_active = true;
```

### Vérifier les logs de l'Edge Function :

Dans Supabase Dashboard → Edge Functions → `evaluate-badges` → Logs

---

## 📚 Fichiers clés

- `supabase/migrations/20251203162630_add_player_badges.sql` : Structure de la base de données
- `supabase/functions/evaluate-badges/index.ts` : Logique d'évaluation
- `hooks/usePlayerBadges.ts` : Hook React
- `app/(tabs)/profil.js` : Affichage dans le profil
- `app/profiles/[id]/trophies.tsx` : Page complète des trophées
- `components/BadgeUnlockedToast.tsx` : Notification de déblocage

---

**Le système de badges est entièrement intégré et fonctionnel !** 🎉



