import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/auth';
import { hasAvailabilityForGroup } from '../lib/availabilityCheck';
import { isProfileComplete } from '../lib/profileCheck';
import { supabase } from '../lib/supabase';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();
  const [profileComplete, setProfileComplete] = useState(null);
  const [hasActiveGroup, setHasActiveGroup] = useState(null);
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
            
            // Vérifier si un groupe est sélectionné
            const savedGroupId = await AsyncStorage.getItem("active_group_id");
            const hasGroup = !!savedGroupId;
            setHasActiveGroup(hasGroup);
            
            // Si groupe existe, vérifier les disponibilités
            if (hasGroup && savedGroupId) {
              const hasAvail = await hasAvailabilityForGroup(userId, savedGroupId);
              setHasAvailability(hasAvail);
            } else {
              setHasAvailability(false);
            }
          } else {
            setProfileComplete(false);
            setHasActiveGroup(false);
            setHasAvailability(false);
          }
        } catch (e) {
          console.warn('[Index] Error checking:', e);
          setProfileComplete(false);
          setHasActiveGroup(false);
          setHasAvailability(false);
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
    
    if (profileComplete === true && hasActiveGroup === false) {
      // Profil OK mais pas de groupe -> groupes
      router.replace('/(tabs)/groupes');
      return;
    }
    
    if (profileComplete === true && hasActiveGroup === true) {
      // Profil OK et groupe sélectionné -> vérifier dispos
      if (hasAvailability === false) {
        // Pas de dispos -> dispos avec popup
        router.replace('/(tabs)/semaine?showDisposPrompt=true');
      } else if (hasAvailability === true) {
        // Dispos présentes -> matches sans popup
        router.replace('/(tabs)/matches');
      }
      return;
    }
  }, [isLoading, checking, profileComplete, hasActiveGroup, hasAvailability]);

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