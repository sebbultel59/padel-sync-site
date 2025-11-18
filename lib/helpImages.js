// lib/helpImages.js
// Mapping des images pour l'aide et le tutoriel
// Les images doivent être placées dans assets/help/

export const HELP_IMAGES = {
  // Pour le modal d'aide - section Matchs
  matches: {
    'matchs-possibles': require('../assets/help/matchs-possibles.webp'),
    'matchs-confirmer': require('../assets/help/matchs-confirmer.webp'),
    'matchs-valides': require('../assets/help/matchs-valides.webp'),
    'filtres': [require('../assets/help/filtres-1.webp'), require('../assets/help/filtres-2.webp')],
    'match-eclair': require('../assets/help/match-eclair.webp'),
    'matchs-en-feu': require('../assets/help/matchs-en-feu.webp'),
  },
  
  // Pour le modal d'aide - section Disponibilités
  disponibilites: {
    'gerer-dispos': require('../assets/help/gerer-dispos.webp'),
    'application-plusieurs-jours': require('../assets/help/application-plusieurs-jours.webp'),
    'mode-global-vs-groupe': require('../assets/help/mode-global-vs-groupe.webp'),
  },
  
  // Pour le modal d'aide - section Groupes
  groupes: {
    'creer-groupe': require('../assets/help/creer-groupe.webp'),
    'rejoindre-groupe': require('../assets/help/rejoindre-groupe.webp'),
    'gerer-membres': require('../assets/help/gerer-membres.webp'),
    'groupe-actif': require('../assets/help/groupe-actif.webp'),
  },
  
  // Pour le modal d'aide - section Profil
  profil: {
    'informations-personnelles': require('../assets/help/informations-personnelles.webp'),
    'classement': require('../assets/help/classement.webp'),
    'photo-profil': require('../assets/help/photo-profil.webp'),
  },
  
  // Pour le modal d'aide - section Notifications
  notifications: {
    'types-notifications': require('../assets/help/types-notifications.webp'),
    'gerer-notifications': require('../assets/help/gerer-notifications.webp'),
  },
  
  // Pour le tutoriel interactif
  tutorial: {
    'matchs': require('../assets/help/tutorial-matchs.webp'),
    'flash': require('../assets/help/tutorial-flash.webp'),
  }
};

// Fonction helper pour récupérer une image d'aide
export function getHelpImage(section, key) {
  if (!HELP_IMAGES[section] || !HELP_IMAGES[section][key]) {
    return null;
  }
  const image = HELP_IMAGES[section][key];
  // Si c'est un array, retourner le premier élément (ou gérer le carrousel)
  return Array.isArray(image) ? image[0] : image;
}

// Fonction helper pour récupérer toutes les images d'une clé (pour les galeries)
export function getHelpImages(section, key) {
  if (!HELP_IMAGES[section] || !HELP_IMAGES[section][key]) {
    return [];
  }
  const image = HELP_IMAGES[section][key];
  return Array.isArray(image) ? image : [image];
}

// Fonction helper pour récupérer une image de tutoriel
export function getTutorialImage(stepName) {
  if (!HELP_IMAGES.tutorial || !HELP_IMAGES.tutorial[stepName]) {
    return null;
  }
  return HELP_IMAGES.tutorial[stepName];
}




