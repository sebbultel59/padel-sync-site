# 🧪 Tests des Fonctionnalités Posts/Actus - Guide de Test

## ✅ Fonctionnalités à Tester

### 1. Création de Post

#### Test 1.1 : Créer un post simple
- [ ] Ouvrir l'onglet "Agenda" du club manager
- [ ] Cliquer sur "Ajouter" dans la section Actualités
- [ ] Remplir le titre (obligatoire)
- [ ] Remplir le contenu (optionnel)
- [ ] Cliquer sur "Créer"
- **Résultat attendu :** Post créé, modal fermé, post apparaît dans la liste

#### Test 1.2 : Créer un post avec image
- [ ] Ouvrir le modal de création
- [ ] Remplir le titre
- [ ] Cliquer sur "Choisir une image"
- [ ] Sélectionner une image depuis la galerie
- [ ] Vérifier que l'image s'affiche en aperçu
- [ ] Cliquer sur "Créer"
- **Résultat attendu :** Post créé avec image, image visible dans la liste

#### Test 1.3 : Créer un post Instagram
- [ ] Ouvrir le modal de création
- [ ] Cocher "Post Instagram"
- [ ] Remplir le titre
- [ ] Optionnellement ajouter un lien Instagram
- [ ] Cliquer sur "Créer"
- **Résultat attendu :** Post créé avec badge Instagram, lien fonctionnel si fourni

#### Test 1.4 : Validation des champs
- [ ] Ouvrir le modal de création
- [ ] Ne pas remplir le titre
- [ ] Cliquer sur "Créer"
- **Résultat attendu :** Message d'erreur "Le titre est obligatoire", bouton désactivé

#### Test 1.5 : Annuler la création
- [ ] Ouvrir le modal de création
- [ ] Remplir quelques champs
- [ ] Cliquer sur "Annuler" ou sur la croix
- **Résultat attendu :** Modal fermé, champs réinitialisés

---

### 2. Modification de Post

#### Test 2.1 : Modifier le titre d'un post
- [ ] Trouver un post existant
- [ ] Cliquer sur "Modifier"
- [ ] Modifier le titre
- [ ] Cliquer sur "Enregistrer"
- **Résultat attendu :** Post modifié, nouveau titre visible dans la liste

#### Test 2.2 : Modifier le contenu d'un post
- [ ] Cliquer sur "Modifier" d'un post
- [ ] Modifier le contenu
- [ ] Cliquer sur "Enregistrer"
- **Résultat attendu :** Contenu modifié visible dans la liste

#### Test 2.3 : Modifier l'image d'un post
- [ ] Cliquer sur "Modifier" d'un post avec image
- [ ] Cliquer sur "Choisir une image"
- [ ] Sélectionner une nouvelle image
- [ ] Cliquer sur "Enregistrer"
- **Résultat attendu :** Nouvelle image visible dans le post

#### Test 2.4 : Supprimer l'image d'un post
- [ ] Cliquer sur "Modifier" d'un post avec image
- [ ] Cliquer sur le bouton de suppression d'image (X)
- [ ] Cliquer sur "Enregistrer"
- **Résultat attendu :** Image supprimée, post sans image

#### Test 2.5 : Validation lors de la modification
- [ ] Cliquer sur "Modifier" d'un post
- [ ] Effacer complètement le titre
- [ ] Cliquer sur "Enregistrer"
- **Résultat attendu :** Message d'erreur, bouton désactivé

#### Test 2.6 : Annuler la modification
- [ ] Cliquer sur "Modifier" d'un post
- [ ] Modifier quelques champs
- [ ] Cliquer sur "Annuler"
- **Résultat attendu :** Modal fermé, modifications non sauvegardées

---

### 3. Suppression de Post

#### Test 3.1 : Supprimer un post
- [ ] Trouver un post existant
- [ ] Cliquer sur "Supprimer"
- [ ] Confirmer la suppression dans l'alerte
- **Résultat attendu :** Post supprimé, disparaît de la liste

#### Test 3.2 : Annuler la suppression
- [ ] Cliquer sur "Supprimer" d'un post
- [ ] Cliquer sur "Annuler" dans l'alerte de confirmation
- **Résultat attendu :** Post toujours présent, rien ne change

#### Test 3.3 : Confirmation de suppression
- [ ] Cliquer sur "Supprimer" d'un post
- **Résultat attendu :** Alerte avec titre du post et message de confirmation

---

### 4. Affichage des Posts

#### Test 4.1 : Liste des posts
- [ ] Ouvrir l'onglet "Agenda"
- [ ] Vérifier que tous les posts s'affichent
- **Résultat attendu :** Liste complète, triée par date décroissante

#### Test 4.2 : Affichage des éléments
- [ ] Vérifier chaque post affiche :
  - [ ] Titre
  - [ ] Contenu (si présent)
  - [ ] Image (si présente)
  - [ ] Badge Instagram (si source = instagram)
  - [ ] Lien Instagram (si permalink présent)
  - [ ] Boutons Modifier/Supprimer
- **Résultat attendu :** Tous les éléments visibles correctement

#### Test 4.3 : Posts Instagram
- [ ] Vérifier qu'un post Instagram affiche :
  - [ ] Badge "Instagram"
  - [ ] Lien "Voir sur Instagram" (si permalink)
- [ ] Cliquer sur le lien Instagram
- **Résultat attendu :** Lien ouvre Instagram dans le navigateur/app

#### Test 4.4 : Liste vide
- [ ] Supprimer tous les posts
- [ ] Vérifier l'affichage
- **Résultat attendu :** Message "Aucun post" affiché

---

### 5. Gestion des Images

#### Test 5.1 : Upload d'image
- [ ] Créer un post avec image
- [ ] Vérifier que l'image s'upload correctement
- **Résultat attendu :** Image visible dans le post après création

#### Test 5.2 : Aperçu avant upload
- [ ] Sélectionner une image
- [ ] Vérifier l'aperçu avant de créer le post
- **Résultat attendu :** Aperçu visible, possibilité de supprimer

#### Test 5.3 : Supprimer l'image avant création
- [ ] Sélectionner une image
- [ ] Cliquer sur le X pour supprimer
- [ ] Vérifier que l'aperçu disparaît
- **Résultat attendu :** Image supprimée, possibilité d'en choisir une autre

#### Test 5.4 : Permissions galerie
- [ ] Refuser les permissions galerie
- [ ] Essayer de sélectionner une image
- **Résultat attendu :** Message d'erreur demandant les permissions

---

### 6. Synchronisation Instagram

#### Test 6.1 : Synchronisation automatique
- [ ] Configurer Instagram pour un club
- [ ] Ouvrir l'onglet Agenda
- [ ] Attendre la synchronisation automatique
- **Résultat attendu :** Nouveaux posts Instagram apparaissent (si disponibles)

#### Test 6.2 : Détection des doublons
- [ ] Synchroniser Instagram deux fois
- [ ] Vérifier qu'aucun doublon n'est créé
- **Résultat attendu :** Chaque post Instagram n'apparaît qu'une fois

---

### 7. États de Chargement

#### Test 7.1 : Chargement initial
- [ ] Ouvrir l'onglet Agenda
- [ ] Vérifier l'indicateur de chargement
- **Résultat attendu :** Spinner visible pendant le chargement

#### Test 7.2 : Chargement lors de la création
- [ ] Créer un post
- [ ] Vérifier le spinner sur le bouton "Créer"
- **Résultat attendu :** Bouton désactivé, spinner visible

#### Test 7.3 : Chargement lors de la modification
- [ ] Modifier un post
- [ ] Vérifier le spinner sur le bouton "Enregistrer"
- **Résultat attendu :** Bouton désactivé, spinner visible

#### Test 7.4 : Chargement lors de l'upload d'image
- [ ] Sélectionner une image
- [ ] Vérifier le spinner pendant l'upload
- **Résultat attendu :** Spinner visible, bouton désactivé

---

### 8. Gestion des Erreurs

#### Test 8.1 : Erreur réseau lors de la création
- [ ] Couper la connexion internet
- [ ] Essayer de créer un post
- **Résultat attendu :** Message d'erreur approprié

#### Test 8.2 : Erreur lors de la modification
- [ ] Couper la connexion internet
- [ ] Essayer de modifier un post
- **Résultat attendu :** Message d'erreur approprié

#### Test 8.3 : Erreur lors de la suppression
- [ ] Couper la connexion internet
- [ ] Essayer de supprimer un post
- **Résultat attendu :** Message d'erreur approprié

#### Test 8.4 : Erreur lors de l'upload d'image
- [ ] Essayer d'uploader une image très volumineuse
- **Résultat attendu :** Message d'erreur approprié

---

### 9. Interface Utilisateur

#### Test 9.1 : Modal de création
- [ ] Vérifier que le modal s'ouvre correctement
- [ ] Vérifier que tous les champs sont présents
- [ ] Vérifier le design et la disposition
- **Résultat attendu :** Modal bien formaté, tous les éléments visibles

#### Test 9.2 : Modal de modification
- [ ] Vérifier que le modal s'ouvre avec les données pré-remplies
- [ ] Vérifier que tous les champs sont éditables
- **Résultat attendu :** Modal identique au modal de création, données pré-remplies

#### Test 9.3 : Boutons d'action
- [ ] Vérifier que les boutons Modifier/Supprimer sont visibles
- [ ] Vérifier leur style et positionnement
- **Résultat attendu :** Boutons bien visibles, styles cohérents

#### Test 9.4 : Responsive design
- [ ] Tester sur différentes tailles d'écran
- [ ] Vérifier que tout s'affiche correctement
- **Résultat attendu :** Interface adaptée à toutes les tailles

---

### 10. Performance

#### Test 10.1 : Chargement de nombreux posts
- [ ] Créer 20+ posts
- [ ] Vérifier le temps de chargement
- **Résultat attendu :** Chargement rapide, pas de lag

#### Test 10.2 : Scroll fluide
- [ ] Scroller dans la liste de posts
- [ ] Vérifier la fluidité
- **Résultat attendu :** Scroll fluide, pas de saccades

---

## 📋 Checklist de Test Rapide

### Tests Critiques (À faire en priorité)
- [ ] **Créer un post simple** (Test 1.1)
- [ ] **Modifier un post** (Test 2.1)
- [ ] **Supprimer un post** (Test 3.1)
- [ ] **Créer un post avec image** (Test 1.2)
- [ ] **Modifier l'image d'un post** (Test 2.3)

### Tests Fonctionnels
- [ ] Validation des champs (Test 1.4, 2.5)
- [ ] Annulation des actions (Test 1.5, 2.6, 3.2)
- [ ] Affichage des posts (Test 4.1, 4.2)
- [ ] Gestion des images (Test 5.1, 5.2, 5.3)

### Tests d'Intégration
- [ ] Synchronisation Instagram (Test 6.1, 6.2)
- [ ] États de chargement (Test 7.1, 7.2, 7.3)
- [ ] Gestion des erreurs (Test 8.1, 8.2, 8.3)

---

## 🐛 Bugs Potentiels à Vérifier

1. **Double soumission** : Vérifier qu'on ne peut pas créer/modifier deux fois rapidement
2. **États non réinitialisés** : Vérifier que les champs sont bien vidés après création/modification
3. **Images non supprimées** : Vérifier que supprimer une image dans le modal fonctionne
4. **Permissions** : Vérifier la gestion des permissions galerie
5. **Connexion perdue** : Vérifier le comportement si la connexion est perdue pendant une action

---

## ✅ Critères de Succès

Toutes les fonctionnalités sont considérées comme fonctionnelles si :

1. ✅ **Création** : Un post peut être créé avec titre, contenu et image
2. ✅ **Modification** : Un post peut être modifié (titre, contenu, image)
3. ✅ **Suppression** : Un post peut être supprimé avec confirmation
4. ✅ **Affichage** : Tous les posts s'affichent correctement
5. ✅ **Validation** : Les champs obligatoires sont validés
6. ✅ **Erreurs** : Les erreurs sont gérées et affichées correctement
7. ✅ **UX** : L'interface est intuitive et réactive

---

## 📝 Notes de Test

**Date de test :** _______________
**Testeur :** _______________
**Version testée :** 3.0.0
**Plateforme :** iOS / Android / Les deux

**Résultats :**
- Tests réussis : ___ / ___
- Bugs trouvés : ___
- Commentaires : _______________

---

*Document créé pour la version 3.0.0*

