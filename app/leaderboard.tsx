// app/leaderboard.tsx
// Écran de classement avec sélecteur de scope (Global, Mon club, Mon groupe)

import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Leaderboard, { LeaderboardScope } from '../components/Leaderboard';
import { useActiveGroup } from '../lib/activeGroup';
import { useUserRole } from '../lib/roles';
import { supabase } from '../lib/supabase';

const BRAND = '#1a4b97';
const DARK_BG = '#001831';
const YELLOW_TEXT = '#e0ff00';

// Types pour les paramètres de navigation
type LeaderboardScreenParams = {
  initialScope?: 'global' | 'club' | 'group';
  clubId?: string;
  groupId?: string;
  returnTo?: string; // Pour savoir d'où on vient
};

export default function LeaderboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<LeaderboardScreenParams>();
  const insets = useSafeAreaInsets();
  const { clubId: userClubId } = useUserRole();
  const { activeGroup } = useActiveGroup();

  // Lire les paramètres de navigation
  const initialScope = params.initialScope as LeaderboardScope | undefined;
  const paramClubId = params.clubId as string | undefined;
  const paramGroupId = params.groupId as string | undefined;
  const returnTo = params.returnTo as string | undefined;

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [scope, setScope] = useState<LeaderboardScope | null>(null); // null = pas encore initialisé
  const [clubId, setClubId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Récupérer l'ID utilisateur et la ville
  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;

        if (userId) {
          setCurrentUserId(userId);

          // Récupérer la ville depuis le profil (address_home ou address_work)
          const { data: profile } = await supabase
            .from('profiles')
            .select('address_home, address_work, club_id')
            .eq('id', userId)
            .maybeSingle();

          if (profile) {
            // Essayer address_home d'abord, puis address_work
            // Les adresses sont stockées en JSONB avec potentiellement { address, lat, lng, city }
            const homeCity = profile.address_home?.city;
            const workCity = profile.address_work?.city;
            
            // Si pas de city dans l'objet, essayer d'extraire depuis l'adresse complète
            let userCity = homeCity || workCity;
            
            if (!userCity) {
              // Essayer d'extraire la ville depuis le champ address (format: "adresse, ville, pays")
              const homeAddress = profile.address_home?.address;
              const workAddress = profile.address_work?.address;
              const addressToParse = homeAddress || workAddress;
              
              if (addressToParse && typeof addressToParse === 'string') {
                // Extraire la ville (généralement le 2e élément après la virgule)
                const parts = addressToParse.split(',').map(p => p.trim());
                if (parts.length >= 2) {
                  userCity = parts[1]; // La ville est généralement le 2e élément
                }
              }
            }

            if (userCity) {
              setCity(userCity);
            }
          }
        }
      } catch (error) {
        console.error('[LeaderboardScreen] Error loading user data:', error);
      } finally {
        setLoadingUser(false);
      }
    })();
  }, []);

  // Initialiser le scope et clubId depuis les params de navigation ou les valeurs par défaut
  useEffect(() => {
    if (!loadingUser && scope === null) {
      // Si des paramètres sont fournis, les utiliser
      if (initialScope) {
        setScope(initialScope);
        if (initialScope === 'club' && paramClubId) {
          setClubId(paramClubId);
        } else if (initialScope === 'group' && paramGroupId) {
          // Le groupId sera géré directement dans le composant Leaderboard
        }
      } else {
        // Sinon, utiliser la logique par défaut
        if (activeGroup?.id) {
          setScope('group');
        } else if (userClubId) {
          setScope('club');
          setClubId(userClubId);
        } else if (city) {
          setScope('global');
        } else {
          // Par défaut, essayer global même sans ville
          setScope('global');
        }
      }
    }
  }, [loadingUser, initialScope, paramClubId, paramGroupId, activeGroup?.id, userClubId, city, scope]);

  if (loadingUser || !currentUserId || scope === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ title: 'Classement' }} />
        <View style={styles.center}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </View>
    );
  }

  // Utiliser clubId depuis les params si fourni, sinon depuis userClubId
  const effectiveClubId = paramClubId || clubId || userClubId;
  const effectiveGroupId = paramGroupId || activeGroup?.id;

  const canUseClub = !!effectiveClubId;
  const canUseGroup = !!effectiveGroupId;
  const canUseGlobal = !!city;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen
        options={{
          title: 'Classement',
          headerStyle: { backgroundColor: DARK_BG },
          headerTintColor: YELLOW_TEXT,
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/(tabs)/groupes');
                }
              }}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color={YELLOW_TEXT} />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Bouton retour */}
        <Pressable
          onPress={() => {
            // Si on a un returnTo, naviguer vers cette page avec replace pour éviter d'ajouter à l'historique
            if (returnTo === 'club' && paramClubId) {
              router.replace(`/clubs/${paramClubId}?returnTo=groupes`);
            } else if (returnTo === 'groupes') {
              router.replace('/(tabs)/groupes');
            } else if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)/groupes');
            }
          }}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={YELLOW_TEXT} />
          <Text style={styles.backButtonText}>Retour</Text>
        </Pressable>

        {/* Sélecteur de scope */}
        <View style={styles.scopeSelector}>
          <Pressable
            onPress={() => setScope('global')}
            style={[
              styles.scopeButton,
              scope === 'global' && styles.scopeButtonActive,
              !canUseGlobal && styles.scopeButtonDisabled,
            ]}
            disabled={!canUseGlobal}
          >
            <Text
              style={[
                styles.scopeButtonText,
                scope === 'global' && styles.scopeButtonTextActive,
                !canUseGlobal && styles.scopeButtonTextDisabled,
              ]}
            >
              Global
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setScope('club')}
            style={[
              styles.scopeButton,
              scope === 'club' && styles.scopeButtonActive,
              !canUseClub && styles.scopeButtonDisabled,
            ]}
            disabled={!canUseClub}
          >
            <Text
              style={[
                styles.scopeButtonText,
                scope === 'club' && styles.scopeButtonTextActive,
                !canUseClub && styles.scopeButtonTextDisabled,
              ]}
            >
              Mon club
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setScope('group')}
            style={[
              styles.scopeButton,
              scope === 'group' && styles.scopeButtonActive,
              !canUseGroup && styles.scopeButtonDisabled,
            ]}
            disabled={!canUseGroup}
          >
            <Text
              style={[
                styles.scopeButtonText,
                scope === 'group' && styles.scopeButtonTextActive,
                !canUseGroup && styles.scopeButtonTextDisabled,
              ]}
            >
              Mon groupe
            </Text>
          </Pressable>
        </View>

        {/* Message si scope non disponible */}
        {scope === 'global' && !canUseGlobal && (
          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={20} color={YELLOW_TEXT} />
            <Text style={styles.warningText}>
              Ajoutez une adresse dans votre profil pour voir le classement global
            </Text>
          </View>
        )}

        {scope === 'club' && !canUseClub && (
          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={20} color={YELLOW_TEXT} />
            <Text style={styles.warningText}>
              Vous n'êtes membre d'aucun club
            </Text>
          </View>
        )}

        {scope === 'group' && !canUseGroup && (
          <View style={styles.warningBox}>
            <Ionicons name="information-circle" size={20} color={YELLOW_TEXT} />
            <Text style={styles.warningText}>
              Sélectionnez un groupe pour voir son classement
            </Text>
          </View>
        )}

        {/* Composant Leaderboard */}
        {scope === 'global' && canUseGlobal && (
          <View style={styles.leaderboardContainer}>
            <Leaderboard
              scope="global"
              currentUserId={currentUserId || ''}
              highlightCurrentUser={true}
              variant="full"
            />
          </View>
        )}
        {scope === 'club' && canUseClub && (
          <View style={styles.leaderboardContainer}>
            <Leaderboard
              scope="club"
              clubId={effectiveClubId || undefined}
              currentUserId={currentUserId || ''}
              highlightCurrentUser={true}
              variant="full"
            />
          </View>
        )}
        {scope === 'group' && canUseGroup && (
          <View style={styles.leaderboardContainer}>
            <Leaderboard
              scope="group"
              groupId={effectiveGroupId || undefined}
              currentUserId={currentUserId || ''}
              highlightCurrentUser={true}
              variant="full"
            />
          </View>
        )}

        {/* Texte explicatif */}
        <View style={styles.infoBox}>
          <Ionicons name="trophy" size={20} color={YELLOW_TEXT} />
          <Text style={styles.infoText}>
            Pour monter au classement, jouez des matchs classés ou en tournoi. Chaque victoire augmente votre rating !
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    color: YELLOW_TEXT,
    fontSize: 16,
  },
  scopeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  scopeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeButtonActive: {
    backgroundColor: YELLOW_TEXT,
    borderColor: YELLOW_TEXT,
  },
  scopeButtonDisabled: {
    opacity: 0.4,
  },
  scopeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  scopeButtonTextActive: {
    color: DARK_BG,
  },
  scopeButtonTextDisabled: {
    color: '#9ca3af',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  warningText: {
    flex: 1,
    color: YELLOW_TEXT,
    fontSize: 13,
  },
  leaderboardContainer: {
    flex: 1,
    minHeight: 400,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoText: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  backButtonText: {
    color: YELLOW_TEXT,
    fontSize: 16,
    fontWeight: '700',
  },
});

