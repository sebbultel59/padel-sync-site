import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/auth';
import { useActiveGroup } from '../lib/activeGroup';
import { hasAvailabilityForGroup } from '../lib/availabilityCheck';
import { validateActiveGroup } from '../lib/groupValidation';
import { acceptInviteCode, clearPendingInvite, getPendingInviteCode, setInviteJoinedBanner } from '../lib/invite';
import { isProfileComplete } from '../lib/profileCheck';
import { supabase } from '../lib/supabase';

const normalizeGroupName = (name) =>
  (name || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
const AUTO_JOIN_KEY = 'auto_joined_france_group';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const { setActiveGroup } = useActiveGroup();
  const [profileComplete, setProfileComplete] = useState(null);
  const [hasActiveGroup, setHasActiveGroup] = useState(null);
  const [hasZone, setHasZone] = useState(null);
  const [hasAvailability, setHasAvailability] = useState(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Vérifier l'authentification et l'état du profil/groupe/dispos
    if (!isLoading && profileComplete === null && !checking) {
      setChecking(true);
      (async () => {
        try {
          // Vérifier la session Supabase directement
          const { data: sessionData } = await supabase.auth.getSession();
          const hasSession = !!sessionData?.session;
          
          if (!hasSession) {
            setProfileComplete(false);
            setChecking(false);
            return;
          }
          
          const { data: u } = await supabase.auth.getUser();
          const userId = u?.user?.id;
          
          if (userId) {
            // Vérifier si le profil est complet
            const complete = await isProfileComplete(userId);
            setProfileComplete(complete);

            const pendingInvite = await getPendingInviteCode();
            if (complete && pendingInvite) {
              try {
                const groupId = await acceptInviteCode(pendingInvite);
                const { data: invitedGroup } = await supabase
                  .from('groups')
                  .select('id, name, avatar_url, visibility, join_policy, club_id')
                  .eq('id', groupId)
                  .maybeSingle();
                if (invitedGroup?.id) {
                  await AsyncStorage.setItem('active_group_id', String(invitedGroup.id));
                  setActiveGroup(invitedGroup);
                  await setInviteJoinedBanner({ groupName: invitedGroup.name });
                }
                await clearPendingInvite();
                setHasActiveGroup(true);
                const hasAvail = await hasAvailabilityForGroup(userId, groupId);
                setHasAvailability(hasAvail);
                return;
              } catch (e) {
                console.warn('[Index] Pending invite failed:', e?.message || e);
                await clearPendingInvite();
              }
            }
            
            // Vérifier si une zone est sélectionnée
            const { data: profileData } = await supabase
              .from("profiles")
              .select("zone_id")
              .eq("id", userId)
              .maybeSingle();
            const zoneOk = !!profileData?.zone_id;
            setHasZone(zoneOk);

            // Vérifier si un groupe est sélectionné et valide
            const savedGroupId = await AsyncStorage.getItem("active_group_id");
            let hasGroup = false;
            
            if (savedGroupId) {
              // Valider que le groupe existe toujours et que l'utilisateur est toujours membre
              const isValid = await validateActiveGroup(userId, savedGroupId);
              if (isValid) {
                hasGroup = true;
                // Vérifier les disponibilités
                const hasAvail = await hasAvailabilityForGroup(userId, savedGroupId);
                setHasAvailability(hasAvail);
              } else {
                // Groupe invalide, nettoyer AsyncStorage
                await AsyncStorage.removeItem("active_group_id");
                setHasAvailability(false);
              }
            } else {
              // Pas de groupe actif -> auto-join France si possible, puis sélectionner
              const alreadyAutoJoined = await AsyncStorage.getItem(AUTO_JOIN_KEY);
              const { data: franceGroup } = await supabase
                .from('groups')
                .select('id, name')
                .ilike('name', '%padel sync%france%')
                .maybeSingle();

              if (franceGroup?.id && !alreadyAutoJoined) {
                // Tenter de rejoindre automatiquement le groupe public
                await supabase.rpc('join_group_by_id', { p_group_id: franceGroup.id });
                await AsyncStorage.setItem(AUTO_JOIN_KEY, '1');
              }

              const { data: memberships } = await supabase
                .from('group_members')
                .select('group_id')
                .eq('user_id', userId);
              const myIds = [...new Set((memberships || []).map((r) => r.group_id))];
              if (myIds.length) {
                const { data: groups } = await supabase
                  .from('groups')
                  .select('id, name')
                  .in('id', myIds);
                const france = (groups || []).find(
                  (g) => normalizeGroupName(g.name) === 'padel sync - france'
                );
                const picked = france || groups?.[0] || null;
                if (picked?.id) {
                  await AsyncStorage.setItem('active_group_id', String(picked.id));
                  hasGroup = true;
                  const hasAvail = await hasAvailabilityForGroup(userId, picked.id);
                  setHasAvailability(hasAvail);
                } else {
                  setHasAvailability(false);
                }
              } else {
                setHasAvailability(false);
              }
            }
            
            setHasActiveGroup(hasGroup);
          } else {
            setProfileComplete(false);
            setHasActiveGroup(false);
            setHasAvailability(false);
            setHasZone(false);
          }
        } catch (e) {
          console.warn('[Index] Error checking:', e);
          setProfileComplete(false);
          setHasActiveGroup(false);
          setHasAvailability(false);
          setHasZone(false);
        } finally {
          setChecking(false);
        }
      })();
    }
  }, [isLoading, profileComplete, checking]);

  // Redirection selon l'état
  useEffect(() => {
    if (isLoading || checking) return;
    
    if (profileComplete === false) {
      // Pas de session -> signin, sinon -> profil
      (async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData?.session) {
          router.replace('/signin');
        } else {
          router.replace('/(tabs)/profil');
        }
      })();
      return;
    }
    
    if (profileComplete === true && hasZone === false) {
      router.replace('/zone');
      return;
    }

    if (profileComplete === true && hasActiveGroup === false) {
      // Profil OK mais pas de groupe -> groupes
      router.replace('/(tabs)/groupes');
      return;
    }
    
    if (profileComplete === true && hasActiveGroup === true) {
      // Profil OK et groupe sélectionné -> rediriger vers matches
      // La popup de disponibilités s'affichera automatiquement si nécessaire lors de la visite de la page semaine
      router.replace('/(tabs)/matches');
      return;
    }
  }, [isLoading, checking, profileComplete, hasActiveGroup, hasAvailability, hasZone]);

  // Afficher un loader pendant la vérification
  if (isLoading || checking || profileComplete === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#001831' }}>
        <ActivityIndicator size="large" color="#e0ff00" />
      </View>
    );
  }

  return null;
}