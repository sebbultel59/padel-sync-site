// lib/badgeSharing.ts
// Fonctions utilitaires pour partager les badges

import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import type { PlayerBadge } from "../hooks/usePlayerBadges";

/**
 * Capture une vue et la partage via le système natif
 * 
 * @param viewRef - Référence React Native de la vue à capturer
 * @param badge - Badge à partager
 * @param playerPseudo - Pseudo du joueur
 * @param level - Niveau du joueur
 * 
 * @example
 * ```tsx
 * import { useRef } from 'react';
 * import { View } from 'react-native';
 * import { ShareableBadgeCard } from '../components/ShareableBadgeCard';
 * import { captureBadgeCardAndShare } from '../lib/badgeSharing';
 * 
 * function MyComponent() {
 *   const viewRef = useRef<View>(null);
 *   
 *   const handleShare = async () => {
 *     await captureBadgeCardAndShare(
 *       viewRef,
 *       badge,
 *       playerPseudo,
 *       level
 *     );
 *   };
 *   
 *   return (
 *     <View ref={viewRef} collapsable={false}>
 *       <ShareableBadgeCard {...props} />
 *     </View>
 *   );
 * }
 * ```
 */
export async function captureBadgeCardAndShare(
  viewRef: React.RefObject<any>,
  badge: PlayerBadge,
  playerPseudo: string,
  level: number
): Promise<void> {
  try {
    // Vérifier que la vue est disponible
    if (!viewRef.current) {
      throw new Error("La vue à capturer n'est pas disponible");
    }

    // Vérifier que le partage est disponible
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error("Le partage n'est pas disponible sur cet appareil");
    }

    // TODO: Implémenter la capture d'écran avec react-native-view-shot
    // 
    // Étape 1: Capturer la vue en image
    // const uri = await captureRef(viewRef, {
    //   format: "png",
    //   quality: 1.0,
    //   result: "tmpfile", // ou "base64" selon les besoins
    // });
    //
    // Étape 2: Partager l'image
    // await Sharing.shareAsync(uri, {
    //   mimeType: "image/png",
    //   dialogTitle: `Partager le badge ${badge.label}`,
    // });

    // Pour l'instant, on retourne une erreur indiquant que c'est à implémenter
    throw new Error(
      "La capture d'écran n'est pas encore implémentée. " +
      "Installez react-native-view-shot et décommentez le code dans lib/badgeSharing.ts"
    );
  } catch (error) {
    console.error("[badgeSharing] Erreur lors du partage:", error);
    throw error;
  }
}

/**
 * Alternative: Partager via le système de partage natif sans capture d'écran
 * Partage uniquement le texte du badge
 */
export async function shareBadgeText(
  badge: PlayerBadge,
  playerPseudo: string,
  level: number
): Promise<void> {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error("Le partage n'est pas disponible sur cet appareil");
    }

    const message = `🏆 ${badge.label}\n\n` +
      `Débloqué par ${playerPseudo} (Niveau ${level})\n` +
      `${badge.description || ""}\n\n` +
      `Partagé depuis Padel Sync`;

    // Note: Sharing.shareAsync nécessite un fichier URI
    // Pour partager du texte, utilisez plutôt le Share API de React Native
    // import { Share } from 'react-native';
    // await Share.share({ message });

    throw new Error(
      "Utilisez React Native Share API pour partager du texte. " +
      "Voir la documentation dans lib/badgeSharing.ts"
    );
  } catch (error) {
    console.error("[badgeSharing] Erreur lors du partage texte:", error);
    throw error;
  }
}

/**
 * Instructions pour implémenter le partage complet:
 * 
 * 1. Installer les dépendances:
 *    npx expo install expo-sharing react-native-view-shot
 * 
 * 2. Dans le composant qui utilise ShareableBadgeCard:
 *    - Créer une ref: const viewRef = useRef<View>(null);
 *    - Passer la ref au View qui contient ShareableBadgeCard
 *    - Appeler captureBadgeCardAndShare avec la ref
 * 
 * 3. Décommenter le code dans captureBadgeCardAndShare
 * 
 * 4. Optionnel: Ajouter des permissions pour l'accès au stockage
 *    (généralement géré automatiquement par expo-sharing)
 */


