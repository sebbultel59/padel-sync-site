# 📋 Résumé des Fonctionnalités pour les Administrateurs de Clubs

## 🎯 Vue d'ensemble

Les **Club Managers** (administrateurs de clubs) disposent d'un accès complet à un tableau de bord dédié pour gérer leur club, ses groupes, ses membres et communiquer avec la communauté.

---

## 🏠 Dashboard (Vue d'ensemble)

### Statistiques principales
- **Nombre de groupes** : Affichage du total des groupes créés dans le club
- **Membres uniques** : Comptage des membres uniques à travers tous les groupes du club
- **Matchs** : 
  - Nombre de matchs cette semaine
  - Nombre de matchs ce mois
- **Créneaux les plus utilisés** : Top 3 des créneaux horaires les plus populaires pour les matchs

---

## 📝 Gestion de la Page Club

### Informations générales
- **Nom du club** : Modification du nom (obligatoire)
- **Description** : Description détaillée du club
- **Logo** : 
  - Upload d'un logo depuis la galerie
  - Ou saisie d'une URL manuelle
  - Suppression du logo existant
- **Photos du club** : 
  - Ajout de jusqu'à 5 photos
  - Suppression de photos
  - Format paysage (16:9)

### Bouton d'appel
- **Activation/Désactivation** : Toggle pour activer le bouton d'appel
- **Label personnalisé** : Texte du bouton (ex: "Appeler le club")
- **Numéro de téléphone** : Numéro à afficher/appeler
- Le bouton apparaît sur les matchs validés des groupes du club

### Adresse
- Saisie de l'adresse complète du club

### Liens sociaux
- **Facebook** : URL de la page Facebook
- **Instagram** : URL du compte Instagram
- **Site web** : URL du site web du club

---

## 👥 Gestion des Groupes

### Vue d'ensemble
- Liste de tous les groupes du club avec :
  - Nom du groupe
  - Nombre de membres
  - Visibilité (Public/Privé)
  - Date de création
  - Liste des administrateurs du groupe

### Actions disponibles
- **Créer un groupe** : Création de nouveaux groupes rattachés au club
- **Voir un groupe** : Accès direct au groupe pour voir les détails
- **Promouvoir un admin** : Promouvoir un membre en administrateur de groupe
  - Uniquement dans les groupes du club
  - L'utilisateur doit être membre du groupe

### Statistiques
- Affichage du nombre total de groupes
- Comptage des membres par groupe

---

## 📅 Agenda et Événements

### Création d'événements
Les club managers peuvent créer différents types d'événements :

#### Catégories disponibles
1. **Sportif** 🎾
   - Tournoi interne
   - Tournoi homologué FFT
   - Stages jeunes / adultes
   - Soirée matches mix-in / Americano
   - Défis / Trophées du club
   - Journée découverte ou portes ouvertes
   - Compétitions officielles (interclubs)

2. **Communautaire** 👥
   - Soirée du club
   - BBQ / Apéro-padel
   - Journée bénévoles
   - Réunion d'informations
   - Assemblée générale

3. **École de padel** 🎓
   - Cours collectifs
   - Evaluations / passages de niveaux
   - Journées Animation jeunes
   - Stages vacances

4. **Info** ℹ️
   - Fermeture temporaire
   - Travaux sur les terrains
   - Installation de nouveaux équipements
   - Coupure programmée d'un terrain
   - Nouveaux horaires

### Formulaire de création
- **Titre** : Titre de l'événement
- **Description** : Description détaillée
- **Catégorie** : Sélection parmi les 4 catégories
- **Type d'événement** : Types spécifiques selon la catégorie
- **Date de début** : Date et heure de début
- **Date de fin** : Date et heure de fin (optionnel)
- **Lieu** : Localisation de l'événement
- **Image** : Upload d'une image pour illustrer l'événement

---

## 🏆 Gestion des Matchs

### Vue d'ensemble
- Liste des matchs récents de tous les groupes du club
- Informations affichées :
  - Nom du groupe
  - Statut du match (pending, validated, etc.)
  - Date et heure du match
  - Créneau horaire

### Statistiques
- Nombre total de matchs
- Matchs de la semaine
- Matchs du mois

---

## 🔔 Notifications

### Envoi de notifications
Les club managers peuvent envoyer des notifications push à leurs membres.

### Types de destinataires
1. **Tous les membres** : Notification envoyée à tous les membres de tous les groupes du club
2. **Un groupe spécifique** : Notification envoyée uniquement aux membres d'un groupe choisi
3. **Admins uniquement** : Notification envoyée uniquement aux administrateurs des groupes

### Fonctionnalités
- **Message personnalisé** : Saisie d'un message libre
- **Compteur de caractères** : Affichage du nombre de caractères
- **Sélection du groupe** : Si "Un groupe" est sélectionné, choix parmi la liste des groupes
- **Envoi automatique** : Les notifications sont transformées en jobs et envoyées via le système de notifications push

### Système technique
- Les notifications sont stockées dans `club_notifications`
- Un trigger automatique crée des `notification_jobs` pour chaque membre
- Les notifications push sont envoyées via Expo Notifications

---

## 📊 Statistiques et Analyses

### Dashboard principal
- Vue d'ensemble des statistiques clés
- Graphiques et métriques en temps réel

### Métriques disponibles
- **Groupes** : Nombre total de groupes
- **Membres** : Nombre de membres uniques
- **Matchs** : 
  - Cette semaine
  - Ce mois
- **Créneaux populaires** : Top 3 des créneaux horaires les plus utilisés

---

## 🔐 Permissions et Sécurité

### Accès
- Seuls les utilisateurs avec le rôle `club_manager` peuvent accéder au tableau de bord
- Vérification que le `club_id` de l'utilisateur correspond au club géré
- Redirection automatique si les permissions ne sont pas suffisantes

### Actions autorisées
- ✅ Gérer les informations du club
- ✅ Créer des groupes dans le club
- ✅ Promouvoir des admins dans les groupes du club
- ✅ Créer des événements
- ✅ Envoyer des notifications
- ✅ Voir toutes les statistiques du club
- ✅ Voir tous les matchs des groupes du club

### Restrictions
- ❌ Ne peut pas gérer des groupes d'autres clubs
- ❌ Ne peut pas promouvoir des admins dans des groupes d'autres clubs
- ❌ Ne peut pas modifier les informations d'autres clubs

---

## 🎨 Interface Utilisateur

### Navigation
L'interface est organisée en **6 onglets principaux** :

1. **Infos** 📋 : Gestion de la page club (informations, logo, photos, liens sociaux)
2. **Groupes** 👥 : Gestion des groupes du club
3. **Agenda** 📅 : Création et gestion des événements
4. **Matchs** 🏆 : Vue d'ensemble des matchs
5. **Notifs** 🔔 : Envoi de notifications
6. **Dashboard** 📊 : Statistiques et vue d'ensemble

### Design
- Interface moderne et intuitive
- Navigation par onglets en bas de l'écran
- Header avec logo et nom du club
- Couleurs de marque : Bleu (#1a4b87) et Orange (#ff751d)

---

## 📱 Fonctionnalités Techniques

### Upload de fichiers
- **Logo** : Upload vers Supabase Storage (bucket `club-logos` ou `avatars` en fallback)
- **Photos** : Upload vers Supabase Storage (bucket `club-logos`)
- **Images d'événements** : Upload vers Supabase Storage (bucket `club-assets`)

### Intégrations
- **Supabase** : Base de données et storage
- **Expo Notifications** : Notifications push
- **Image Picker** : Sélection d'images depuis la galerie

### Performance
- Chargement asynchrone des données
- Mise en cache des statistiques
- Optimisation des requêtes SQL

---

## 🚀 Workflow Typique

### Configuration initiale
1. Accéder au tableau de bord du club
2. Configurer les informations de base (nom, description, logo)
3. Ajouter des photos du club
4. Configurer le bouton d'appel (si nécessaire)
5. Ajouter les liens sociaux

### Gestion quotidienne
1. **Créer des groupes** pour organiser les joueurs
2. **Créer des événements** pour annoncer les activités
3. **Envoyer des notifications** pour communiquer avec les membres
4. **Consulter les statistiques** pour suivre l'activité

### Communication
1. Utiliser les **notifications** pour informer les membres
2. Publier des **événements** pour organiser des activités
3. Gérer les **groupes** pour structurer la communauté

---

## 📝 Notes Importantes

### Limitations actuelles

#### Posts/Actus du club
Les posts/actus du club sont créés et affichés, mais certaines fonctionnalités de gestion ne sont pas encore complètement implémentées :

**✅ Fonctionnel :**
- Création de posts (titre, contenu, image)
- Upload d'images vers Supabase Storage
- Affichage de la liste des posts
- Synchronisation automatique avec Instagram
- Support des posts manuels et Instagram

**❌ Manquant :**
- Modification des posts existants (interface manquante, permissions OK)
- Suppression des posts (interface manquante, permissions OK)
- Fonctionnalités avancées (statuts, catégories, pagination, etc.)

📄 **Voir le document détaillé :** `ETAT_POSTS_ACTUS_CLUB.md` pour plus d'informations techniques et les recommandations d'implémentation.

#### Autres limitations
- L'envoi de notifications par groupe spécifique est en cours de développement
- Certaines statistiques avancées peuvent être ajoutées dans le futur

### Bonnes pratiques
- Mettre à jour régulièrement les informations du club
- Communiquer régulièrement avec les membres via les notifications
- Créer des événements pour maintenir l'engagement
- Surveiller les statistiques pour comprendre l'activité du club

---

## 🔄 Évolutions Futures Possibles

- Interface complète de gestion des posts/actus
- Statistiques plus détaillées (graphiques, tendances)
- Export de données
- Gestion avancée des membres
- Système de badges/récompenses
- Intégration avec des systèmes de réservation
- Analytics avancés

---

*Document mis à jour : Version 3.0.0*

