# Guide : Nommage et Upload des Images de Badges

## 📁 Structure des dossiers

Créez un nouveau dossier pour les badges dans `assets/` :

```
assets/
  └── badges/
      ├── unlocked/          # Badges débloqués (couleurs)
      │   ├── volume/
      │   ├── performance/
      │   ├── social/
      │   ├── club/
      │   └── bar/
      └── locked/            # Badges non débloqués (gris)
          ├── volume/
          ├── performance/
          ├── social/
          ├── club/
          └── bar/
```

**OU** structure simplifiée (recommandée) :

```
assets/
  └── badges/
      └── [code_du_badge].png
```

---

## 🏷️ Convention de nommage

### Option 1 : Par code de badge (RECOMMANDÉ)

Utilisez le **code exact du badge** tel que défini dans la base de données :

| Code Badge | Nom du fichier | Description |
|------------|----------------|-------------|
| `VOLUME_5_MATCHES` | `VOLUME_5_MATCHES.png` | 5 Matchs |
| `VOLUME_20_MATCHES` | `VOLUME_20_MATCHES.png` | 20 Matchs |
| `VOLUME_50_MATCHES` | `VOLUME_50_MATCHES.png` | 50 Matchs |
| `VOLUME_100_MATCHES` | `VOLUME_100_MATCHES.png` | 100 Matchs |
| `RANKED_10_MATCHES` | `RANKED_10_MATCHES.png` | 10 Matchs Classés |
| `TOURNAMENT_5_MATCHES` | `TOURNAMENT_5_MATCHES.png` | 5 Matchs Tournoi |
| `STREAK_3_WINS` | `STREAK_3_WINS.png` | Série de 3 Victoires |
| `STREAK_5_WINS` | `STREAK_5_WINS.png` | Série de 5 Victoires |
| `STREAK_10_WINS` | `STREAK_10_WINS.png` | Série de 10 Victoires |
| `UPSET_15_RATING` | `UPSET_15_RATING.png` | Upset +15 |
| `SOCIAL_5_PARTNERS` | `SOCIAL_5_PARTNERS.png` | 5 Partenaires |
| `SOCIAL_10_PARTNERS` | `SOCIAL_10_PARTNERS.png` | 10 Partenaires |
| `SOCIAL_20_PARTNERS` | `SOCIAL_20_PARTNERS.png` | 20 Partenaires |
| `CAMELEON` | `CAMELEON.png` | Caméléon |
| `AFTER_MATCH_CLUB` | `AFTER_MATCH_CLUB.png` | Après-Match au Club |

### Option 2 : Avec variantes (débloqué/locked)

Si vous voulez des images différentes pour les badges débloqués et non débloqués :

```
assets/badges/
  ├── VOLUME_5_MATCHES.png          # Version débloquée (couleurs)
  ├── VOLUME_5_MATCHES_locked.png   # Version non débloquée (gris)
  ├── STREAK_3_WINS.png
  ├── STREAK_3_WINS_locked.png
  └── ...
```

### Option 3 : Par catégorie

```
assets/badges/
  ├── volume/
  │   ├── VOLUME_5_MATCHES.png
  │   ├── VOLUME_20_MATCHES.png
  │   └── ...
  ├── performance/
  │   ├── STREAK_3_WINS.png
  │   └── ...
  └── social/
      └── ...
```

---

## 📋 Liste complète des fichiers à créer

### Badges Volume (6 fichiers)

```
assets/badges/VOLUME_5_MATCHES.png
assets/badges/VOLUME_20_MATCHES.png
assets/badges/VOLUME_50_MATCHES.png
assets/badges/VOLUME_100_MATCHES.png
assets/badges/RANKED_10_MATCHES.png
assets/badges/TOURNAMENT_5_MATCHES.png
```

### Badges Performance (4 fichiers)

```
assets/badges/STREAK_3_WINS.png
assets/badges/STREAK_5_WINS.png
assets/badges/STREAK_10_WINS.png
assets/badges/UPSET_15_RATING.png
```

### Badges Social (4 fichiers)

```
assets/badges/SOCIAL_5_PARTNERS.png
assets/badges/SOCIAL_10_PARTNERS.png
assets/badges/SOCIAL_20_PARTNERS.png
assets/badges/CAMELEON.png
```

### Badges Bar/Club (1 fichier)

```
assets/badges/AFTER_MATCH_CLUB.png
```

**Total : 15 fichiers d'images**

---

## 🗜️ Optimisation des images (IMPORTANT)

### Problème : Fichiers trop lourds

Si vos fichiers PNG font **350 ko chacun**, vous devez les optimiser :

**Calcul :**
- 15 badges × 350 ko = **5.25 Mo** (trop lourd !)
- Taille cible : 15 badges × 20-30 ko = **300-450 ko** (acceptable)

### Solutions d'optimisation

#### Option 1 : Compression PNG (recommandé)

Utilisez des outils de compression PNG :

**Outils en ligne :**
- [TinyPNG](https://tinypng.com/) - Compression jusqu'à 70%
- [Squoosh](https://squoosh.app/) - Compression avec prévisualisation
- [ImageOptim](https://imageoptim.com/) - Pour Mac

**Commande ligne (PNGquant) :**
```bash
# Installer pngquant
npm install -g pngquant

# Compresser un fichier
pngquant --quality=65-80 VOLUME_5_MATCHES.png --output VOLUME_5_MATCHES_optimized.png
```

**Résultat attendu :** 350 ko → **20-50 ko** (réduction de 85-95%)

#### Option 2 : Conversion en WebP

WebP offre une meilleure compression que PNG :

**Outils :**
- [Squoosh](https://squoosh.app/) - Conversion PNG → WebP
- [cwebp](https://developers.google.com/speed/webp/docs/cwebp) - Ligne de commande

**Commande :**
```bash
# Installer cwebp
brew install webp  # Mac
# ou
npm install -g webp

# Convertir
cwebp -q 80 VOLUME_5_MATCHES.png -o VOLUME_5_MATCHES.webp
```

**Résultat attendu :** 350 ko → **15-30 ko** (réduction de 90-95%)

**Note :** WebP est supporté sur iOS 14+ et Android 4.0+

#### Option 3 : Réduction de la résolution

Si vos images sont en 512x512 px ou plus :

1. **Réduire à 256x256 px** (suffisant pour l'affichage)
2. **Réduire à 128x128 px** si les badges sont simples

**Résultat :** Réduction de 75% de la taille (512px → 256px)

#### Option 4 : Simplifier le design

- Réduire le nombre de couleurs
- Simplifier les détails
- Utiliser des formes simples
- Éviter les dégradés complexes

### Workflow recommandé

1. **Créer les images** en haute résolution (512x512 px)
2. **Réduire la résolution** à 256x256 px (ou 128x128 px)
3. **Compresser avec TinyPNG** ou pngquant
4. **Vérifier la taille** : doit être < 50 ko
5. **Tester la qualité** : doit rester lisible à 40x40 px

### Exemple de compression

```
Image originale :
- Taille : 512x512 px
- Poids : 350 ko
- Qualité : 100%

Après optimisation :
- Taille : 256x256 px (réduction 75%)
- Compression PNG : qualité 80%
- Poids final : ~25 ko (réduction 93%)
- Qualité visuelle : Identique à 40x40 px
```

---

## 🎨 Spécifications techniques

### ⚠️ IMPORTANT : Taille des fichiers

**350 ko par fichier = TROP LOURD !**

- **15 badges × 350 ko = 5.25 Mo** dans le bundle de l'app
- **Impact** : Téléchargement plus long, app plus lourde, performances dégradées

**Taille cible recommandée :**
- **PNG optimisé** : **20-50 ko maximum** par badge
- **Total acceptable** : **300-750 ko** pour les 15 badges
- **Idéal** : **10-30 ko** par badge = **150-450 ko** total

### Formats recommandés

1. **PNG optimisé** (recommandé) : Transparence, qualité, mais **compressé**
2. **WebP** : Compression optimale (30-50% plus petit que PNG), support iOS 14+
3. **SVG** : Vectoriel, scalable, très léger si bien optimisé

### Tailles recommandées

- **Taille de base** : `128x128 px` ou `256x256 px` (pas besoin de 512px)
- **Format carré** : Ratio 1:1 (important pour l'affichage circulaire)
- **Résolution** : Pas besoin de 2x/3x pour les badges (affichage petit)

### Conseils de design

- **Fond transparent** : Utilisez un fond transparent (PNG avec alpha)
- **Couleurs vives** : Les badges débloqués doivent être colorés
- **Style cohérent** : Gardez un style uniforme pour tous les badges
- **Lisible en petit** : Le badge doit rester lisible même à 40x40 px
- **Simplifier** : Moins de détails = fichier plus léger

---

## 📂 Où uploader les fichiers

### Option 1 : Dans le projet local (recommandé pour développement)

1. Créez le dossier `assets/badges/` à la racine du projet
2. Placez tous les fichiers PNG dans ce dossier
3. Les images seront incluses dans le bundle de l'app

### Option 2 : Sur Supabase Storage (recommandé pour production)

1. Créez un bucket `badges` dans Supabase Storage
2. Uploadez les images avec le code du badge comme nom
3. Configurez les permissions (lecture publique)

**Structure Supabase Storage :**
```
badges/
  ├── VOLUME_5_MATCHES.png
  ├── VOLUME_20_MATCHES.png
  └── ...
```

**URL publique :**
```
https://[PROJECT_ID].supabase.co/storage/v1/object/public/badges/VOLUME_5_MATCHES.png
```

### Option 3 : CDN externe

Si vous utilisez un CDN (Cloudflare, AWS CloudFront, etc.), uploadez les images là-bas.

---

## 💻 Modification du code pour utiliser les images

### Étape 1 : Créer un helper pour charger les images

Créez `lib/badgeImages.ts` :

```typescript
// lib/badgeImages.ts
import { ImageSourcePropType } from 'react-native';

// Mapping des codes de badges vers les images locales
const BADGE_IMAGES: Record<string, ImageSourcePropType> = {
  // Volume
  VOLUME_5_MATCHES: require('../assets/badges/VOLUME_5_MATCHES.png'),
  VOLUME_20_MATCHES: require('../assets/badges/VOLUME_20_MATCHES.png'),
  VOLUME_50_MATCHES: require('../assets/badges/VOLUME_50_MATCHES.png'),
  VOLUME_100_MATCHES: require('../assets/badges/VOLUME_100_MATCHES.png'),
  RANKED_10_MATCHES: require('../assets/badges/RANKED_10_MATCHES.png'),
  TOURNAMENT_5_MATCHES: require('../assets/badges/TOURNAMENT_5_MATCHES.png'),
  
  // Performance
  STREAK_3_WINS: require('../assets/badges/STREAK_3_WINS.png'),
  STREAK_5_WINS: require('../assets/badges/STREAK_5_WINS.png'),
  STREAK_10_WINS: require('../assets/badges/STREAK_10_WINS.png'),
  UPSET_15_RATING: require('../assets/badges/UPSET_15_RATING.png'),
  
  // Social
  SOCIAL_5_PARTNERS: require('../assets/badges/SOCIAL_5_PARTNERS.png'),
  SOCIAL_10_PARTNERS: require('../assets/badges/SOCIAL_10_PARTNERS.png'),
  SOCIAL_20_PARTNERS: require('../assets/badges/SOCIAL_20_PARTNERS.png'),
  CAMELEON: require('../assets/badges/CAMELEON.png'),
  
  // Bar/Club
  AFTER_MATCH_CLUB: require('../assets/badges/AFTER_MATCH_CLUB.png'),
};

// Image par défaut si le badge n'a pas d'image
const DEFAULT_BADGE_IMAGE = require('../assets/badges/default.png');

export function getBadgeImage(badgeCode: string, unlocked: boolean): ImageSourcePropType {
  // Si vous avez des variantes locked/unlocked
  if (!unlocked) {
    const lockedImage = BADGE_IMAGES[`${badgeCode}_locked`];
    if (lockedImage) return lockedImage;
  }
  
  // Image normale
  return BADGE_IMAGES[badgeCode] || DEFAULT_BADGE_IMAGE;
}
```

### Étape 2 : Modifier le composant BadgeIcon

Dans `app/(tabs)/profil.js` :

```javascript
import { Image } from 'react-native';
import { getBadgeImage } from '../../lib/badgeImages';

function BadgeIcon({ badge, size = 40 }) {
  const badgeImage = getBadgeImage(badge.code, badge.unlocked);
  const opacity = badge.unlocked ? 1 : 0.4;

  return (
    <View style={{ 
      width: size, 
      height: size, 
      borderRadius: size / 2, 
      backgroundColor: '#f3f4f6', 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#e5e7eb',
      position: 'relative',
      opacity,
      overflow: 'hidden'
    }}>
      <Image 
        source={badgeImage}
        style={{ 
          width: size * 0.8, 
          height: size * 0.8,
          resizeMode: 'contain'
        }}
      />
      {badge.unlocked && badge.rarityScore && badge.rarityScore > 50 && (
        <View style={{
          position: 'absolute',
          top: -4,
          right: -4,
          backgroundColor: '#fff',
          borderRadius: 8,
          padding: 2,
          borderWidth: 1,
          borderColor: '#fbbf24',
        }}>
          <Ionicons name="sparkles" size={10} color="#fbbf24" />
        </View>
      )}
    </View>
  );
}
```

### Étape 3 : Utiliser Supabase Storage (optionnel)

Si vous utilisez Supabase Storage :

```typescript
// lib/badgeImages.ts
import { supabase } from './supabase';

const SUPABASE_BADGES_BUCKET = 'badges';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export function getBadgeImageUrl(badgeCode: string, unlocked: boolean): string {
  const filename = unlocked 
    ? `${badgeCode}.png`
    : `${badgeCode}_locked.png`;
  
  return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BADGES_BUCKET}/${filename}`;
}

// Dans le composant
function BadgeIcon({ badge, size = 40 }) {
  const imageUrl = getBadgeImageUrl(badge.code, badge.unlocked);
  
  return (
    <View style={{ ... }}>
      <Image 
        source={{ uri: imageUrl }}
        style={{ width: size * 0.8, height: size * 0.8 }}
        resizeMode="contain"
      />
    </View>
  );
}
```

---

## 📝 Checklist d'implémentation

### 1. Préparation des images

- [ ] Créer 15 images PNG (256x256 ou 512x512 px)
- [ ] Nommer chaque fichier avec le code exact du badge
- [ ] Vérifier que toutes les images ont un fond transparent
- [ ] Tester la lisibilité en petit format (40x40 px)

### 2. Organisation des fichiers

- [ ] Créer le dossier `assets/badges/`
- [ ] Placer tous les fichiers PNG dans ce dossier
- [ ] Vérifier que les noms correspondent exactement aux codes

### 3. Modification du code

- [ ] Créer `lib/badgeImages.ts` avec le mapping
- [ ] Modifier `BadgeIcon` dans `app/(tabs)/profil.js`
- [ ] Modifier `BadgeIcon` dans `app/profiles/[id].js`
- [ ] Modifier `BadgeCard` dans `app/profiles/[id]/trophies.tsx`
- [ ] Modifier `ShareableBadgeCard` dans `components/ShareableBadgeCard.tsx`

### 4. Tests

- [ ] Vérifier l'affichage des badges débloqués
- [ ] Vérifier l'affichage des badges non débloqués (gris)
- [ ] Tester sur différentes tailles d'écran
- [ ] Vérifier les performances (chargement des images)

---

## 🚀 Upload sur Supabase Storage (optionnel)

Si vous choisissez d'utiliser Supabase Storage :

### 1. Créer le bucket

```sql
-- Dans Supabase Dashboard → Storage → Create bucket
-- Nom : "badges"
-- Public : true
```

### 2. Uploader les fichiers

```bash
# Via Supabase CLI
supabase storage upload badges VOLUME_5_MATCHES.png --bucket badges

# Ou via l'interface web : Storage → badges → Upload
```

### 3. Configurer les permissions

```sql
-- Permettre la lecture publique
CREATE POLICY "Public read access for badges"
ON storage.objects FOR SELECT
USING (bucket_id = 'badges');
```

---

## 📦 Exemple de structure finale

```
padel-sync/
├── assets/
│   └── badges/
│       ├── VOLUME_5_MATCHES.png
│       ├── VOLUME_20_MATCHES.png
│       ├── VOLUME_50_MATCHES.png
│       ├── VOLUME_100_MATCHES.png
│       ├── RANKED_10_MATCHES.png
│       ├── TOURNAMENT_5_MATCHES.png
│       ├── STREAK_3_WINS.png
│       ├── STREAK_5_WINS.png
│       ├── STREAK_10_WINS.png
│       ├── UPSET_15_RATING.png
│       ├── SOCIAL_5_PARTNERS.png
│       ├── SOCIAL_10_PARTNERS.png
│       ├── SOCIAL_20_PARTNERS.png
│       ├── CAMELEON.png
│       └── AFTER_MATCH_CLUB.png
├── lib/
│   └── badgeImages.ts
└── app/
    └── (tabs)/
        └── profil.js
```

---

## 🎯 Résumé

1. **Nommage** : Utilisez le code exact du badge (ex: `VOLUME_5_MATCHES.png`)
2. **Emplacement** : `assets/badges/` dans le projet
3. **Format** : PNG avec transparence, 256x256 ou 512x512 px
4. **Total** : 15 fichiers (un par badge)
5. **Code** : Créer `lib/badgeImages.ts` et modifier les composants `BadgeIcon`

---

**Note** : Si vous préférez garder les icônes Ionicons pour l'instant, vous pouvez ajouter les images progressivement. Le code peut gérer les deux (images si disponibles, sinon icônes par défaut).

