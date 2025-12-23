# Réponses détaillées - Formulaire Google Play Console

## 📅 Agenda - Événements du calendrier

### 1. Ces données sont-elles collectées, partagées ou les deux ?
- ✅ **Cocher** : **Collectées** uniquement
- ⚠️ **Note** : La permission calendrier est déclarée dans le manifeste, mais `expo-calendar` n'est pas dans les dépendances. Si l'application n'ajoute pas réellement d'événements au calendrier système, vous pouvez ne pas déclarer cette catégorie. Sinon, cochez "Collectées" (les événements sont créés par l'utilisateur dans l'app).

### 2. Ces données sont-elles traitées de manière éphémère ?
- ✅ **Cocher** : **Non**, les données collectées ne sont pas traitées de manière éphémère
- **Raison** : Si des événements sont créés, ils sont stockés dans la base de données

### 3. Ces données sont-elles requises ?
- ✅ **Cocher** : **Les utilisateurs peuvent choisir** si ces données sont collectées ou non
- **Raison** : L'ajout au calendrier est optionnel

### 4. Pourquoi ces données sont-elles collectées ?
- ✅ **Cocher** : **Fonctionnement de l'appli** - Pour permettre aux utilisateurs d'ajouter des matchs à leur calendrier

### 5. Pourquoi ces données sont-elles partagées ?
- ❌ **Ne rien cocher** (si vous avez coché "Collectées" uniquement)

---

## 📱 Activité dans les applis

### Type 1 : Interactions avec l'appli

#### 1. Collectées, partagées ou les deux ?
- ✅ **Cocher** : **Collectées** uniquement
- **Raison** : Les interactions (création de matchs, groupes, RSVPs) sont stockées dans votre base de données

#### 2. Traitées de manière éphémère ?
- ✅ **Cocher** : **Non**, les données collectées ne sont pas traitées de manière éphémère
- **Raison** : Les interactions sont stockées de manière permanente

#### 3. Requises ?
- ✅ **Cocher** : **La collecte de données est requise** (les utilisateurs ne peuvent pas désactiver cette collecte)
- **Raison** : Les interactions sont essentielles au fonctionnement de l'application (créer des matchs, rejoindre des groupes, etc.)

#### 4. Pourquoi collectées ?
- ✅ **Cocher** : **Fonctionnement de l'appli** - Pour permettre aux utilisateurs de créer et gérer des matchs, groupes, disponibilités

#### 5. Pourquoi partagées ?
- ❌ **Ne rien cocher** (si vous avez coché "Collectées" uniquement)

---

### Type 2 : Autre contenu généré par l'utilisateur

#### 1. Collectées, partagées ou les deux ?
- ✅ **Cocher** : **Collectées** uniquement
- **Raison** : Le contenu généré par l'utilisateur (matchs, groupes, disponibilités, posts de club) est stocké dans votre base de données

#### 2. Traitées de manière éphémère ?
- ✅ **Cocher** : **Non**, les données collectées ne sont pas traitées de manière éphémère
- **Raison** : Le contenu est stocké de manière permanente

#### 3. Requises ?
- ✅ **Cocher** : **La collecte de données est requise** (les utilisateurs ne peuvent pas désactiver cette collecte)
- **Raison** : Le contenu généré par l'utilisateur est essentiel au fonctionnement de l'application

#### 4. Pourquoi collectées ?
- ✅ **Cocher** : **Fonctionnement de l'appli** - Pour permettre aux utilisateurs de créer du contenu (matchs, groupes, posts)

#### 5. Pourquoi partagées ?
- ❌ **Ne rien cocher** (si vous avez coché "Collectées" uniquement)

---

## 📱 Appareil ou autres ID

### ⚠️ IMPORTANT : C'est le problème principal détecté par Google Play !

### 1. Ces données sont-elles collectées, partagées ou les deux ?
- ✅ **Cocher** : **Collectées ET Partagées**
- **Raison** : 
  - **Collectées** : L'application utilise `expo-notifications` qui collecte des IDs d'appareil pour générer les tokens push
  - **Partagées** : Les IDs sont partagés avec Expo (pour les notifications push) et potentiellement avec Supabase (pour l'hébergement)

### 2. Ces données sont-elles traitées de manière éphémère ?
- ✅ **Cocher** : **Non**, les données collectées ne sont pas traitées de manière éphémère
- **Raison** : Les tokens push sont stockés dans la base de données pour envoyer des notifications

### 3. Ces données sont-elles requises ?
- ✅ **Cocher** : **La collecte de données est requise** (les utilisateurs ne peuvent pas désactiver cette collecte)
- **Raison** : Les notifications push nécessitent des IDs d'appareil pour fonctionner. Sans cela, les notifications ne peuvent pas être envoyées.

### 4. Pourquoi ces données sont-elles collectées ?
- ✅ **Cocher** : 
  - **Fonctionnement de l'appli** - Pour permettre l'envoi de notifications push (matchs, groupes, etc.)
  - **Communications du développeur** - Pour envoyer des notifications aux utilisateurs

### 5. Pourquoi ces données sont-elles partagées ?
- ✅ **Cocher** :
  - **Fonctionnement de l'appli** - Partagées avec Expo pour générer et gérer les tokens push
  - **Communications du développeur** - Partagées avec Expo pour envoyer des notifications

---

## 📋 Résumé rapide

| Type de données | Collectées | Partagées | Éphémère | Requis | Raisons collecte | Raisons partage |
|----------------|------------|-----------|----------|--------|------------------|-----------------|
| **Agenda** | ✅ Oui | ❌ Non | ❌ Non | ⚠️ Optionnel | Fonctionnement | - |
| **Interactions** | ✅ Oui | ❌ Non | ❌ Non | ✅ Requis | Fonctionnement | - |
| **Contenu UGC** | ✅ Oui | ❌ Non | ❌ Non | ✅ Requis | Fonctionnement | - |
| **Appareil ID** | ✅ Oui | ✅ Oui | ❌ Non | ✅ Requis | Fonctionnement, Communications | Fonctionnement, Communications |

---

## ⚠️ Notes importantes

1. **Appareil ou autres ID** : C'est le problème principal. Assurez-vous de bien cocher "Collectées ET Partagées" et de déclarer Expo comme partenaire.

2. **Agenda** : Si votre application n'ajoute pas réellement d'événements au calendrier système (pas de `expo-calendar` dans les dépendances), vous pouvez ne pas déclarer cette catégorie. Mais si la permission est dans le manifeste, Google Play peut s'attendre à ce qu'elle soit déclarée.

3. **Activité dans les applis** : Les deux types (Interactions et Contenu généré) sont essentiels au fonctionnement de l'app, donc ils sont "requis".

4. **Partage avec tiers** : N'oubliez pas de déclarer Expo dans la section "SDK tiers" pour les IDs d'appareil.



