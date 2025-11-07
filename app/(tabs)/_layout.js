// app/(tabs)/_layout.js
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { CopilotStep } from 'react-native-copilot';
import 'react-native-gesture-handler';
import { CopilotTutorialProvider, getGlobalCopilotStart } from '../../components/CopilotTutorial';
import { copilotSteps } from '../../lib/copilotSteps';
import { supabase } from '../../lib/supabase';


export default function TabsLayout() {
  const [fontsLoaded] = useFonts({
    CaptureSmallzClean: require('../../assets/fonts/CaptureSmallzClean.ttf'),
  });

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [notifsOpen, setNotifsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifs, setLoadingNotifs] = useState(false);

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

      const { data, error } = await supabase
        .from('notification_jobs')
        .select('id, created_at, kind, group_id, match_id, actor_id, recipients, payload')
        .contains('recipients', [uid])
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = data || [];

      // Build lookup maps for actor (profiles) and group names
      const actorIds = Array.from(new Set(rows.map(j => j.actor_id).filter(Boolean)));
      const groupIds = Array.from(new Set(rows.map(j => j.group_id).filter(Boolean)));

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

      const mapped = rows.map((job) => {
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

      setNotifications(mapped);
      setUnreadCount(mapped.filter(n => !n.is_read).length);
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
      try { await Notifications.setBadgeCountAsync(0); } catch {}
    } catch (e) {
      console.warn('[notifications] markAll error', e);
    }
  }

  useEffect(() => { loadNotifications(); }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <CopilotTutorialProvider>
      <Tabs
        initialRouteName="matches"
        screenOptions={({ route }) => ({
          headerShown: true,
          headerStyle: {
            backgroundColor: '#011932',
            height: isLandscape ? 48 : 100,
          },
          headerTitleAlign: 'center',
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontFamily: 'CaptureSmallzClean',
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
            paddingVertical: isLandscape ? 2 : 6,
          },
          headerLeft: () => (
            <Pressable
              onPress={() => {
                const startFn = getGlobalCopilotStart();
                if (startFn && typeof startFn === 'function') {
                  console.log("[Header] Démarrage du tutoriel depuis l'icône aide...");
                  startFn();
                } else {
                  console.warn("[Header] start() n'est pas disponible");
                }
              }}
              style={({ pressed }) => [
                { paddingHorizontal: 6, paddingVertical: 6, marginLeft: 0 },
                pressed ? { opacity: 0.8 } : null
              ]}
              accessibilityRole="button"
              accessibilityLabel="Aide - Démarrer le tutoriel"
            >
              <Ionicons name="help-circle-outline" size={40} color="#ffffff" />
            </Pressable>
          ),
          headerRight: () => (
            <CopilotStep 
              name="step6_notifications" 
              text={{ title: "🔔 Notifications", body: "Tu recevras ici toutes les notifications importantes : invitations, confirmations de matchs, etc." }}
              order={6}
            >
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
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
                        {unreadCount > 99 ? '99+' : String(unreadCount)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            </CopilotStep>
          ),
          tabBarStyle: {
            backgroundColor: '#011932',
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
            height: 90,
            paddingBottom: 12,
            paddingTop: 6,
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
            marginTop: 8, // adds space between icon and text
          },
          tabBarIcon: ({ focused, color, size }) => {
            let name = 'ellipse';
            let stepName = null;
            let stepText = null;

            if (route.name === 'semaine') {
              name = focused ? 'calendar' : 'calendar-outline';
              stepName = 'step3_dispos';
              stepText = 'Dispos';
            } else if (route.name === 'matches') {
              name = focused ? 'tennisball' : 'tennisball-outline';
              stepName = 'step4_matchs';
              stepText = 'Matchs';
            } else if (route.name === 'groupes') {
              name = focused ? 'people' : 'people-outline';
              stepName = 'step1_groupes';
              stepText = 'Groupes';
            } else if (route.name === 'profil') {
              name = focused ? 'person' : 'person-outline';
            }

            const iconContent = (
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

            if (stepName) {
              const stepConfig = copilotSteps.find(s => s.name === stepName);
              return (
                <CopilotStep 
                  name={stepName} 
                  text={stepConfig?.text || { title: stepText, body: "" }}
                  order={stepConfig?.order}
                >
                  {iconContent}
                </CopilotStep>
              );
            }

            return iconContent;
          },
        })}
      >
        <Tabs.Screen name="matches" options={{ tabBarLabel: 'Matches' }} />
        <Tabs.Screen name="semaine" options={{ tabBarLabel: 'Dispos' }} />
        <Tabs.Screen name="groupes" options={{ tabBarLabel: 'Groupes' }} />
        <Tabs.Screen name="profil" options={{ tabBarLabel: 'Profil' }} />
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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: '900', fontSize: 16, color: '#0b2240' }}>Notifications</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable onPress={markAllNotificationsRead} style={({ pressed }) => [ { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 }, pressed ? { opacity: 0.8 } : null ]}>
                  <Text style={{ color: '#156BC9', fontWeight: '800', fontSize: 13 }}>Tout marquer lu</Text>
                </Pressable>
                <Pressable onPress={async () => { setNotifsOpen(false); try { await Notifications.setBadgeCountAsync(0); } catch {} }} style={({ pressed }) => [ { paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8 }, pressed ? { opacity: 0.8 } : null ]}>
                  <Text style={{ color: '#374151', fontWeight: '800', fontSize: 13 }}>Fermer</Text>
                </Pressable>
              </View>
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
    </CopilotTutorialProvider>
  );
}