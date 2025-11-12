// lib/helpImages.js
// Mapping des images pour l'aide et le tutoriel
// Les images doivent être placées dans assets/help/

export const HELP_IMAGES = {
  // Pour le modal d'aide - section Matchs
  matches: {
    'matchs-possibles': require('../assets/help/matchs-possibles.png'),
    'matchs-confirmer': require('../assets/help/matchs-confirmer.png'),
    'matchs-valides': require('../assets/help/matchs-valides.png'),
    'filtres': [require('../assets/help/filtres-1.png'), require('../assets/help/filtres-2.png')],
    'match-eclair': require('../assets/help/match-eclair.png'),
    'matchs-en-feu': require('../assets/help/matchs-en-feu.png'),
  },
  
  // Pour le modal d'aide - section Disponibilités
  disponibilites: {
    'gerer-dispos': require('../assets/help/gerer-dispos.png'),
    'application-plusieurs-jours': require('../assets/help/application-plusieurs-jours.png'),
    'mode-global-vs-groupe': require('../assets/help/mode-global-vs-groupe.png'),
  },
  
  // Pour le modal d'aide - section Groupes
  groupes: {
    'creer-groupe': require('../assets/help/creer-groupe.png'),
    'rejoindre-groupe': require('../assets/help/rejoindre-groupe.png'),
    'gerer-membres': require('../assets/help/gerer-membres.png'),
    'groupe-actif': require('../assets/help/groupe-actif.png'),
  },
  
  // Pour le modal d'aide - section Profil
  profil: {
    'informations-personnelles': require('../assets/help/informations-personnelles.png'),
    'classement': require('../assets/help/classement.png'),
    'photo-profil': require('../assets/help/photo-profil.png'),
  },
  
  // Pour le modal d'aide - section Notifications
  notifications: {
    'types-notifications': require('../assets/help/types-notifications.png'),
    'gerer-notifications': require('../assets/help/gerer-notifications.png'),
  },
  
  // Pour le tutoriel interactif
  tutorial: {
    'matchs': require('../assets/help/tutorial-matchs.png'),
    'flash': require('../assets/help/tutorial-flash.png'),
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




