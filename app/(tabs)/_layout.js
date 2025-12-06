// app/(tabs)/_layout.js
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Linking, Modal, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HelpModal } from '../../components/HelpModal';
import { useActiveGroup } from '../../lib/activeGroup';
import { isNotificationsSupported, withNotifications } from '../../lib/notifications-wrapper';
import { supabase } from '../../lib/supabase';


export default function TabsLayout() {
  const [fontsLoaded] = useFonts({
    CaptureSmallzClean: require('../../assets/fonts/CaptureSmallzClean.ttf'),
  });

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const insets = useSafeAreaInsets();
  const { activeGroup } = useActiveGroup();

  const [notifsOpen, setNotifsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false);
  const [notifPermissionStatus, setNotifPermissionStatus] = useState(null);
  const [notificationPreferences, setNotificationPreferences] = useState({
    match_created: true,
    match_confirmed: true,
    match_validated: true,
    match_canceled: true,
    rsvp_accepted: true,
    rsvp_declined: true,
    rsvp_removed: true,
    group_member_joined: true,
    group_member_left: true,
  });

  async function loadNotifications() {
    try {
      setLoadingNotifs(true);
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) { setNotifications([]); setUnreadCount(0); return; }
      // Fetch last seen timestamp
      const { data: meProfile } = await supabase
        .from('profiles')
        .select('notifications_last_seen')
        .eq('id', uid)
        .single();
      const lastSeen = meProfile?.notifications_last_seen ? new Date(meProfile.notifications_last_seen) : null;

      // Vérifier d'abord si des notifications existent dans la base (sans filtre)
      const { data: allJobs, error: checkError } = await supabase
        .from('notification_jobs')
        .select('id, recipients, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      
      console.log('[notifications] Vérification base de données:');
      console.log('[notifications] - Total jobs dans la table:', allJobs?.length || 0);
      if (allJobs && allJobs.length > 0) {
        console.log('[notifications] - Exemples de recipients:', allJobs.slice(0, 3).map(j => ({
          id: j.id,
          recipients: j.recipients,
          created_at: j.created_at
        })));
      }
      console.log('[notifications] - User ID recherché:', uid);
      
      // Récupérer les notifications via fonction RPC pour contourner les politiques RLS
      let finalRows = [];
      
      const { data: rows, error } = await supabase.rpc('get_user_notifications', {
        p_user_id: uid,
        p_limit: 100
      });
      
      if (error) {
        console.warn('[notifications] Erreur lors du chargement (RPC):', error);
        console.warn('[notifications] Code erreur:', error.code);
        console.warn('[notifications] Message:', error.message);
        
        // Si la fonction n'existe pas, afficher un message clair
        if (error.code === '42883' || error.message?.includes('does not exist') || error.message?.includes('n\'existe pas')) {
          console.error('[notifications] ❌ La fonction RPC get_user_notifications n\'existe pas !');
          console.error('[notifications] Exécutez la migration: supabase/migrations/get_user_notifications_rpc.sql');
          Alert.alert(
            'Configuration requise',
            'La fonction de récupération des notifications n\'est pas installée.\n\n' +
            'Veuillez exécuter la migration SQL dans Supabase:\n' +
            'supabase/migrations/get_user_notifications_rpc.sql',
            [{ text: 'OK' }]
          );
        }
        
        // Fallback: essayer avec une requête directe
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('notification_jobs')
          .select('id, created_at, kind, group_id, match_id, actor_id, recipients, payload')
          .order('created_at', { ascending: false })
          .limit(100);
        
        if (fallbackError) {
          console.warn('[notifications] Erreur fallback:', fallbackError);
          setNotifications([]);
          setUnreadCount(0);
          return;
        }
        
        const fallbackRows = fallbackData || [];
        console.log('[notifications] Notifications récupérées (fallback, avant filtre):', fallbackRows.length);
        
        // Filtrer côté client
        finalRows = fallbackRows.filter(job => {
          if (!job.recipients || !Array.isArray(job.recipients)) {
            console.log('[notifications] Job sans recipients valides:', job.id, job.recipients);
            return false;
          }
          const isRecipient = job.recipients.some(r => String(r) === String(uid));
          if (isRecipient) {
            console.log('[notifications] ✅ Notification trouvée pour utilisateur:', job.id, job.kind);
          }
          return isRecipient;
        });
        console.log('[notifications] Notifications récupérées (fallback, après filtre):', finalRows.length);
      } else {
        finalRows = rows || [];
        console.log('[notifications] ✅ Total notifications récupérées (RPC):', finalRows.length);
        if (finalRows.length > 0) {
          console.log('[notifications] - Première notification:', {
            id: finalRows[0].id,
            kind: finalRows[0].kind,
            created_at: finalRows[0].created_at
          });
        }
      }
      
      console.log('[notifications] Notifications finales à afficher:', finalRows.length);

      // Build lookup maps for actor (profiles) and group names
      const actorIds = Array.from(new Set(finalRows.map(j => j.actor_id).filter(Boolean)));
      const groupIds = Array.from(new Set(finalRows.map(j => j.group_id).filter(Boolean)));

      const [{ data: profs }, { data: grps }] = await Promise.all([
        actorIds.length
          ? supabase.from('profiles').select('id, display_name, name').in('id', actorIds)
          : Promise.resolve({ data: [] }),
        groupIds.length
          ? supabase.from('groups').select('id, name').in('id', groupIds)
          : Promise.resolve({ data: [] }),
      ]);

      const profilesById = Object.fromEntries(
        (profs || []).map(p => [p.id, p])
      );
      const groupsById = Object.fromEntries(
        (grps || []).map(g => [g.id, g])
      );

      const KIND_LABELS = {
        // matches lifecycle
        'match_pending': 'Match confirmé',
        'match_rsvp': 'Match confirmé',
        'match_confirmed': 'Match confirmé',
        'match_validated': 'Match confirmé',
        'confirmed': 'Match confirmé',
        'match_canceled': 'Match annulé',
        'match_cancelled': 'Match annulé',
        'canceled': 'Match annulé',
        'cancelled': 'Match annulé',
        'match_created': 'Match créé',
        'group_match_created': 'Match créé',
        'group_match_confirmed': 'Match confirmé',
        'group_match_validated': 'Match confirmé',

        // rsvps
        'rsvp_accepted': 'Joueur confirmé',
        'rsvp_yes': 'Joueur confirmé',
        'accepted': 'Joueur confirmé',
        'rsvp_declined': 'Joueur a refusé',
        'rsvp_no': 'Joueur a refusé',
        'declined': 'Joueur a refusé',
        'rsvp_removed': "Joueur retiré",
        'rsvp_deleted': "Joueur retiré",
        'removed': "Joueur retiré",

        // groups
        'group_member_joined': 'Nouveau membre',
        'group_member_join': 'Nouveau membre',
        'member_joined': 'Nouveau membre',
        'group_member_left': 'Membre parti',
        'member_left': 'Membre parti',
      };

      const mapped = finalRows.map((job) => {
        const kind = String(job?.kind || '').toLowerCase();
        const actor = profilesById[job.actor_id] || {};
        const actorName =
          actor.display_name?.trim?.() ||
          actor.name?.trim?.() ||
          (job?.payload?.actor_name || '').toString().trim() ||
          'Quelqu’un';

        const group = groupsById[job.group_id] || {};
        const groupName =
          group.name?.trim?.() ||
          (job?.payload?.group_name || '').toString().trim() ||
          'Groupe';

        const label = KIND_LABELS[kind] || KIND_LABELS[(job?.kind || '').toLowerCase().trim()];
        const effectiveLabel = label || job?.payload?.title || (job?.kind || 'Notification');
        const title = `${effectiveLabel} — ${actorName} — ${groupName}`;

        const body =
          (job?.payload && (job.payload.message || job.payload.body || job.payload.text)) ||
          '';

        return {
          id: job.id,
          created_at: job.created_at,
          title,
          body,
          is_read: lastSeen ? new Date(job.created_at) <= lastSeen : false,
          _job: job,
        };
      });

      const unread = mapped.filter(n => !n.is_read).length;
      setNotifications(mapped);
      setUnreadCount(unread);
    } catch (e) {
      console.warn('[notifications] load error', e);
    } finally {
      setLoadingNotifs(false);
    }
  }

  async function markAllNotificationsRead() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (uid) {
        await supabase
          .from('profiles')
          .update({ notifications_last_seen: new Date().toISOString() })
          .eq('id', uid);
      }
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      if (isNotificationsSupported) {
        await withNotifications(async (Notifications) => {
          try { 
            await Notifications.setBadgeCountAsync(0); 
          } catch (e) {
            console.warn('[notifications] Erreur setBadgeCount:', e);
          }
        });
      }
    } catch (e) {
      console.warn('[notifications] markAll error', e);
    }
  }

  async function loadNotificationPermissionStatus() {
    if (!isNotificationsSupported) {
      setNotifPermissionStatus({ granted: false, canAskAgain: false });
      return;
    }
    await withNotifications(async (Notifications) => {
      try {
        const settings = await Notifications.getPermissionsAsync();
        setNotifPermissionStatus(settings);
      } catch (e) {
        console.warn('[notifications] loadPermissionStatus error', e);
        setNotifPermissionStatus({ granted: false, canAskAgain: false });
      }
    });
  }

  async function requestNotificationPermission() {
    if (!isNotificationsSupported) {
      Alert.alert(
        'Notifications non disponibles',
        'Les notifications push ne sont pas disponibles dans Expo Go sur Android. Utilisez un development build pour tester cette fonctionnalité.'
      );
      return null;
    }
    
    return await withNotifications(async (Notifications) => {
      try {
        // Si on ne peut plus demander les permissions, ouvrir les paramètres système
        if (notifPermissionStatus?.canAskAgain === false) {
          await Linking.openSettings();
          // Recharger le statut après un court délai
          setTimeout(() => {
            loadNotificationPermissionStatus();
          }, 500);
          return null;
        }
        
        const result = await Notifications.requestPermissionsAsync();
        setNotifPermissionStatus(result);
        if (result.granted) {
          // Enregistrer le token push si les permissions sont accordées
          const { registerPushToken } = await import('../../lib/notifications');
          await registerPushToken();
        }
        return result;
      } catch (e) {
        console.warn('[notifications] requestPermission error', e);
        return null;
      }
    });
  }

  async function loadNotificationPreferences() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        console.log('[notifications] No user ID, using defaults');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', uid)
        .single();

      // Si la colonne n'existe pas encore ou erreur, utiliser les valeurs par défaut
      if (error) {
        console.log('[notifications] Error loading preferences:', error.message);
        // Ne pas bloquer, utiliser les valeurs par défaut déjà définies dans l'état
        return;
      }

      if (profile?.notification_preferences && typeof profile.notification_preferences === 'object') {
        // Fusionner avec les valeurs par défaut pour s'assurer que tous les types sont présents
        const defaults = {
          match_created: true,
          match_confirmed: true,
          match_validated: true,
          match_canceled: true,
          rsvp_accepted: true,
          rsvp_declined: true,
          rsvp_removed: true,
          group_member_joined: true,
          group_member_left: true,
        };
        setNotificationPreferences({ ...defaults, ...profile.notification_preferences });
      }
    } catch (e) {
      console.warn('[notifications] loadPreferences error', e);
      // Ne pas bloquer, les valeurs par défaut sont déjà dans l'état
    }
  }

  async function saveNotificationPreferences(prefs) {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;

      const { error } = await supabase
        .from('profiles')
        .update({ notification_preferences: prefs })
        .eq('id', uid);

      if (error) {
        // Si la colonne n'existe pas, on ne peut pas sauvegarder mais on met à jour l'état local
        if (error.code === 'PGRST116' || error.message?.includes('column') || error.message?.includes('notification_preferences')) {
          console.warn('[notifications] Column notification_preferences does not exist yet. Please run migration.');
          setNotificationPreferences(prefs);
          return;
        }
        throw error;
      }
      setNotificationPreferences(prefs);
    } catch (e) {
      console.warn('[notifications] savePreferences error', e);
      // Mettre à jour l'état local même en cas d'erreur
      setNotificationPreferences(prefs);
    }
  }

  function toggleNotificationType(type) {
    const currentValue = notificationPreferences[type] !== false; // true par défaut
    const newPrefs = {
      ...notificationPreferences,
      [type]: !currentValue,
    };
    setNotificationPreferences(newPrefs); // Mettre à jour immédiatement pour l'UI
    saveNotificationPreferences(newPrefs).catch(e => console.warn('[notifications] Error saving preferences:', e));
  }

  // Fonction de test des notifications
  async function testNotifications() {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) {
        Alert.alert('Erreur', 'Vous devez être connecté pour tester les notifications.');
        return;
      }

      if (!activeGroup?.id) {
        Alert.alert('Erreur', 'Vous devez avoir un groupe actif pour tester les notifications.');
        return;
      }

      // Créer une notification de test via fonction RPC pour contourner RLS
      const { data, error } = await supabase.rpc('create_test_notification', {
        p_user_id: uid,
        p_group_id: activeGroup.id,
        p_title: '🧪 Test de notification',
        p_message: 'Ceci est une notification de test. Si vous voyez ce message, les notifications fonctionnent correctement !',
      });

      if (error) {
        console.error('[Test Notifications] Erreur création:', error);
        Alert.alert('Erreur', `Impossible de créer la notification de test: ${error.message}`);
        return;
      }

      // data est l'UUID de la notification créée
      const notificationId = data;
      console.log('[Test Notifications] Notification de test créée:', notificationId);
      
      // Vérifier que la notification a bien été créée
      const { data: createdNotif, error: checkError } = await supabase
        .from('notification_jobs')
        .select('*')
        .eq('id', notificationId)
        .single();
      
      if (checkError) {
        console.warn('[Test Notifications] Erreur vérification:', checkError);
      } else {
        console.log('[Test Notifications] Notification vérifiée:', {
          id: createdNotif.id,
          kind: createdNotif.kind,
          recipients: createdNotif.recipients,
          group_id: createdNotif.group_id,
          created_at: createdNotif.created_at,
        });
      }
      
      Alert.alert(
        'Test envoyé ✅',
        'Une notification de test a été créée. Elle devrait apparaître dans votre liste de notifications dans quelques secondes.\n\n' +
        'Vérifiez :\n' +
        '1. Que la notification apparaît dans la liste (icône clochette)\n' +
        '2. Que vous recevez une notification push (si les permissions sont activées)\n' +
        '3. Que le badge de notification s\'incrémente',
        [
          { text: 'OK', style: 'default' },
          { 
            text: 'Voir les notifications', 
            onPress: async () => {
              setNotifSettingsOpen(false);
              // Attendre un peu pour que la notification soit disponible
              setTimeout(async () => {
                await loadNotifications();
                setTimeout(() => {
                  setNotifsOpen(true);
                }, 100);
              }, 1000);
            }
          }
        ]
      );

      // Recharger les notifications après un court délai pour s'assurer qu'elle apparaît
      setTimeout(async () => {
        console.log('[Test Notifications] Rechargement des notifications...');
        await loadNotifications();
      }, 2000);
    } catch (e) {
      console.error('[Test Notifications] Erreur:', e);
      Alert.alert('Erreur', `Erreur lors du test: ${e.message || String(e)}`);
    }
  }

  useEffect(() => { 
    loadNotifications(); 
    
    if (!isNotificationsSupported) {
      return;
    }
    
    // Écouter les notifications reçues (push notifications)
    let subscription = null;
    let responseSubscription = null;
    
    (async () => {
      await withNotifications(async (Notifications) => {
        try {
          subscription = Notifications.addNotificationReceivedListener(notification => {
            console.log('[Layout] Notification push reçue:', notification);
            // Recharger les notifications quand une nouvelle arrive
            loadNotifications();
          });
          
          // Écouter les notifications ouvertes (quand l'utilisateur clique dessus)
          responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
            console.log('[Layout] Notification ouverte:', response);
            // Recharger les notifications
            loadNotifications();
          });
        } catch (e) {
          console.warn('[Layout] Erreur lors de l\'écoute des notifications:', e);
        }
      });
    })();
    
    return () => {
      if (subscription) {
        try {
          subscription.remove();
        } catch (e) {
          console.warn('[Layout] Erreur lors de la suppression du listener:', e);
        }
      }
      if (responseSubscription) {
        try {
          responseSubscription.remove();
        } catch (e) {
          console.warn('[Layout] Erreur lors de la suppression du listener de réponse:', e);
        }
      }
    };
  }, []);

  // Mettre à jour le badge iOS/Android quand le nombre de notifications non lues change
  useEffect(() => {
    if (!isNotificationsSupported) return;
    
    (async () => {
      await withNotifications(async (Notifications) => {
        try {
          await Notifications.setBadgeCountAsync(unreadCount);
          console.log('[Notifications] Badge mis à jour:', unreadCount);
        } catch (e) {
          console.warn('[Notifications] Erreur setBadgeCount:', e);
        }
      });
    })();
  }, [unreadCount, isNotificationsSupported]);

  // Recharger le statut des permissions et les préférences quand la modale de paramètres s'ouvre
  useEffect(() => {
    if (notifSettingsOpen) {
      // Charger de manière asynchrone sans bloquer
      loadNotificationPermissionStatus().catch(e => console.warn('[notifications] Error loading permission status:', e));
      loadNotificationPreferences().catch(e => console.warn('[notifications] Error loading preferences:', e));
    }
  }, [notifSettingsOpen]);

  // Recharger le statut des permissions quand l'app revient au premier plan
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && notifSettingsOpen) {
        // Recharger le statut après un court délai pour laisser le temps aux paramètres de se mettre à jour
        setTimeout(() => {
          loadNotificationPermissionStatus();
        }, 300);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [notifSettingsOpen]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" translucent />
      <Tabs
        initialRouteName="matches"
        screenOptions={({ route }) => ({
          headerShown: true,
          headerStyle: {
            backgroundColor: '#011932',
            height: isLandscape ? 48 + insets.top : 60 + insets.top,
            elevation: 0,
            shadowOpacity: 0,
          },
          headerStatusBarHeight: insets.top,
          headerTransparent: false,
          headerTitleAlign: 'center',
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontFamily: Platform.OS === 'android' && !fontsLoaded ? 'sans-serif-medium' : 'CaptureSmallzClean',
            fontWeight: '800',
            fontSize: isLandscape ? 34 : 42,
            textTransform: 'uppercase',
            color: '#e0ff00',
            marginHorizontal: -6,
            paddingHorizontal: 0,
            textAlign: 'center',
            lineHeight: isLandscape ? 36 : 44
          },
          headerTitleContainerStyle: {
            flexGrow: 1,
            maxWidth: '66%',
            paddingVertical: isLandscape ? 1 : 2,
            justifyContent: 'center',
            alignItems: 'center',
          },
          headerLeft: () => (
            <Pressable
              onPress={() => setHelpModalOpen(true)}
              style={({ pressed }) => [
                { paddingHorizontal: 6, paddingVertical: 6, marginLeft: 0 },
                pressed ? { opacity: 0.8 } : null
              ]}
              accessibilityRole="button"
              accessibilityLabel="Aide"
            >
              <Ionicons name="help-circle-outline" size={40} color="#ffffff" />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={async () => { await loadNotifications(); setNotifsOpen(true); }}
              style={({ pressed }) => [
                { paddingHorizontal: 6, paddingVertical: 6, marginRight: 0 },
                pressed ? { opacity: 0.8 } : null
              ]}
              accessibilityRole="button"
              accessibilityLabel="Afficher les notifications"
            >
              <View style={{ position: 'relative' }}>
                <Ionicons name="notifications-outline" size={36} color="#ffffff" />
                {unreadCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      backgroundColor: '#ef4444',
                      borderWidth: 1,
                      borderColor: '#ffffff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }}>
                      {unreadCount > 99 ? '99+' : String(unreadCount)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ),
          tabBarStyle: {
            backgroundColor: '#011932',
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            height: Platform.OS === 'android' ? 64 + insets.bottom : 60 + insets.bottom,
            paddingBottom: Platform.OS === 'android' ? 4 + insets.bottom : 2 + insets.bottom,
            paddingTop: Platform.OS === 'android' ? 8 : 6,
            paddingLeft: Math.max(0, insets.left),
            paddingRight: Math.max(0, insets.right),
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
          },
          tabBarActiveTintColor: '#e0ff00',
          tabBarInactiveTintColor: 'gray',
          tabBarLabelStyle: {
            fontWeight: '700',
            fontSize: 12,
            marginTop: Platform.OS === 'android' ? 4 : 8, // adds space between icon and text
            marginBottom: Platform.OS === 'android' ? 2 : 0,
          },
          tabBarItemStyle: {
            paddingVertical: Platform.OS === 'android' ? 4 : 0,
          },
          tabBarLabel: route.name === 'semaine' ? 'Dispos' 
            : route.name === 'matches' ? 'Matches'
            : route.name === 'groupes' ? 'Groupes'
            : route.name === 'profil' ? 'Profil'
            : route.name === 'stats' ? 'Stats'
            : undefined,
          tabBarIcon: ({ focused, color, size }) => {
            let name = 'ellipse';

            if (route.name === 'semaine') {
              name = focused ? 'calendar' : 'calendar-outline';
            } else if (route.name === 'matches') {
              name = focused ? 'tennisball' : 'tennisball-outline';
            } else if (route.name === 'groupes') {
              name = focused ? 'people' : 'people-outline';
            } else if (route.name === 'profil') {
              name = focused ? 'person' : 'person-outline';
            } else if (route.name === 'stats') {
              name = focused ? 'stats-chart' : 'stats-chart-outline';
            }

            return (
              <View
                style={{
                  transform: [{ scale: focused ? 1.15 : 1 }],
                  shadowColor: focused ? '#e0ff00' : 'transparent',
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: focused ? 0.9 : 0,
                  shadowRadius: focused ? 8 : 0,
                  elevation: focused ? 8 : 0, // Android glow simulation
                }}
              >
                <Ionicons
                  name={name}
                  size={size * 1.2}
                  color={focused ? '#e0ff00' : 'gray'}
                />
              </View>
            );
          },
        })}
      >
        <Tabs.Screen 
          name="matches" 
          options={{
            tabBarLabel: 'Matches',
            tabBarAccessibilityLabel: 'Matches',
          }}
        />
        <Tabs.Screen 
          name="semaine" 
          options={{
            tabBarLabel: 'Dispos',
            tabBarAccessibilityLabel: 'Disponibilités',
          }}
        />
        <Tabs.Screen 
          name="groupes" 
          options={{
            tabBarLabel: 'Groupes',
            tabBarAccessibilityLabel: 'Groupes',
          }}
        />
        <Tabs.Screen 
          name="stats" 
          options={{
            tabBarLabel: 'Stats',
            tabBarAccessibilityLabel: 'Statistiques',
          }}
        />
        <Tabs.Screen 
          name="profil" 
          options={{
            tabBarLabel: 'Profil',
            tabBarAccessibilityLabel: 'Profil',
          }}
        />
      </Tabs>
      {/* Notifications Popup */}
     <Modal
        visible={notifsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNotifsOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'flex-start', padding: 16 }}>
          <View style={{ width: '96%', maxWidth: 460, marginTop: 60, backgroundColor: '#ffffff', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#e5e7eb', maxHeight: '70%' }}>
            {/* Bouton de fermeture en haut à droite */}
            <View style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}>
              <Pressable onPress={async () => { 
                setNotifsOpen(false); 
                if (isNotificationsSupported) {
                  await withNotifications(async (Notifications) => {
                    try { 
                      await Notifications.setBadgeCountAsync(0); 
                    } catch (e) {
                      console.warn('[notifications] Erreur setBadgeCount:', e);
                    }
                  });
                }
              }} style={({ pressed }) => [ { padding: 6, borderRadius: 8 }, pressed ? { opacity: 0.8, backgroundColor: '#f3f4f6' } : null ]}>
                <Ionicons name="close" size={20} color="#374151" />
              </Pressable>
            </View>
            
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Pressable 
                onPress={async () => { 
                  // Fermer d'abord la modale notifications
                  setNotifsOpen(false);
                  // Attendre un court instant pour que la modale se ferme
                  await new Promise(resolve => setTimeout(resolve, 100));
                  // Ouvrir la modale paramètres
                  setNotifSettingsOpen(true);
                  // Charger les données de manière asynchrone sans bloquer
                  loadNotificationPermissionStatus().catch(e => console.warn('[notifications] Error loading permission status:', e));
                  loadNotificationPreferences().catch(e => console.warn('[notifications] Error loading preferences:', e));
                }} 
                style={({ pressed }) => [ 
                  { padding: 6, borderRadius: 8 }, 
                  pressed ? { opacity: 0.8, backgroundColor: '#f3f4f6' } : null 
                ]}
              >
                <Ionicons name="settings-outline" size={20} color="#156BC9" />
              </Pressable>
              
              <Pressable onPress={markAllNotificationsRead} style={({ pressed }) => [ { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 }, pressed ? { opacity: 0.8 } : null ]}>
                <Text style={{ color: '#156BC9', fontWeight: '800', fontSize: 13 }}>Tout marquer lu</Text>
              </Pressable>
              
              {/* Espace pour équilibrer avec l'icône fermer en position absolue */}
              <View style={{ width: 32, height: 32 }} />
            </View>

            {loadingNotifs ? (
              <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator />
              </View>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(n) => String(n.id)}
                contentContainerStyle={{ paddingVertical: 4 }}
                renderItem={({ item }) => (
                  <View style={{ paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: '#eef2f7' }}>
                    <Text style={{ fontWeight: item.is_read ? '700' : '900', fontSize: 13, color: '#0b2240', marginBottom: 2 }}>
                      {item.title || 'Notification'}
                    </Text>
                    {item.body ? (
                      <Text style={{ color: '#374151', fontSize: 12 }} numberOfLines={3}>
                        {item.body}
                      </Text>
                    ) : null}
                    <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
                      {new Date(item.created_at).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}
                    </Text>
                  </View>
                )}
                ListEmptyComponent={() => (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ color: '#6b7280', fontSize: 12 }}>Aucune notification</Text>
                  </View>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
      {/* Modal d'aide */}
      <HelpModal 
        visible={helpModalOpen} 
        onClose={() => setHelpModalOpen(false)}
      />
      {/* Modal Paramètres Notifications */}
      <Modal
        visible={notifSettingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setNotifSettingsOpen(false);
          // S'assurer que la modale notifications reste fermée
          setNotifsOpen(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <View style={{ width: '96%', maxWidth: 460, backgroundColor: '#ffffff', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#e5e7eb', maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontWeight: '900', fontSize: 18, color: '#0b2240' }}>Paramètres de notifications</Text>
              <Pressable 
                onPress={() => {
                  setNotifSettingsOpen(false);
                  // S'assurer que la modale notifications reste fermée
                  setNotifsOpen(false);
                }} 
                style={({ pressed }) => [ 
                  { padding: 8, borderRadius: 8 }, 
                  pressed ? { opacity: 0.8, backgroundColor: '#f3f4f6' } : null 
                ]}
              >
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>

            {/* Section Permissions Push */}
            <View style={{ marginBottom: 24, paddingBottom: 20, borderBottomWidth: 1, borderColor: '#e5e7eb' }}>
              <Text style={{ fontWeight: '800', fontSize: 14, color: '#0b2240', marginBottom: 8 }}>
                Notifications push
              </Text>
              {!isNotificationsSupported && (
                <Text style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                  ⚠️ Les notifications push ne sont pas disponibles dans Expo Go sur Android. Utilisez un development build pour tester cette fonctionnalité.
                </Text>
              )}
              <Text style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
                {notifPermissionStatus?.granted 
                  ? 'Les notifications push sont activées.'
                  : notifPermissionStatus?.canAskAgain === false
                  ? 'Les notifications push sont désactivées. Activez-les dans les paramètres de votre appareil.'
                  : 'Activez les notifications push pour recevoir des alertes en temps réel.'}
              </Text>
              
              {!notifPermissionStatus?.granted && isNotificationsSupported && (
                <Pressable
                  onPress={requestNotificationPermission}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      backgroundColor: '#156BC9',
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    pressed ? { opacity: 0.8 } : null,
                  ]}
                >
                  <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 14 }}>
                    {notifPermissionStatus?.canAskAgain === false 
                      ? 'Ouvrir les paramètres' 
                      : 'Activer les notifications push'}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Section Types de Notifications */}
            {notifPermissionStatus?.granted && isNotificationsSupported && (
              <View style={{ maxHeight: '60%' }}>
                <Text style={{ fontWeight: '800', fontSize: 14, color: '#0b2240', marginBottom: 16 }}>
                  Types de notifications
                </Text>
                <FlatList
                  data={[
                    { key: 'match_created', label: 'Nouveau match créé', icon: 'tennisball-outline' },
                    { key: 'match_confirmed', label: 'Match confirmé', icon: 'checkmark-circle-outline' },
                    { key: 'match_validated', label: 'Match validé', icon: 'checkmark-done-outline' },
                    { key: 'match_canceled', label: 'Match annulé', icon: 'close-circle-outline' },
                    { key: 'rsvp_accepted', label: 'Joueur confirmé', icon: 'person-add-outline' },
                    { key: 'rsvp_declined', label: 'Joueur a refusé', icon: 'person-remove-outline' },
                    { key: 'rsvp_removed', label: 'Joueur retiré', icon: 'person-outline' },
                    { key: 'group_member_joined', label: 'Nouveau membre dans le groupe', icon: 'people-outline' },
                    { key: 'group_member_left', label: 'Membre a quitté le groupe', icon: 'log-out-outline' },
                  ]}
                  keyExtractor={(item) => item.key}
                  renderItem={({ item }) => {
                    const isEnabled = notificationPreferences[item.key] !== false;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#f3f4f6' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                          <Ionicons name={item.icon} size={20} color="#156BC9" />
                          <Text style={{ fontSize: 14, color: '#0b2240', flex: 1 }}>{item.label}</Text>
                        </View>
                        <Pressable
                          onPress={() => toggleNotificationType(item.key)}
                          style={({ pressed }) => [
                            {
                              width: 50,
                              height: 30,
                              borderRadius: 15,
                              backgroundColor: isEnabled ? '#156BC9' : '#d1d5db',
                              justifyContent: 'center',
                              paddingHorizontal: 2,
                            },
                            pressed ? { opacity: 0.8 } : null,
                          ]}
                        >
                          <View
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 13,
                              backgroundColor: '#ffffff',
                              alignSelf: isEnabled ? 'flex-end' : 'flex-start',
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 2 },
                              shadowOpacity: 0.2,
                              shadowRadius: 2,
                              elevation: 2,
                            }}
                          />
                        </Pressable>
                      </View>
                    );
                  }}
                />
              </View>
            )}

            {(!notifPermissionStatus?.granted || !isNotificationsSupported) && (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <Text style={{ color: '#6b7280', fontSize: 13, textAlign: 'center' }}>
                  {!isNotificationsSupported 
                    ? 'Les notifications push ne sont pas disponibles dans Expo Go sur Android.'
                    : 'Activez d\'abord les notifications push pour gérer les types de notifications'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}