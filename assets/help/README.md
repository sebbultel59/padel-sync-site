# Dossier des captures d'écran pour l'aide

Ce dossier contient les captures d'écran utilisées dans le modal d'aide et le tutoriel interactif.

## Structure des fichiers

### Pour le modal d'aide

#### Section Matchs
- `matchs-possibles.png` - Capture de la section "Matchs possibles"
- `matchs-confirmer.png` - Capture de la section "Matchs à confirmer"
- `matchs-valides.png` - Capture de la section "Matchs validés"
- `filtres-1.png`, `filtres-2.png` - Captures multiples pour les filtres
- `match-eclair.png` - Capture du bouton "Match éclair"
- `matchs-en-feu.png` - Capture de la section "Matchs en feu"

#### Section Disponibilités
- `gerer-dispos.png` - Capture de la gestion des disponibilités
- `application-plusieurs-jours.png` - Capture de l'application sur plusieurs jours
- `mode-global-vs-groupe.png` - Capture du mode global vs groupe

#### Section Groupes
- `creer-groupe.png` - Capture de la création de groupe
- `rejoindre-groupe.png` - Capture de la fonctionnalité "Rejoindre un groupe"
- `gerer-membres.png` - Capture de la gestion des membres
- `groupe-actif.png` - Capture de la sélection du groupe actif

#### Section Profil
- `informations-personnelles.png` - Capture du formulaire de profil
- `classement.png` - Capture du champ classement
- `photo-profil.png` - Capture de la photo de profil

#### Section Notifications
- `types-notifications.png` - Capture des types de notifications
- `gerer-notifications.png` - Capture de la gestion des notifications

### Pour le tutoriel interactif
- `tutorial-matchs.png` - Capture pour l'étape "matchs" du tutoriel
- `tutorial-flash.png` - Capture pour l'étape "flash" du tutoriel

## Format recommandé

- **Format** : WebP (optimisé pour réduire la taille de l'application)
- **Taille** : Adaptée à l'affichage mobile (max 800px de largeur)
- **Ratio** : Respecter le ratio de l'écran mobile pour les captures complètes
- **Conversion** : Les images PNG peuvent être converties en WebP avec `cwebp -q 85 fichier.png -o fichier.webp`

## Activation des images

Une fois les images ajoutées dans ce dossier, décommentez les lignes correspondantes dans `lib/helpImages.js` en remplaçant `null` par `require('../assets/help/nom-fichier.webp')`.












