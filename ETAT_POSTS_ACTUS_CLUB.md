# 📝 État Actuel des Posts/Actus du Club - Détails Techniques

## ✅ Ce qui est implémenté

### 1. Infrastructure de base de données

#### Table `club_posts`
La table est complètement créée avec toutes les colonnes nécessaires :

```sql
CREATE TABLE club_posts (
  id UUID PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES clubs(id),
  title TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES profiles(id),
  source TEXT DEFAULT 'manual',           -- 'manual' ou 'instagram'
  instagram_post_id TEXT,                 -- ID du post Instagram original
  instagram_permalink TEXT                 -- Lien vers le post Instagram
);
```

**Index créés :**
- `idx_club_posts_club_id` - Pour les requêtes par club
- `idx_club_posts_created_at` - Pour le tri chronologique
- `idx_club_posts_source` - Pour filtrer par source
- `idx_club_posts_instagram_post_id` - Pour éviter les doublons Instagram

**Politiques RLS (Row Level Security) :**
- ✅ **SELECT** : Tout le monde peut voir les posts (publics)
- ✅ **INSERT** : Seuls les club_managers du club peuvent créer
- ✅ **UPDATE** : Seuls les club_managers du club peuvent modifier
- ✅ **DELETE** : Seuls les club_managers du club peuvent supprimer

### 2. Fonctionnalités de création

#### Dans `app/clubs/[id]/agenda.js`
**Implémenté :**
- ✅ Modal de création de post
- ✅ Formulaire avec :
  - Titre (obligatoire)
  - Contenu (optionnel)
  - Image (upload vers Supabase Storage)
  - Option "Post Instagram" avec lien
- ✅ Upload d'images vers `club-assets` bucket
- ✅ Support des posts manuels et Instagram
- ✅ Validation des champs
- ✅ Rechargement automatique après création

**Code de création :**
```javascript
const postData = {
  club_id: clubId,
  title: newPostTitle.trim(),
  content: newPostContent.trim() || null,
  image_url: newPostImageUrl || null,
  source: newPostIsInstagram ? 'instagram' : 'manual',
  created_by: user.id,
};
```

### 3. Affichage des posts

#### Dans `app/clubs/[id]/agenda.js`
**Implémenté :**
- ✅ Liste des posts du club (limite 20, triés par date décroissante)
- ✅ Affichage avec :
  - Titre
  - Contenu
  - Image (si présente)
  - Badge "Instagram" pour les posts Instagram
  - Lien "Voir sur Instagram" pour les posts Instagram
- ✅ Compteur de posts dans le titre de section
- ✅ Message "Aucun post" si vide

#### Dans `app/clubs/[id]/index.js` (page publique)
**Implémenté :**
- ✅ Affichage des 5 derniers posts sur la page publique du club
- ✅ Affichage basique (titre, contenu, image, date)

### 4. Synchronisation Instagram

#### Dans `lib/instagram-sync.js`
**Implémenté :**
- ✅ Fonction `syncInstagramPosts(clubId)` pour synchroniser les posts Instagram
- ✅ Récupération des posts depuis l'API Instagram Graph
- ✅ Conversion au format `club_posts`
- ✅ Détection des doublons (via `instagram_post_id`)
- ✅ Insertion des nouveaux posts uniquement

#### Dans `app/clubs/[id]/agenda.js`
**Implémenté :**
- ✅ Synchronisation automatique au chargement de l'écran
- ✅ Vérification si Instagram est configuré
- ✅ Synchronisation uniquement si dernière sync > 6 heures
- ✅ Rechargement automatique après sync

### 5. Gestion des images

**Implémenté :**
- ✅ Upload vers Supabase Storage (bucket `club-assets`)
- ✅ Chemin : `club-posts/{clubId}/{timestamp}.jpg`
- ✅ Aperçu avant upload
- ✅ Suppression de l'image avant envoi
- ✅ Support des formats : JPEG, PNG, WebP

---

## ❌ Ce qui manque / n'est pas complètement implémenté

### 1. Modification des posts existants

**État actuel :**
- ❌ Aucune interface pour modifier un post existant
- ❌ Pas de bouton "Modifier" sur les posts
- ❌ Pas de modal d'édition
- ✅ Les permissions RLS permettent la modification (UPDATE policy existe)

**Ce qui devrait être ajouté :**
```javascript
// Fonction manquante dans agenda.js
const handleEditPost = async (postId) => {
  // Ouvrir modal avec données pré-remplies
  // Permettre modification titre, contenu, image
  // Sauvegarder avec UPDATE
};
```

**Interface manquante :**
- Bouton "Modifier" sur chaque post (visible uniquement pour le club_manager)
- Modal d'édition similaire au modal de création
- Pré-remplissage des champs avec les données existantes
- Gestion de la mise à jour de l'image (garder l'ancienne ou uploader une nouvelle)

### 2. Suppression des posts

**État actuel :**
- ❌ Aucune interface pour supprimer un post
- ❌ Pas de bouton "Supprimer" sur les posts
- ❌ Pas de confirmation avant suppression
- ✅ Les permissions RLS permettent la suppression (DELETE policy existe)

**Ce qui devrait être ajouté :**
```javascript
// Fonction manquante dans agenda.js
const handleDeletePost = async (postId) => {
  Alert.alert(
    "Supprimer le post",
    "Êtes-vous sûr de vouloir supprimer ce post ?",
    [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          await supabase.from('club_posts').delete().eq('id', postId);
          loadPosts();
        }
      }
    ]
  );
};
```

**Interface manquante :**
- Bouton "Supprimer" sur chaque post (visible uniquement pour le club_manager)
- Confirmation avant suppression
- Suppression de l'image du Storage si nécessaire (optionnel)

### 3. Gestion avancée des posts

**Fonctionnalités manquantes :**

#### a) Publication/Ébauche
- ❌ Pas de statut de publication (publié/brouillon)
- ❌ Pas de date de publication programmée
- ❌ Pas de visibilité (public/privé)

**Colonnes à ajouter :**
```sql
ALTER TABLE club_posts
  ADD COLUMN status TEXT DEFAULT 'published',  -- 'published', 'draft'
  ADD COLUMN published_at TIMESTAMPTZ,
  ADD COLUMN scheduled_at TIMESTAMPTZ,
  ADD COLUMN visibility TEXT DEFAULT 'public';  -- 'public', 'members_only'
```

#### b) Catégorisation
- ❌ Pas de catégories pour les posts
- ❌ Pas de tags

**Colonnes à ajouter :**
```sql
ALTER TABLE club_posts
  ADD COLUMN category TEXT,  -- 'news', 'event', 'promotion', etc.
  ADD COLUMN tags TEXT[];    -- Tableau de tags
```

#### c) Statistiques
- ❌ Pas de compteur de vues
- ❌ Pas de compteur de likes/réactions
- ❌ Pas d'analytics

**Colonnes à ajouter :**
```sql
ALTER TABLE club_posts
  ADD COLUMN view_count INTEGER DEFAULT 0,
  ADD COLUMN like_count INTEGER DEFAULT 0;
```

### 4. Interface de gestion dédiée

**État actuel :**
- Les posts sont gérés dans l'onglet "Agenda" (`agenda.js`)
- Pas d'onglet dédié "Actualités" ou "Posts"

**Ce qui pourrait être amélioré :**
- Créer un écran dédié `app/clubs/[id]/posts.js` ou `app/clubs/[id]/actualites.js`
- Interface plus complète avec :
  - Liste complète des posts (pagination)
  - Filtres (par date, source, statut)
  - Recherche
  - Actions en masse (supprimer plusieurs posts)

### 5. Affichage public amélioré

**Dans `app/clubs/[id]/index.js` :**
- ✅ Affichage basique des 5 derniers posts
- ❌ Pas de pagination pour voir plus de posts
- ❌ Pas de vue détaillée d'un post
- ❌ Pas de partage d'un post
- ❌ Pas de lien vers la page complète des actualités

**Améliorations possibles :**
- Bouton "Voir toutes les actualités"
- Page dédiée `/clubs/[id]/actualites` pour les visiteurs
- Vue détaillée d'un post avec partage
- Intégration avec les réseaux sociaux

### 6. Notifications pour nouveaux posts

**État actuel :**
- ❌ Pas de notification automatique aux membres quand un nouveau post est créé
- ❌ Pas d'option pour envoyer une notification push avec le post

**Ce qui pourrait être ajouté :**
- Option dans le formulaire de création : "Notifier les membres"
- Création automatique d'une `club_notification` liée au post
- Notification push avec titre et aperçu du post

### 7. Gestion des images

**Améliorations possibles :**
- ❌ Pas de redimensionnement automatique des images
- ❌ Pas de compression optimale
- ❌ Pas de gestion des images multiples par post
- ❌ Pas de galerie d'images

**Colonnes à ajouter :**
```sql
ALTER TABLE club_posts
  ADD COLUMN images TEXT[];  -- Tableau d'URLs pour plusieurs images
```

### 8. Modération et validation

**Fonctionnalités manquantes :**
- ❌ Pas de système de modération
- ❌ Pas de validation avant publication
- ❌ Pas de commentaires sur les posts

---

## 📋 Résumé des fonctionnalités

| Fonctionnalité | État | Priorité |
|----------------|------|----------|
| **Création de posts** | ✅ Implémenté | - |
| **Upload d'images** | ✅ Implémenté | - |
| **Affichage liste** | ✅ Implémenté | - |
| **Synchronisation Instagram** | ✅ Implémenté | - |
| **Modification posts** | ❌ Manquant | 🔴 Haute |
| **Suppression posts** | ❌ Manquant | 🔴 Haute |
| **Statuts (publié/brouillon)** | ❌ Manquant | 🟡 Moyenne |
| **Catégorisation** | ❌ Manquant | 🟡 Moyenne |
| **Pagination** | ❌ Manquant | 🟡 Moyenne |
| **Recherche/Filtres** | ❌ Manquant | 🟢 Basse |
| **Notifications nouveaux posts** | ❌ Manquant | 🟡 Moyenne |
| **Vue détaillée post** | ❌ Manquant | 🟡 Moyenne |
| **Partage posts** | ❌ Manquant | 🟢 Basse |
| **Statistiques** | ❌ Manquant | 🟢 Basse |
| **Images multiples** | ❌ Manquant | 🟢 Basse |

---

## 🎯 Recommandations d'implémentation

### Phase 1 - Priorité Haute (Fonctionnalités essentielles)

1. **Ajouter modification de posts**
   - Ajouter bouton "Modifier" sur chaque post
   - Créer modal d'édition
   - Implémenter fonction `handleEditPost`

2. **Ajouter suppression de posts**
   - Ajouter bouton "Supprimer" sur chaque post
   - Ajouter confirmation avant suppression
   - Implémenter fonction `handleDeletePost`

### Phase 2 - Priorité Moyenne (Améliorations UX)

3. **Améliorer l'affichage**
   - Ajouter pagination
   - Créer vue détaillée d'un post
   - Ajouter bouton "Voir toutes les actualités"

4. **Ajouter notifications**
   - Option "Notifier les membres" lors de la création
   - Notification push automatique

### Phase 3 - Priorité Basse (Fonctionnalités avancées)

5. **Statuts et catégories**
   - Ajouter colonnes `status`, `category`
   - Interface de filtrage

6. **Statistiques**
   - Compteurs de vues
   - Analytics basiques

---

## 💻 Code d'exemple pour les fonctionnalités manquantes

### Modification d'un post

```javascript
// Dans agenda.js
const [editingPost, setEditingPost] = useState(null);
const [editPostTitle, setEditPostTitle] = useState("");
const [editPostContent, setEditPostContent] = useState("");
const [editPostImageUrl, setEditPostImageUrl] = useState("");

const handleEditPost = (post) => {
  setEditingPost(post);
  setEditPostTitle(post.title);
  setEditPostContent(post.content || "");
  setEditPostImageUrl(post.image_url || "");
  setEditPostModalVisible(true);
};

const handleUpdatePost = async () => {
  if (!editingPost || !editPostTitle.trim()) return;
  
  try {
    const { error } = await supabase
      .from('club_posts')
      .update({
        title: editPostTitle.trim(),
        content: editPostContent.trim() || null,
        image_url: editPostImageUrl || null,
      })
      .eq('id', editingPost.id);
    
    if (error) throw error;
    
    Alert.alert("Succès", "Post modifié avec succès");
    setEditPostModalVisible(false);
    loadPosts();
  } catch (error) {
    Alert.alert("Erreur", error.message);
  }
};
```

### Suppression d'un post

```javascript
// Dans agenda.js
const handleDeletePost = (postId) => {
  Alert.alert(
    "Supprimer le post",
    "Êtes-vous sûr de vouloir supprimer ce post ? Cette action est irréversible.",
    [
      { text: "Annuler", style: "cancel" },
      {
        text: "Supprimer",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('club_posts')
              .delete()
              .eq('id', postId);
            
            if (error) throw error;
            
            Alert.alert("Succès", "Post supprimé");
            loadPosts();
          } catch (error) {
            Alert.alert("Erreur", error.message);
          }
        }
      }
    ]
  );
};
```

### Ajout des boutons dans l'affichage

```javascript
// Dans la liste des posts (agenda.js)
{posts.map((post) => (
  <View key={post.id} style={styles.postCard}>
    {/* ... contenu du post ... */}
    
    {/* Actions pour le club manager */}
    <View style={styles.postActions}>
      <TouchableOpacity
        style={styles.editButton}
        onPress={() => handleEditPost(post)}
      >
        <Ionicons name="pencil" size={18} color={BRAND} />
        <Text style={styles.editButtonText}>Modifier</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeletePost(post.id)}
      >
        <Ionicons name="trash" size={18} color="#ef4444" />
        <Text style={styles.deleteButtonText}>Supprimer</Text>
      </TouchableOpacity>
    </View>
  </View>
))}
```

---

## 📝 Conclusion

**État actuel :**
- ✅ Infrastructure complète (table, RLS, index)
- ✅ Création de posts fonctionnelle
- ✅ Affichage basique fonctionnel
- ✅ Synchronisation Instagram opérationnelle

**Manques principaux :**
- ❌ Modification de posts (interface manquante)
- ❌ Suppression de posts (interface manquante)
- ❌ Fonctionnalités avancées (statuts, catégories, etc.)

**Recommandation :**
Implémenter en priorité la modification et la suppression des posts, car ce sont des fonctionnalités essentielles pour une gestion complète. Les autres fonctionnalités peuvent être ajoutées progressivement selon les besoins.

