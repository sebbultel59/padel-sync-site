// components/HelpModal.js
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { getHelpImages } from '../lib/helpImages';

const HELP_SECTIONS = {
  matches: {
    title: 'Matchs',
    icon: 'tennisball',
    content: [
      {
        title: 'Matchs possibles',
        description: 'Découvre tous les créneaux où tu peux jouer avec d\'autres membres du groupe. Les matchs sont organisés par durée (1H30 ou 1H).\n\nSi un match t\'intéresse dans la liste, sélectionne 3 joueurs en cliquant dessus puis clic sur le bouton créer un match. Il bascule alors dans matchs à confirmer et les joueurs sélectionnés reçoivent une notification pour confirmer leur participation.',
        imageKey: 'matchs-possibles',
        tips: [
          'Utilise les filtres niveau et géographique pour affiner ta recherche',
          'Les matchs sont triés par date et heure',
        ]
      },
      {
        title: 'Matchs à confirmer',
        description: 'Les matchs où tu as été invité et où tu dois confirmer ta participation sont listés ici. A chaque confirmation d\'un joueur le tube de balle se remplit et quand les 4 joueurs ont confirmé le match bascule dans matchs validés.',
        imageKey: 'matchs-confirmer',
        tips: [
          'Accepte ou refuse rapidement pour faciliter l\'organisation',
          'Tu peux voir qui d\'autre participe au match',
          'Si tu fais un appui long sur l\'avatar d\'un joueur, tu peux voir sa fiche de profil et accéder à son numéro de téléphone s\'il l\'a renseigné.',
        ]
      },
      {
        title: 'Matchs validés',
        description: 'Tous les matchs confirmés auxquels tu participes sont listés ici. .',
        imageKey: 'matchs-valides',
        tips: [
          'Consulte les détails du match (lieu, joueurs, heure)',
          'Tu peux annuler si nécessaire',
          'Si tu fais un appui long sur l\'avatar d\'un joueur, tu peux voir sa fiche de profil et accéder à son numéro de téléphone s\'il l\'a renseigné.',
          'Si tu cliques sur appeler un club, tu vois la liste de tous les clubs à proximité avec leur numéro de téléphone',
          'Si tu as réservé une piste, tu peux cliquer sur le bouton piste non réservée pour la libérer, le match passe alors en vert avec l\'avatar du joueur qui a réservé la piste',
        ]
      },
      {
        title: 'Filtres',
        description: 'Utilise les filtres pour trouver des matchs adaptés à tes critères.',
        imageKey: 'filtres',
        tips: [
          'Filtre niveau : sélectionne les niveaux de jeu souhaités',
          'Filtre géographique : trouve des matchs près de chez toi ou de ton travail',
        ]
      },
      {
        title: 'Match éclair',
        description: 'Sur la page matchs possibles, Clique sur l\'icone éclair ⚡️ et Propose un match rapidement en 3 clics. Sélectionne 3 joueurs et un créneau puis valide. Les autres jouers sont notifiés et le match bascule dans matchs à confirmer.',
        imageKey: 'match-eclair',
        tips: [
          'Idéal pour organiser un match rapidement',
          'Les invitations sont envoyées automatiquement'
        ]
      },
      {
        title: 'Matchs en feu',
        description: 'Sur la pages matchs possibles, Clique sur la flamme 🔥 Les créneaux où 3 joueurs sont disponibles et où un match peut être organisé facilement en te rendant dispo ou en invitant un joueur pour compléter la partie..',
        imageKey: 'matchs-en-feu',
        tips: [
          'Les matchs en feu sont mis en avant',
          'Ils ont plus de chances d\'être confirmés rapidement'
        ]
      }
    ]
  },
  disponibilites: {
    title: 'Dispos',
    icon: 'calendar',
    content: [
      {
        title: 'Gérer tes disponibilités',
        description: 'Indique quand tu es disponible pour jouer. Tu peux définir tes disponibilités pour chaque jour de la semaine.',
        imageKey: 'gerer-dispos',
        tips: [
          'Clique sur un créneau pour changer son statut',
          'Disponible (vert 🟢 et balle 🎾) : tu es libre pour jouer',
          'Occupé (rouge) : tu n\'es pas disponible',
          'Le nombre de joueurs dispos dans le groupe est affiché en haut à droite de la cellule',
        ]
      },
      {
        title: 'Application sur plusieurs créneaux et plusieurs jours',
        description: 'Tu peux appliquer une disponibilité sur plusieurs créneaux et plusieurs jours en une seule fois. Fais un appui long sur la cellule de départ puis un appui long sur la cellule d\'arrivée pour sélectionner la plage horaire. Un menu s\'affiche avec les options d\'application sur plsueirus jours.',
        imageKey: 'application-plusieurs-jours',
        tips: [
          'Fais un appui long sur la cellule de départ puis un appui long sur la cellule d\'arrivée pour sélectionner la plage horaire',
          'Un menu s\'affiche avec les options d\'application sur plsueirus jours',
          'Gagne du temps pour organiser ta semaine'
        ]
      },
      {
        title: 'Mode global vs groupe',
        description: 'Tu peux définir tes disponibilités pour tous les groupes ou pour un groupe spécifique.',
        imageKey: 'mode-global-vs-groupe',
        tips: [
          'Clique sur le bouton du haut pour modifier la modalité d\'application des disponibilités',
        ]
      }
    ]
  },
  groupes: {
    title: 'Groupes',
    icon: 'people',
    content: [
      {
        title: 'Créer un groupe',
        description: 'Crée ton propre groupe de padel pour organiser des matchs avec tes amis.',
        imageKey: 'creer-groupe',
        tips: [
          'Mets un avatar et un nom à ton groupe pour le reconnaître',
          'Choisis la visibilité (public ou privé)',
          'Partage le code d\'invitation avec tes amis via un lien ou un QR code',
          'Le groupe est créé et tu peux commencer à organiser des matchs',
        ]
      },
      {
        title: 'Rejoindre un groupe',
        description: 'Rejoins un groupe existant pour jouer avec d\'autres joueurs.',
        imageKey: 'rejoindre-groupe',
        tips: [
          'Utilise le code d\'invitation ou le QR code',
          'Ou cherche un groupe public',
          'Attends la validation si le groupe est privé',
          'Si le groupe est privé, tu peux demander à rejoindre le groupe',
          'Si le groupe est public, tu peux rejoindre le groupe directement',
          'Le groupe est ajouté à ta liste de groupes et tu peux commencer à organiser des matchs',
        ]
      },
      {
        title: 'Groupe actif',
        description: 'Le groupe actif est celui utilisé par défaut pour les matchs et disponibilités.',
        imageKey: 'groupe-actif',
        tips: [
          'Tu peux changer de groupe actif à tout moment',
          'Le groupe actif est indiqué par une bordure bleue'
        ]
      },
      {
        title: 'Gérer les membres',
        description: 'En tant qu\'administrateur, tu peux gérer les membres de ton groupe.',
        imageKey: 'gerer-membres',
        tips: [
          'Ajoute ou retire des membres',
          'Gère les demandes d\'adhésion',
          'Consulte la liste des membres',
          'Si tu es admin, une icone de crayon apparaît en haut à droite de la cellule pour modifier les informations du groupe',
          'Si tu es admin, une icone couronne apparaît sur ton avatar',
        ]
      },
    ]
  },
  profil: {
    title: 'Profil',
    icon: 'person',
    content: [
      {
        title: 'Informations personnelles',
        description: 'Complète ton profil pour faciliter l\'organisation des matchs.',
        imageKey: 'informations-personnelles',
        tips: [
          'Niveau : indique ton niveau de jeu (1 à 8)',
          'Main : main droite ou gauche',
          'Côté : côté droit ou gauche du terrain',
          'Club : ton club de padel',
          'Téléphone : pour être contacté',
          'Adresses : domicile et travail pour le filtre géographique'
        ]
      },
      {
        title: 'Classement',
        description: 'Ton classement est optionnel mais peut aider à organiser des matchs équilibrés.',
        imageKey: 'classement',
        tips: [
          'Indique ton classement si tu en as un',
          'Cela aide à trouver des partenaires de niveau similaire'
        ]
      },
      {
        title: 'Photo de profil',
        description: 'Ajoute une photo pour que les autres membres te reconnaissent.',
        imageKey: 'photo-profil',
        tips: [
          'Une photo claire facilite la reconnaissance',
          'Tu peux la modifier à tout moment'
        ]
      }
    ]
  },
  notifications: {
    title: 'Notifs',
    icon: 'notifications',
    content: [
      {
        title: 'Types de notifications',
        description: 'Tu reçois des notifications pour les événements importants.',
        imageKey: 'types-notifications',
        tips: [
          'Invitations à des matchs',
          'Confirmations de participation',
          'Nouveaux membres dans tes groupes',
          'Demandes d\'adhésion à tes groupes'
        ]
      },
      {
        title: 'Gérer les notifications',
        description: 'Tu peux consulter toutes tes notifications dans la clochette en haut à droite.',
        imageKey: 'gerer-notifications',
        tips: [
          'Les notifications non lues sont marquées',
          'Clique sur une notification pour voir les détails',
          'Les notifications sont aussi envoyées sur ton téléphone'
        ]
      }
    ]
  }
};

export function HelpModal({ visible, onClose, initialSection = null }) {
  const [selectedSection, setSelectedSection] = useState(initialSection || 'matches');
  const [imageDimensions, setImageDimensions] = useState({});
  const { width: screenWidth } = useWindowDimensions();
  const contentWidth = screenWidth - 120 - 40 - 40; // Largeur disponible pour les images (screen - sidebar - padding)

  const sections = Object.keys(HELP_SECTIONS);
  const currentSection = HELP_SECTIONS[selectedSection];

  // Charger les dimensions de toutes les images de la section courante
  useEffect(() => {
    if (!currentSection?.content) return;
    
    currentSection.content.forEach((item) => {
      if (!item.imageKey || imageDimensions[item.imageKey]) return;
      
      const sectionKey = Object.keys(HELP_SECTIONS).find(key => HELP_SECTIONS[key] === currentSection);
      const images = getHelpImages(sectionKey, item.imageKey);
      
      if (images.length === 1) {
        const imageSource = Image.resolveAssetSource(images[0]);
        if (imageSource?.width && imageSource?.height) {
          // Pour les images locales, utiliser directement les dimensions de la source
          const imageWidth = contentWidth;
          const imageHeight = (imageWidth * imageSource.height) / imageSource.width;
          setImageDimensions(prev => ({
            ...prev,
            [item.imageKey]: { width: imageWidth, height: imageHeight }
          }));
        } else if (imageSource?.uri) {
          // Pour les images distantes, utiliser Image.getSize
          Image.getSize(
            imageSource.uri,
            (width, height) => {
              const imageWidth = contentWidth;
              const imageHeight = (imageWidth * height) / width;
              setImageDimensions(prev => ({
                ...prev,
                [item.imageKey]: { width: imageWidth, height: imageHeight }
              }));
            },
            (error) => {
              console.warn(`[HelpModal] Erreur chargement dimensions pour ${item.imageKey}:`, error);
            }
          );
        }
      }
    });
  }, [selectedSection, contentWidth, currentSection]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', padding: 16 }}>
        <View style={{ 
          flex: 1, 
          backgroundColor: '#ffffff', 
          borderRadius: 16, 
          marginTop: 40,
          marginBottom: 20,
          overflow: 'hidden'
        }}>
          {/* Header */}
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: 20,
            borderBottomWidth: 1,
            borderBottomColor: '#e5e7eb'
          }}>
            <Text style={{ fontWeight: '900', fontSize: 20, color: '#0b2240' }}>Aide</Text>
            <Pressable
              onPress={onClose}
              style={{ padding: 8 }}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          </View>

          <View style={{ flex: 1, flexDirection: 'row' }}>
            {/* Sidebar - Sections */}
            <View style={{ 
              width: 120, 
              backgroundColor: '#f9fafb', 
              borderRightWidth: 1,
              borderRightColor: '#e5e7eb'
            }}>
              <ScrollView>
                {sections.map((key) => {
                  const section = HELP_SECTIONS[key];
                  const isSelected = selectedSection === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => setSelectedSection(key)}
                      style={{
                        padding: 16,
                        backgroundColor: isSelected ? '#ffffff' : 'transparent',
                        borderLeftWidth: isSelected ? 3 : 0,
                        borderLeftColor: isSelected ? '#156bc9' : 'transparent',
                      }}
                    >
                      <View style={{ flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <Ionicons 
                          name={section.icon} 
                          size={20} 
                          color={isSelected ? '#156bc9' : '#6b7280'} 
                        />
                        <Text style={{ 
                          fontSize: 13, 
                          fontWeight: isSelected ? '700' : '500',
                          color: isSelected ? '#156bc9' : '#6b7280',
                          textAlign: 'center'
                        }}>
                          {section.title}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Content */}
            <ScrollView style={{ flex: 1, padding: 20 }}>
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <Ionicons name={currentSection.icon} size={28} color="#156bc9" />
                  <Text style={{ fontWeight: '900', fontSize: 22, color: '#0b2240' }}>
                    {currentSection.title}
                  </Text>
                </View>
              </View>

              {currentSection.content.map((item, index) => {
                const sectionKey = Object.keys(HELP_SECTIONS).find(key => HELP_SECTIONS[key] === currentSection);
                const images = item.imageKey ? getHelpImages(sectionKey, item.imageKey) : [];
                
                return (
                <View key={index} style={{ marginBottom: 32 }}>
                  <Text style={{ 
                    fontWeight: '800', 
                    fontSize: 16, 
                    color: '#111827',
                    marginBottom: 8
                  }}>
                    {item.title}
                  </Text>
                  <Text style={{ 
                    fontSize: 14, 
                    color: '#374151', 
                    lineHeight: 20,
                    marginBottom: 12
                  }}>
                    {item.description}
                  </Text>
                  
                  {/* Affichage des images */}
                  {images.length > 0 && images.every(img => img !== null) && (
                    <View style={{ marginBottom: 12 }}>
                      {images.length === 1 ? (
                        // Une seule image
                        <View style={{ width: '100%' }}>
                          <Image
                            source={images[0]}
                            style={{
                              width: '100%',
                              height: imageDimensions[item.imageKey]?.height || 200,
                              borderRadius: 12,
                              resizeMode: 'contain',
                              backgroundColor: '#f9fafb',
                              borderWidth: 1,
                              borderColor: '#e5e7eb',
                            }}
                          />
                        </View>
                      ) : (
                        // Plusieurs images - galerie horizontale scrollable
                        <ScrollView 
                          horizontal 
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 12 }}
                        >
                          {images.map((img, imgIndex) => {
                            const imgKey = `${item.imageKey}-${imgIndex}`;
                            return (
                              <Image
                                key={imgIndex}
                                source={img}
                                onLoad={(e) => {
                                  const { width, height } = e.nativeEvent.source;
                                  if (width && height) {
                                    setImageDimensions(prev => ({
                                      ...prev,
                                      [imgKey]: { width, height }
                                    }));
                                  }
                                }}
                                style={{
                                  width: 280,
                                  height: imageDimensions[imgKey]
                                    ? (280 * imageDimensions[imgKey].height / imageDimensions[imgKey].width)
                                    : 200,
                                  borderRadius: 12,
                                  resizeMode: 'contain',
                                  backgroundColor: '#f9fafb',
                                  borderWidth: 1,
                                  borderColor: '#e5e7eb',
                                }}
                              />
                            );
                          })}
                        </ScrollView>
                      )}
                    </View>
                  )}
                  
                  {item.tips && item.tips.length > 0 && (
                    <View style={{ 
                      backgroundColor: '#f3f4f6', 
                      borderRadius: 8, 
                      padding: 12,
                      marginTop: 8
                    }}>
                      <Text style={{ 
                        fontWeight: '700', 
                        fontSize: 13, 
                        color: '#111827',
                        marginBottom: 8
                      }}>
                        💡 Astuces :
                      </Text>
                      {item.tips.map((tip, tipIndex) => (
                        <View key={tipIndex} style={{ 
                          flexDirection: 'row', 
                          marginBottom: 6,
                          paddingLeft: 4
                        }}>
                          <Text style={{ color: '#6b7280', marginRight: 8 }}>•</Text>
                          <Text style={{ 
                            fontSize: 13, 
                            color: '#4b5563', 
                            lineHeight: 18,
                            flex: 1
                          }}>
                            {tip}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
              })}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

