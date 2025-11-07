# Guide d'intégration du tutoriel Copilot

## État actuel

✅ Structure de base créée :
- `components/CopilotTutorial.js` : Provider et composants personnalisés
- `lib/copilotSteps.js` : Configuration des 6 étapes
- Bouton "Revoir le tuto" ajouté dans l'onglet Profil
- Provider intégré dans `app/(tabs)/_layout.js`

## Étapes à intégrer

Pour que le tutoriel fonctionne, il faut ajouter les références `CopilotStep` aux éléments suivants :

### 1. Onglet Groupes (tabBar)
**Fichier** : `app/(tabs)/_layout.js`
**Cible** : `copilot-groupes-tab`
**Emplacement** : Dans le `tabBarIcon` pour la route `groupes`

### 2. Bouton "Rejoindre un groupe"
**Fichier** : `app/(tabs)/groupes.js`
**Cible** : `copilot-join-group-btn`
**Emplacement** : Ligne ~1543, bouton "Rejoindre un groupe"

### 3. Onglet Dispos (tabBar)
**Fichier** : `app/(tabs)/_layout.js`
**Cible** : `copilot-dispos-tab`
**Emplacement** : Dans le `tabBarIcon` pour la route `semaine`

### 4. Onglet Matchs (tabBar)
**Fichier** : `app/(tabs)/_layout.js`
**Cible** : `copilot-matchs-tab`
**Emplacement** : Dans le `tabBarIcon` pour la route `matches`

### 5. Icône matchs en feu
**Fichier** : `app/(tabs)/matches/index.js`
**Cible** : `copilot-hot-match-icon`
**Emplacement** : Ligne ~5044, Pressable avec l'icône 🔥

### 6. Icône Notifications (header)
**Fichier** : `app/(tabs)/_layout.js`
**Cible** : `copilot-notifications-icon`
**Emplacement** : Ligne ~216, Pressable avec l'icône notifications

## Comment ajouter les références

Pour chaque élément, il faut :
1. Importer `CopilotStep` depuis `react-native-copilot`
2. Envelopper l'élément avec `<CopilotStep name="nom-de-l-etape">...</CopilotStep>`

Exemple pour le bouton "Rejoindre un groupe" :
```jsx
import { CopilotStep } from "react-native-copilot";

<CopilotStep name="step2_rejoindre" text="Rejoindre un groupe">
  <Pressable 
    onPress={press("join-group", () => setJoinModalVisible(true))} 
    style={[...]}
  >
    <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
    <Text style={[s.btnTxt, { fontSize: 13 }]}>Rejoindre un groupe</Text>
  </Pressable>
</CopilotStep>
```

## Notes importantes

- Les noms des étapes dans `CopilotStep` doivent correspondre aux `name` dans `lib/copilotSteps.js`
- Le tutoriel se lance automatiquement à la première ouverture (vérifié via AsyncStorage)
- Le bouton "Revoir le tuto" dans Profil permet de relancer le tutoriel à tout moment

