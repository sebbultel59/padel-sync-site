# Android 15 – API bord à bord (edge-to-edge) dépréciées

## Recommandation Play Console

Google signale l’utilisation d’API ou paramètres obsolètes pour l’affichage bord à bord :

- `Window.getStatusBarColor` / `setStatusBarColor`
- `Window.getNavigationBarColor` / `getNavigationBarColor`
- `LAYOUT_IN_DISPLAY_CUTOUT_MODE_*`

## Ce qui a été fait dans le projet

1. **Thème Android 15+** (`res/values-v35/styles.xml`)
   - Sur API 35+, le thème de l’app utilise `android:windowOptOutEdgeToEdgeEnforcement=true` (opt-out temporaire edge-to-edge).
   - Le thème n’utilise plus `statusBarColor` ni `navigationBarColor` sur API 35+ (dépréciés et sans effet).

2. **Activité ML Kit** (`AndroidManifest.xml`)
   - Surcharge de `GmsBarcodeScanningDelegateActivity` avec `screenOrientation="unspecified"` pour les grands écrans.

## D’où viennent encore les avertissements

Les **emplaces** indiqués par la Play Console sont dans des **dépendances**, pas dans le code de l’app :

| Emplacement | Origine |
|------------|---------|
| `com.facebook.react.modules.statusbar.StatusBarModule` | React Native |
| `com.facebook.react.views.view.WindowUtilKt` | React Native |
| `com.swmansion.rnscreens.ScreenWindowTraits` | react-native-screens |
| `expo.modules.devlauncher.*` / `expo.modules.imagepicker.*` | Expo |
| `com.google.android.material.*` | Material Design |
| `androidx.activity.EdgeToEdgeApi28` | AndroidX Activity |

On ne peut pas modifier ces librairies depuis le projet. La disparition complète du message Play Console viendra des mises à jour **React Native**, **Expo SDK** et **react-native-screens** qui passeront aux nouvelles API (`WindowInsetsController`, etc.).

## À faire de votre côté

- Garder **Expo** et **react-native-screens** à jour (Expo SDK 55+ et futures versions apporteront des corrections).
- Consulter les release notes Expo / React Native pour les mentions “Android 15”, “edge-to-edge”, “WindowInsetsController”.
- L’app reste **compatible** : les anciennes API fonctionnent encore sur Android 15, Google prépare la transition pour les versions suivantes.

## Références

- [React Native #51928 – Status Bar Android 15+](https://github.com/facebook/react-native/issues/51928)
- [Android – Edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge-manually)
