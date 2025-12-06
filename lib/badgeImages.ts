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

export function getBadgeImage(badgeCode: string, unlocked: boolean): ImageSourcePropType | null {
  // Si vous avez des variantes locked/unlocked
  if (!unlocked) {
    const lockedImage = BADGE_IMAGES[`${badgeCode}_locked`];
    if (lockedImage) return lockedImage;
  }
  
  // Image normale
  return BADGE_IMAGES[badgeCode] || null;
}