# Configuration R8/ProGuard et Fichier de Désobscurcissement

## Vue d'ensemble

R8/ProGuard est maintenant activé pour les builds de production Android. Cela permet de :
- ✅ Réduire la taille de l'application
- ✅ Améliorer les performances
- ✅ Obscurcir le code pour la sécurité
- ✅ Générer un fichier de mapping pour le débogage

## Configuration

### Fichiers modifiés

1. **`android/gradle.properties`**
   - `android.enableMinifyInReleaseBuilds=true` - Active R8/ProGuard
   - `android.enableShrinkResourcesInReleaseBuilds=true` - Active la réduction des ressources

2. **`android/app/build.gradle`**
   - Utilise `proguard-android-optimize.txt` pour une optimisation maximale
   - Génère automatiquement le fichier de mapping lors des builds release

3. **`android/app/proguard-rules.pro`**
   - Règles ProGuard pour React Native, Expo, et react-native-reanimated
   - Empêche l'obscurcissement des classes nécessaires au fonctionnement de l'app

## Fichier de Mapping

### Qu'est-ce que le fichier de mapping ?

Le fichier de mapping (`mapping.txt`) est généré automatiquement par R8 lors du build. Il permet de :
- Désobscurcir les stack traces de plantages
- Déboguer les ANR (Application Not Responding)
- Analyser les rapports de plantages dans Google Play Console

### Localisation du fichier

Lors d'un build local, le fichier se trouve à :
```
android/app/build/outputs/mapping/release/mapping.txt
```

### Avec EAS Build

1. **Télécharger les artefacts de build**
   ```bash
   npx eas build:download [BUILD_ID] --platform android
   ```
   
   Ou depuis le dashboard EAS :
   - Allez sur https://expo.dev
   - Ouvrez votre projet
   - Cliquez sur le build de production Android
   - Téléchargez les artefacts de build

2. **Localiser le fichier de mapping**
   Dans les artefacts téléchargés, le fichier se trouve à :
   ```
   android/app/build/outputs/mapping/release/mapping.txt
   ```

### Téléverser le fichier de mapping à Google Play Console

1. **Via l'interface Google Play Console** (recommandé)
   - Allez dans Google Play Console
   - Sélectionnez votre application
   - Allez dans **Version** > **Production** (ou la piste appropriée)
   - Cliquez sur la version de l'application
   - Dans la section **App Bundle Explorer**, cliquez sur **Téléverser le fichier de mapping**
   - Sélectionnez le fichier `mapping.txt`

2. **Via l'API Google Play**
   Si vous utilisez `eas submit`, le fichier de mapping devrait être automatiquement inclus si configuré correctement.

## Vérification

### Vérifier que R8 est activé

Après un build de production, vérifiez que :
1. Le fichier `mapping.txt` est généré
2. La taille de l'AAB est réduite (comparée à un build sans R8)
3. Google Play Console n'affiche plus l'avertissement sur le fichier de désobscurcissement

### Tester l'obscurcissement

1. Build de production :
   ```bash
   npx eas build --platform android --profile production
   ```

2. Vérifiez que le fichier de mapping est généré dans les artefacts

3. Testez l'application pour vous assurer qu'elle fonctionne correctement avec l'obscurcissement activé

## Dépannage

### L'application plante après activation de R8

Si l'application plante après avoir activé R8, cela signifie qu'une classe nécessaire a été supprimée ou obscurcie. Ajoutez des règles dans `android/app/proguard-rules.pro` :

```proguard
# Exemple : garder une classe spécifique
-keep class com.votre.package.VotreClasse { *; }

# Exemple : garder toutes les classes d'un package
-keep class com.votre.package.** { *; }
```

### Le fichier de mapping n'est pas généré

Vérifiez que :
1. `android.enableMinifyInReleaseBuilds=true` est dans `gradle.properties`
2. Le build est en mode `release` (pas `debug`)
3. `minifyEnabled` est `true` dans `build.gradle`

### Google Play Console affiche toujours l'avertissement

1. Vérifiez que le fichier `mapping.txt` a été téléversé
2. Assurez-vous que le fichier correspond à la version exacte de l'AAB
3. Attendez quelques minutes pour que Google Play Console traite le fichier

## Notes importantes

- ⚠️ **Conservez toujours le fichier de mapping** pour chaque version publiée. Vous en aurez besoin pour déboguer les plantages en production.
- ⚠️ **Ne partagez jamais le fichier de mapping publiquement** - il contient des informations sur la structure de votre code.
- ✅ Le fichier de mapping est unique pour chaque build - chaque version de l'app a son propre fichier de mapping.

## Références

- [Documentation Android R8](https://developer.android.com/studio/build/shrink-code)
- [Documentation ProGuard](https://www.guardsquare.com/manual/configuration/usage)
- [Documentation EAS Build](https://docs.expo.dev/build/introduction/)



