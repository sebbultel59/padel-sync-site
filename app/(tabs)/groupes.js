// app/(tabs)/groupes.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Clipboard,
  DeviceEventEmitter,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Leaderboard from "../../components/Leaderboard";
import { OnboardingModal } from "../../components/OnboardingModal";
import { useActiveGroup } from "../../lib/activeGroup";
import { hasAvailabilityForGroup } from "../../lib/availabilityCheck";
import { haversineKm } from "../../lib/geography";
import { validateActiveGroup } from "../../lib/groupValidation";
import { FLAG_KEYS, getOnboardingFlag, setOnboardingFlag } from "../../lib/onboardingFlags";
import { useIsAdmin, useIsSuperAdmin, useUserRole } from "../../lib/roles";
import { supabase } from "../../lib/supabase";
import { computeInitials, press } from "../../lib/uiSafe";

async function hapticSelect() {
  try {
    const available = await (Haptics.isAvailableAsync?.() ?? Promise.resolve(false));
    if (available) {
      if (Platform.OS === "ios") {
        // Plus perceptible que selectionAsync
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        // Android: expo-haptics route si dispo
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }
  } catch {}
  // Fallback vibration court mais perceptible
  try {
    Vibration.vibrate(30);
  } catch {}
}


const BRAND = "#1a4b97";
const WEB_BASE_URL = "https://syncpadel.app"; // Domaine web pour les liens dans les emails

// Niveau → couleur (cohérent avec LEVELS global)
const LEVEL_COLORS = {
  1: '#a3e635', // Débutant
  2: '#86efac', // Perfectionnement
  3: '#0e7aff', // Élémentaire
  4: '#0d97ac', // Intermédiaire
  5: '#ff9d00', // Confirmé
  6: '#f06300', // Avancé
  7: '#fb7185', // Expert
  8: '#a78bfa', // Elite
};
const colorForLevel = (n) => LEVEL_COLORS[n] || '#9ca3af';

const toNumberOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};


// Helper: base64 -> ArrayBuffer (sans atob, compatible Hermes)
function base64ToArrayBuffer(base64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let bytes = [];
  let i = 0;
  while (i < base64.length) {
    const c1 = chars.indexOf(base64.charAt(i++));
    const c2 = chars.indexOf(base64.charAt(i++));
    const c3 = chars.indexOf(base64.charAt(i++));
    const c4 = chars.indexOf(base64.charAt(i++));
    const b1 = (c1 << 2) | (c2 >> 4);
    const b2 = ((c2 & 15) << 4) | (c3 >> 2);
    const b3 = ((c3 & 3) << 6) | c4;
    bytes.push(b1 & 0xff);
    if (c3 !== 64) bytes.push(b2 & 0xff);
    if (c4 !== 64) bytes.push(b3 & 0xff);
  }
  return new Uint8Array(bytes).buffer;
}


function Avatar({ url, fallback, size = 48, level = null, onPress, profile, onLongPressProfile, isAdmin = false, ...rest }) {
  const S = Math.round(size * 1.2);
  const initials = computeInitials(fallback || "?");
  
  const handlePress = () => {
    // Clic court: ne pas ouvrir la modale; respecter onPress si fourni
    if (onPress) {
      onPress();
    }
  };

  const handleLongPress = () => {
    // Clic long: ouvrir la modale de profil si disponible
    if (profile && onLongPressProfile) {
      onLongPressProfile(profile);
    }
  };
  
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={450}
      disabled={!onPress && !onLongPressProfile}
      style={[
        Platform.OS === "web" && { cursor: (onPress || onLongPressProfile) ? "pointer" : "default" }
      ]}
    >
      <View style={{ width: S, height: S }}>
        {url ? (
          <Image
            source={{ uri: url }}
            style={{
              width: S,
              height: S,
              borderRadius: S / 2,
              backgroundColor: "#eef2f7",
            }}
          />
        ) : (
          <View
            style={{
              width: S,
              height: S,
              borderRadius: S / 2,
              backgroundColor: "#eaf2ff",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: BRAND,
            }}
          >
            <Text style={{ color: BRAND, fontWeight: "800", fontSize: Math.max(14, Math.round(S * 0.40)) }}>
              {initials}
            </Text>
          </View>
        )}
        {isAdmin && (
          <View
            style={{
              position: 'absolute',
              top: -8,
              right: -4,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: '25deg' }],
            }}
            accessibilityLabel="Admin"
          >
            <Text style={{ fontSize: 16, lineHeight: 20 }}>👑</Text>
          </View>
        )}
        {!!level && (
          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              backgroundColor: colorForLevel(level), // background = couleur du niveau
              borderColor: '#ffffff',               // fin liseré blanc pour le contraste
              borderWidth: 1,
              borderRadius: 10,
              minWidth: 18,
              height: 18,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
            }}
            accessibilityLabel={`Niveau ${level}`}
          >
            <Text style={{ color: '#000000', fontWeight: '900', fontSize: 10, lineHeight: 12 }}>
              {String(level)}
            </Text>
          </View>
        )}
          </View>
    </Pressable>
  );
}

export default function GroupesScreen() {
  const { activeGroup, setActiveGroup } = useActiveGroup();
  const nav = useRouter();
  const isSuperAdmin = useIsSuperAdmin();
  const isGlobalAdmin = useIsAdmin();
  const { role: userRole, clubId: userClubId } = useUserRole();
  const insets = useSafeAreaInsets();

  // --- Auth guard ---
  const [authChecked, setAuthChecked] = useState(false);
  const [meId, setMeId] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      (async () => {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id ?? null;
        if (!uid) {
          nav.replace("/(auth)/signin");
          return;
        }
        if (mounted) {
          setMeId(uid);
          setAuthChecked(true);
        }

        // Vérifier que le groupe actif correspond bien à un groupe dont l'utilisateur est membre
        if (mounted && activeGroup?.id && uid) {
          const isValid = await validateActiveGroup(uid, activeGroup.id);
          if (!isValid) {
            // Le groupe actif n'est plus valide, réinitialiser
            console.log('[Groupes] Active group is invalid, resetting:', activeGroup.id);
            setActiveGroup(null);
            try {
              await AsyncStorage.removeItem("active_group_id");
              // Nettoyer aussi dans le profil
              await supabase
                .from("profiles")
                .update({ active_group_id: null })
                .eq("id", uid);
            } catch (e) {
              console.warn('[Groupes] Error cleaning invalid group:', e);
            }
          }
        }

        // Afficher la popup si pas de groupe sélectionné (une seule fois par session)
        if (mounted && !activeGroup?.id) {
          setGroupsVisitedModalVisible(true);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [nav, activeGroup?.id, setActiveGroup])
  );

  // --- Données groupes ---
  const [groups, setGroups] = useState({ mine: [], open: [] });
  const [loading, setLoading] = useState(true);
const [publicGroupsClubFilter, setPublicGroupsClubFilter] = useState(null); // null = tous les clubs
const [publicGroupsClubPickerVisible, setPublicGroupsClubPickerVisible] = useState(false);
  
  // Filtre géographique avancé
  const [publicGroupsGeoFilterVisible, setPublicGroupsGeoFilterVisible] = useState(false); // Visibilité de la zone de configuration géographique
  const [publicGroupsGeoLocationType, setPublicGroupsGeoLocationType] = useState(null); // null | 'current' | 'home' | 'work' | 'city'
  const [publicGroupsGeoRefPoint, setPublicGroupsGeoRefPoint] = useState(null); // { lat, lng, address } | null
  const [publicGroupsGeoCityQuery, setPublicGroupsGeoCityQuery] = useState('');
  const [publicGroupsGeoCitySuggestions, setPublicGroupsGeoCitySuggestions] = useState([]);
  const [publicGroupsGeoRadiusKm, setPublicGroupsGeoRadiusKm] = useState(null); // null | 10 | 20 | 30 | 40 | 50
  const [locationPermission, setLocationPermission] = useState(null);
  const [myProfile, setMyProfile] = useState(null);
  
  // Le filtre géographique est actif si un point de référence est défini
  const publicGroupsGeoFilter = publicGroupsGeoRefPoint && publicGroupsGeoRefPoint.lat != null && publicGroupsGeoRefPoint.lng != null;

  const [members, setMembers] = useState([]);
  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [joinRequestsModalVisible, setJoinRequestsModalVisible] = useState(false);
  const [contactProfile, setContactProfile] = useState(null);
  const [contactVisible, setContactVisible] = useState(false);
  const [profileProfile, setProfileProfile] = useState(null);
  const [profileVisible, setProfileVisible] = useState(false);

  const [qrVisible, setQrVisible] = useState(false);
  const [qrCode, setQrCode] = useState(""); // Code d'invitation affiché

  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  const [joinRequestConfirmVisible, setJoinRequestConfirmVisible] = useState(false);
  const [pendingJoinGroupId, setPendingJoinGroupId] = useState(null);
  const [pendingJoinGroupName, setPendingJoinGroupName] = useState(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  // États pour l'édition inline du groupe
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState("");
  const [editingGroupVisibility, setEditingGroupVisibility] = useState("private");
  const [editingGroupJoinPolicy, setEditingGroupJoinPolicy] = useState("invite");
  const [editingGroupClubId, setEditingGroupClubId] = useState(null);
  const [editingGroupCity, setEditingGroupCity] = useState("");
  const [editingCitySuggestions, setEditingCitySuggestions] = useState([]);
  const [loadingEditingCitySuggestions, setLoadingEditingCitySuggestions] = useState(false);
  const [savingGroup, setSavingGroup] = useState(false);
  const [editClubPickerVisible, setEditClubPickerVisible] = useState(false);

  // États pour les popups d'onboarding
  const [groupsVisitedModalVisible, setGroupsVisitedModalVisible] = useState(false);
  const [groupJoinedModalVisible, setGroupJoinedModalVisible] = useState(false);
  const [noAvailabilityModalVisible, setNoAvailabilityModalVisible] = useState(false);

  const openContactForProfile = useCallback((p) => {
    console.log('[openContactForProfile] Called with profile:', p?.name, p?.phone, p?.email);
    setContactProfile(p || null);
    setContactVisible(true);
  }, []);

  const openClubPage = useCallback((clubId) => {
    if (!clubId) return;
    router.push(`/clubs/${clubId}?returnTo=groupes`);
  }, []);

  const openProfileForProfile = useCallback((p) => {
    console.log('[openProfileForProfile] Called with profile:', p?.name, p?.email);
    setProfileProfile(p || null);
    setProfileVisible(true);
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const { data: u } = await supabase.auth.getUser();
      const me = u?.user?.id;
      if (!me) return;

      const { data: myMemberships, error: eMemb } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", me);
      if (eMemb) throw eMemb;
      const myIds = [...new Set((myMemberships ?? []).map((r) => r.group_id))];

      let myGroups = [];
      if (myIds.length) {
        const { data, error } = await supabase
          .from("groups")
          .select("id, name, avatar_url, visibility, join_policy, created_by, club_id, city")
          .in("id", myIds)
          .order("created_at", { ascending: false });
        if (error) throw error;
        
        // Charger les noms et coordonnées des clubs séparément si nécessaire
        const clubIds = [...new Set((data ?? []).map(g => g.club_id).filter(Boolean))];
        let clubsMap = {};
        if (clubIds.length > 0) {
          const { data: clubsData } = await supabase
            .from("clubs")
            .select("id, name, lat, lng")
            .in("id", clubIds);
          clubsMap = new Map(
            (clubsData || []).map((c) => [
              c.id,
              { name: c.name, lat: toNumberOrNull(c.lat), lng: toNumberOrNull(c.lng) },
            ])
          );
        }
        
        myGroups = (data ?? []).map(g => {
          const club = g.club_id ? (clubsMap.get(g.club_id) || null) : null;
          return {
          ...g,
            club_name: club?.name || null,
            club_lat: toNumberOrNull(club?.lat),
            club_lng: toNumberOrNull(club?.lng),
          };
        });
      }

      const { data: openPublic, error: eOpen } = await supabase
         .from("groups")
         .select("id, name, avatar_url, visibility, join_policy, club_id")
         .ilike("visibility", "public"); // ← gère 'Public', 'PUBLIC', etc.
      if (eOpen) throw eOpen;
      
      // Charger les noms et coordonnées des clubs pour les groupes publics
      const publicClubIds = [...new Set((openPublic ?? []).map(g => g.club_id).filter(Boolean))];
      let publicClubsMap = {};
      if (publicClubIds.length > 0) {
        const { data: publicClubsData } = await supabase
          .from("clubs")
          .select("id, name, lat, lng")
          .in("id", publicClubIds);
        publicClubsMap = new Map(
          (publicClubsData || []).map((c) => [
            c.id,
            { name: c.name, lat: toNumberOrNull(c.lat), lng: toNumberOrNull(c.lng) },
          ])
        );
      }
      
        const openList = (openPublic ?? [])
          .map(g => {
            const club = g.club_id ? (publicClubsMap.get(g.club_id) || null) : null;
            return {
            ...g,
            visibility: String(g.visibility || "").toLowerCase(),
            join_policy: String(g.join_policy || "").toLowerCase(),
              club_name: club?.name || null,
              club_lat: toNumberOrNull(club?.lat),
              club_lng: toNumberOrNull(club?.lng),
            };
          })
          .filter((g) => !myIds.includes(g.id));
      console.log("[Groupes] openPublic count =", openPublic?.length, openPublic?.slice?.(0,3));

      setGroups({ mine: myGroups, open: openList });
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked) loadGroups();
  }, [authChecked, loadGroups]);

  // Liste des clubs uniques des groupes publics pour le filtre
  const selectPublicGroupClub = useCallback((clubId) => {
    setPublicGroupsClubFilter(clubId);
    setPublicGroupsClubPickerVisible(false);
  }, []);

  // Calculer les clubs publics avec distances (comme dans profil.js)
  const calculatePublicGroupsClubs = useCallback(() => {
    const clubsMap = new Map();
    (groups.open ?? []).forEach(g => {
      if (g.club_id && g.club_name) {
        clubsMap.set(g.club_id, {
          id: g.club_id,
          name: g.club_name,
          lat: g.club_lat ?? null,
          lng: g.club_lng ?? null,
        });
      }
    });
    let arr = Array.from(clubsMap.values());
    
    // Déterminer le point de référence : filtre géographique activé, sinon domicile
    let refPoint = null;
    if (publicGroupsGeoRefPoint && publicGroupsGeoRefPoint.lat != null && publicGroupsGeoRefPoint.lng != null) {
      refPoint = {
        lat: toNumberOrNull(publicGroupsGeoRefPoint.lat),
        lng: toNumberOrNull(publicGroupsGeoRefPoint.lng),
      };
      if (refPoint.lat == null || refPoint.lng == null) {
        refPoint = null;
      }
    } else if (addressHome?.lat && addressHome?.lng) {
      // Utiliser directement addressHome comme dans profil.js
      refPoint = {
        lat: addressHome.lat,
        lng: addressHome.lng,
      };
    }
    
    if (refPoint && refPoint.lat != null && refPoint.lng != null) {
      arr = arr
        .map((club) => {
          const clubLat = toNumberOrNull(club.lat);
          const clubLng = toNumberOrNull(club.lng);
          const distance = clubLat != null && clubLng != null
            ? haversineKm(refPoint, { lat: clubLat, lng: clubLng })
            : Infinity;
          return {
            ...club,
            lat: clubLat,
            lng: clubLng,
            distanceKm: distance,
          };
        })
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    } else {
      arr = arr
        .map((club) => ({ ...club, distanceKm: null }))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return arr;
  }, [groups.open, publicGroupsGeoRefPoint, addressHome]);

  const [publicGroupsClubs, setPublicGroupsClubs] = useState([]);

  // Recalculer quand les dépendances changent ou quand la modale s'ouvre
  useEffect(() => {
    setPublicGroupsClubs(calculatePublicGroupsClubs());
  }, [calculatePublicGroupsClubs]);

  useEffect(() => {
    if (publicGroupsClubPickerVisible) {
      setPublicGroupsClubs(calculatePublicGroupsClubs());
    }
  }, [publicGroupsClubPickerVisible, calculatePublicGroupsClubs]);

  const selectedPublicGroupClub = useMemo(() => {
    if (!publicGroupsClubFilter) return null;
    return publicGroupsClubs.find((club) => club.id === publicGroupsClubFilter) || null;
  }, [publicGroupsClubFilter, publicGroupsClubs]);

  // Groupes publics filtrés par club et/ou distance
  const filteredPublicGroups = useMemo(() => {
    let filtered = groups.open ?? [];

    // Filtre par club
    if (publicGroupsClubFilter) {
      filtered = filtered.filter((g) => g.club_id === publicGroupsClubFilter);
    }

    // Déterminer le point de référence (filtre actif sinon domicile)
    let refPoint = null;
    if (
      publicGroupsGeoFilter &&
      publicGroupsGeoRefPoint &&
      publicGroupsGeoRefPoint.lat != null &&
      publicGroupsGeoRefPoint.lng != null
    ) {
      refPoint = {
        lat: toNumberOrNull(publicGroupsGeoRefPoint.lat),
        lng: toNumberOrNull(publicGroupsGeoRefPoint.lng),
      };
    } else if (addressHome && addressHome.lat != null && addressHome.lng != null) {
      refPoint = {
        lat: toNumberOrNull(addressHome.lat),
        lng: toNumberOrNull(addressHome.lng),
      };
    }

    // Enrichir avec distance
    if (refPoint && refPoint.lat != null && refPoint.lng != null) {
      filtered = filtered
        .map((g) => {
          const clubLat = toNumberOrNull(g.club_lat);
          const clubLng = toNumberOrNull(g.club_lng);
          let distance = null;
          if (clubLat != null && clubLng != null) {
            distance = haversineKm(refPoint, { lat: clubLat, lng: clubLng });
          }
          return { ...g, distanceKm: distance };
        })
        .map((g) =>
          g.distanceKm === Infinity ? { ...g, distanceKm: null } : g
        );

      if (
        publicGroupsGeoFilter &&
        publicGroupsGeoRadiusKm != null &&
        Number.isFinite(publicGroupsGeoRadiusKm)
      ) {
        filtered = filtered
          .filter(
            (g) =>
              g.distanceKm !== null &&
              g.distanceKm !== Infinity &&
              g.distanceKm <= publicGroupsGeoRadiusKm
          )
          .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      } else {
        filtered = filtered.sort(
          (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
        );
      }
    }

    return filtered;
  }, [
    groups.open,
    publicGroupsClubFilter,
    publicGroupsGeoFilter,
    publicGroupsGeoRefPoint,
    publicGroupsGeoRadiusKm,
    addressHome,
  ]);

  // Membres & droits admin du groupe actif
  const loadMembersAndAdmin = useCallback(
    async (groupId) => {
      setMembers([]);
      setIsAdmin(false);
      setIsAdminLoading(true);

      if (!groupId) {
        setIsAdminLoading(false);
        return;
      }
      try {
        const { data: gms, error: eGM } = await supabase
          .from("group_members")
          .select("user_id, role")
          .eq("group_id", groupId);
        if (eGM) throw eGM;

        const ids = [...new Set((gms ?? []).map((gm) => gm.user_id))];
        let mapped = [];
        if (ids.length) {
          const { data: profs, error: eP } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, niveau, phone")
            .in("id", ids);
          if (eP) throw eP;

          const profById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
          mapped = (gms ?? []).map((gm) => {
            const p = profById[gm.user_id];
            return {
              id: gm.user_id,
              name: p?.display_name || "Joueur",
              avatar_url: p?.avatar_url ?? null,
              niveau: p?.niveau ?? null,
              phone: p?.phone ?? null,
              is_admin: gm.role === "admin" || gm.role === "owner",
            };
          });
        }
        setMembers(mapped);

        // Vérifier si l'utilisateur peut gérer le groupe (utilise can_manage_group)
        if (meId) {
          const { data: canManage, error: eCanManage } = await supabase
            .rpc('can_manage_group', { p_group_id: groupId, p_user_id: meId });
          
          if (eCanManage) {
            // Fallback: vérifier si l'utilisateur est admin du groupe
            const { data: meRow, error: eMe } = await supabase
              .from("group_members")
              .select("role")
              .eq("group_id", groupId)
              .eq("user_id", meId)
              .maybeSingle();
            if (eMe) throw eMe;
            setIsAdmin(meRow?.role === "admin" || meRow?.role === "owner" || isSuperAdmin);
          } else {
            setIsAdmin(canManage === true || isSuperAdmin);
          }
        }
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? String(e));
      } finally {
        setIsAdminLoading(false);
      }
    },
    [meId, isSuperAdmin]
  );
  const contactMember = useCallback((m) => {
    if (!m?.phone) {
      Alert.alert("Aucun numéro", `${m?.name || "Ce membre"} n'a pas de numéro renseigné.`);
      return;
    }
    const telUrl = `tel:${m.phone}`;
    const smsUrl = `sms:${m.phone}`;

    if (Platform.OS === 'ios' && ActionSheetIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: m.name || 'Contacter',
          options: ['📞 Appeler', '💬 SMS', 'Annuler'],
          cancelButtonIndex: 2,
          userInterfaceStyle: 'dark',
        },
        (idx) => {
          if (idx === 0) Linking.openURL(telUrl).catch(() => {});
          else if (idx === 1) Linking.openURL(smsUrl).catch(() => {});
        }
      );
    } else {
      Alert.alert(
        m.name || 'Contacter',
        m.phone,
        [
          { text: 'Appeler', onPress: () => Linking.openURL(telUrl).catch(() => {}) },
          { text: 'SMS', onPress: () => Linking.openURL(smsUrl).catch(() => {}) },
          { text: 'Annuler', style: 'cancel' },
        ]
      );
    }
  }, []);

  // Charger les demandes de rejoindre pour le groupe actif
  const loadJoinRequests = useCallback(async (groupId) => {
    if (!groupId) {
      setJoinRequests([]);
      return;
    }
    
    try {
      // Charger les demandes en attente pour ce groupe
      const { data: requests, error } = await supabase
        .from('group_join_requests')
        .select(`
          id,
          user_id,
          status,
          requested_at,
          profiles!group_join_requests_user_id_fkey (
            id,
            name,
            display_name,
            avatar_url
          )
        `)
        .eq('group_id', groupId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });
      
      if (error) {
        console.error('[loadJoinRequests] Error:', error);
        // Si la foreign key join ne fonctionne pas, charger les profils séparément
        const { data: simpleRequests, error: simpleError } = await supabase
          .from('group_join_requests')
          .select('id, user_id, status, requested_at')
          .eq('group_id', groupId)
          .eq('status', 'pending')
          .order('requested_at', { ascending: false });
        
        if (simpleError) {
          console.error('[loadJoinRequests] Simple query error:', simpleError);
          setJoinRequests([]);
          return;
        }
        
        // Charger les profils séparément
        if (simpleRequests && simpleRequests.length > 0) {
          const userIds = simpleRequests.map(r => r.user_id);
          const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, name, display_name, avatar_url')
            .in('id', userIds);
          
          if (profilesError) {
            console.error('[loadJoinRequests] Profiles error:', profilesError);
            setJoinRequests([]);
            return;
          }
          
          const profilesById = Object.fromEntries((profiles || []).map(p => [p.id, p]));
          const requestsWithProfiles = simpleRequests.map(r => ({
            ...r,
            profiles: profilesById[r.user_id] || null
          }));
          setJoinRequests(requestsWithProfiles);
        } else {
          setJoinRequests([]);
        }
        return;
      }
      
      setJoinRequests(requests || []);
    } catch (e) {
      console.error('[loadJoinRequests] Exception:', e);
      setJoinRequests([]);
    }
  }, []);

  // Éviter de recharger les demandes si elles sont déjà chargées pour ce groupe
  const lastLoadedGroupId = useRef(null);
  const isLoadingRequests = useRef(false);

  useEffect(() => {
    if (authChecked) {
      loadMembersAndAdmin(activeGroup?.id ?? null);
    }
  }, [authChecked, activeGroup?.id, loadMembersAndAdmin]);

  // Charger les demandes séparément pour éviter les boucles
  useEffect(() => {
    if (authChecked && isAdmin && activeGroup?.id) {
      // Ne recharger que si c'est un nouveau groupe ou si on n'est pas déjà en train de charger
      if (lastLoadedGroupId.current !== activeGroup.id && !isLoadingRequests.current) {
        lastLoadedGroupId.current = activeGroup.id;
        isLoadingRequests.current = true;
        loadJoinRequests(activeGroup.id).finally(() => {
          isLoadingRequests.current = false;
        });
      }
    } else if (!isAdmin || !activeGroup?.id) {
      lastLoadedGroupId.current = null;
      setJoinRequests([]);
    }
  }, [authChecked, activeGroup?.id, isAdmin, loadJoinRequests]);

  // --- Activer un groupe ---
  const onActivate = useCallback(async (g) => {
    try {
      if (!g?.id) return;

      console.log("[Groupes] onActivate pressed →", g.id, g.name);

      // 1) Met à jour l'état global immédiatement
      setActiveGroup(g);

      // 2) Persiste localement l'ID pour fallback côté Semaine
      try {
        await AsyncStorage.setItem("active_group_id", String(g.id));
      } catch (err) {
        console.warn("[Groupes] AsyncStorage.setItem failed:", err?.message || err);
      }

      // 3) Persiste (best-effort) dans le profil
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (uid) {
          await supabase
            .from("profiles")
            .update({ active_group_id: g.id })
            .eq("id", uid);
        }
      } catch (err) {
        console.warn("[Groupes] persist active_group_id failed:", err?.message || err);
      }

      // 4) Recharge le contexte membres/admin pour ce groupe
      await loadMembersAndAdmin(g.id);

      // 5) Informe le reste de l'app (si des écrans écoutent cet event)
      try {
        DeviceEventEmitter.emit("ACTIVE_GROUP_CHANGED", { groupId: g.id });
      } catch {}

      // 6) Feedback utilisateur (uniquement haptique / vibrate)
      await hapticSelect();

      // 7) Vérifier les disponibilités pour ce groupe et afficher popup si nécessaire
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        
        if (uid) {
          const hasAvail = await hasAvailabilityForGroup(uid, g.id);
          
          if (!hasAvail) {
            // Pas de dispos -> afficher popup (sans redirection)
            setNoAvailabilityModalVisible(true);
          }
        }
      } catch (e) {
        console.warn('[Groupes] Error checking availability after activate:', e);
      }

    } catch (e) {
      console.error("[Groupes] onActivate error:", e);
      Alert.alert("Erreur", e?.message ?? String(e)); // garde uniquement les alertes d'erreur
    }
  }, [setActiveGroup, loadMembersAndAdmin]);

  // --- Invites / QR / Avatar / Rejoindre public ---
  const buildInviteDeepLink = useCallback((groupId) => {
    return `syncpadel://join?group_id=${groupId}`;
  }, []);

  const onInviteLink = useCallback(async () => {
    if (!activeGroup?.id) return;
    try {
      let inviteCode;
      
      // Pour les groupes privés : utiliser le code unique réutilisable
      if (activeGroup.visibility === 'private') {
        const { data: code, error: rpcError } = await supabase.rpc('get_or_create_group_invite_code', {
          p_group_id: activeGroup.id
        });
        
        if (rpcError) {
          throw rpcError;
        }
        inviteCode = code;
      } else {
        // Pour les groupes publics : créer ou récupérer un code d'invitation à usage unique
      const { data: existingInvite, error: fetchError } = await supabase
        .from('invitations')
        .select('code')
        .eq('group_id', activeGroup.id)
        .eq('used', false)
          .eq('reusable', false)  // S'assurer qu'on ne récupère pas un code réutilisable
        .limit(1)
        .maybeSingle();
      
      if (existingInvite?.code) {
        inviteCode = existingInvite.code;
      } else {
          // Créer un nouveau code d'invitation à usage unique
        const { data: newInvite, error: createError } = await supabase
          .from('invitations')
          .insert({
            group_id: activeGroup.id,
            code: Math.random().toString(36).substring(2, 8).toUpperCase(),
              created_by: meId,
              reusable: false  // Code à usage unique pour les groupes publics
          })
          .select('code')
          .single();
        
        if (createError) {
          throw createError;
        }
        inviteCode = newInvite.code;
        }
      }
      
      // Liens de téléchargement de l'app
      const iosAppLink = "https://apps.apple.com/app/padel-sync/id6754223924";
      const androidAppLink = "https://play.google.com/store/apps/details?id=com.padelsync.app";
      
      const message = `🎾 Rejoins mon groupe Padel Sync !

Organise tes matchs en 3 clics avec l'app Padel Sync 📱



🔑 CODE DU GROUPE

${inviteCode}



➡️ Une fois l'app installée

1️⃣ Ouvre l'app Padel Sync

2️⃣ Va dans l'onglet "Groupes"

3️⃣ Clique sur "Rejoindre un groupe"

4️⃣ Entre le code ci-dessus



📲 Installe l'app ici

🍎 iOS
${iosAppLink}

🤖 Android
${androidAppLink}



Padel Sync — Ton match en 3 clics 🎾`;
      
      await Share.share({ message });
    } catch (e) {
      console.error('[Invite] Erreur:', e);
      Alert.alert("Partage impossible", e?.message ?? String(e));
    }
  }, [activeGroup?.id, meId]);

  const onInviteQR = useCallback(async () => {
    if (!activeGroup?.id) return;
    try {
      // Récupérer le code d'invitation pour l'inclure directement dans le QR code
      // C'est plus simple et fiable : l'utilisateur scanne et entre le code dans l'app
      let inviteCode;
      
      // Pour les groupes privés : utiliser le code unique réutilisable
      if (activeGroup.visibility === 'private') {
        const { data: code, error: rpcError } = await supabase.rpc('get_or_create_group_invite_code', {
          p_group_id: activeGroup.id
        });
        
        if (rpcError) {
          console.error('[QR] Erreur récupération code:', rpcError);
          Alert.alert("Erreur", "Impossible de récupérer le code d'invitation");
          return;
        }
        inviteCode = code;
      } else {
        // Pour les groupes publics : récupérer ou créer un code
        const { data: existingInvite, error: fetchError } = await supabase
          .from('invitations')
          .select('code')
          .eq('group_id', activeGroup.id)
          .eq('used', false)
          .eq('reusable', false)
          .limit(1)
          .maybeSingle();
        
        if (existingInvite?.code) {
          inviteCode = existingInvite.code;
        } else {
          // Créer un nouveau code
          const { data: newInvite, error: createError } = await supabase
            .from('invitations')
            .insert({
              group_id: activeGroup.id,
              code: Math.random().toString(36).substring(2, 8).toUpperCase(),
              created_by: meId,
              reusable: false
            })
            .select('code')
            .single();
          
          if (createError) {
            console.error('[QR] Erreur création code:', createError);
            Alert.alert("Erreur", "Impossible de créer le code d'invitation");
            return;
          }
          inviteCode = newInvite.code;
        }
      }
      
      // Afficher le code d'invitation (sans QR code)
      setQrCode(inviteCode);
    setQrVisible(true);
    } catch (e) {
      console.error('[QR] Erreur:', e);
      Alert.alert("Erreur", "Impossible de générer le QR code");
    }
  }, [activeGroup?.id, activeGroup?.visibility, meId]);

  const onChangeGroupAvatar = useCallback(async () => {
    if (!activeGroup?.id) return;
    if (!isAdmin) {
      Alert.alert("Action réservée", "Seuls les admins peuvent changer l’avatar du groupe.");
      return;
    }
    try {
      console.log('[Avatar] picker:open');
      const pickerMediaTypes = ImagePicker?.MediaType?.IMAGES
        ? { mediaTypes: [ImagePicker.MediaType.IMAGES] }
        : { mediaTypes: ImagePicker?.MediaTypeOptions?.Images };

      const res = await ImagePicker.launchImageLibraryAsync({
        ...pickerMediaTypes,
        // Ouvre l'éditeur natif de recadrage avec ratio carré
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      console.log('[Avatar] launchImageLibraryAsync:result', { canceled: res?.canceled, assetsLen: res?.assets?.length });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      const asset = res.assets[0];
      const uri = asset.uri;
      console.log('[Avatar] picker:uri', uri);
      // Utiliser directement l’URI recadrée par le picker (carré)
      const finalUri = uri;
      console.log('[Avatar] final uri', finalUri);
      const arrayBuffer = await (await fetch(finalUri)).arrayBuffer();

      const ts = Date.now();
      const path = `${activeGroup.id}/avatar-${ts}.jpg`;
      const contentType = "image/jpeg";

      console.log('[Avatar] upload:start', path);
      const { error: upErr } = await supabase.storage
        .from("group-avatars")
        .upload(path, arrayBuffer, { contentType, upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from("group-avatars").getPublicUrl(path);
      const publicUrl = pub?.publicUrl ?? null;
      if (!publicUrl) throw new Error("Impossible d'obtenir l'URL publique.");

      console.log('[Avatar] update group row with publicUrl');
      const { error: eUpd } = await supabase
        .from("groups")
        .update({ avatar_url: publicUrl })
        .eq("id", activeGroup.id);
      if (eUpd) throw eUpd;

      console.log('[Avatar] reload groups and set active');
      await loadGroups();
      const refreshed = (groups.mine ?? []).find((g) => g.id === activeGroup.id);
      if (refreshed) setActiveGroup(refreshed);

      Alert.alert("OK", "Avatar du groupe mis à jour.");
    } catch (e) {
      console.log('[Avatar] error', e);
      Alert.alert("Erreur avatar", e?.message ?? String(e));
    }
  }, [activeGroup?.id, isAdmin, groups, loadGroups, setActiveGroup]);

  // Fonction pour mettre à jour le groupe (nom et statut)
  const onUpdateGroup = useCallback(async (groupId) => {
    if (!groupId || !isAdmin) {
      Alert.alert("Erreur", "Vous n'avez pas les droits pour modifier ce groupe.");
      return;
    }

    // Validation du nom
    const trimmedName = editingGroupName.trim();
    if (!trimmedName || trimmedName.length < 3) {
      Alert.alert("Erreur", "Le nom du groupe doit contenir au moins 3 caractères.");
      return;
    }

    // Validation des restrictions selon les droits
    if (editingGroupVisibility === 'public' && editingGroupJoinPolicy === 'open') {
      // Public ouvert : uniquement super admin
      if (!isSuperAdmin) {
        Alert.alert('Restriction', 'Seuls les super admins peuvent créer un groupe public ouvert.');
        return;
      }
    } else if (editingGroupVisibility === 'public' && editingGroupJoinPolicy === 'request') {
      // Public sur demande : super admin, admin ou club_manager
      if (!isSuperAdmin && !isGlobalAdmin && userRole !== 'club_manager') {
        Alert.alert('Restriction', 'Seuls les admins, super admins et club managers peuvent créer un groupe public sur demande.');
        return;
      }
    } else if (editingGroupVisibility === 'private') {
      // Privé : toujours autorisé
      // join_policy sera 'invite' pour les groupes privés
    }

    setSavingGroup(true);
    try {
      // Normaliser les valeurs en minuscules pour éviter les problèmes de contrainte
      const normalizedVisibility = String(editingGroupVisibility || 'private').toLowerCase().trim();
      const normalizedJoinPolicy = editingGroupVisibility === 'private' 
        ? 'invite' 
        : String(editingGroupJoinPolicy || 'invite').toLowerCase().trim();
      
      const updateData = {
        name: trimmedName,
        visibility: normalizedVisibility,
        join_policy: normalizedJoinPolicy,
      };

      console.log('[onUpdateGroup] Updating group with:', updateData);

      // Préparer les paramètres de localisation
      const clubIdParam = (editingGroupClubId && String(editingGroupClubId).trim() !== '') ? String(editingGroupClubId).trim() : null;
      const cityParam = (editingGroupCity && String(editingGroupCity).trim() !== '') ? String(editingGroupCity).trim() : null;
      
      // Pour les groupes publics, la ville est obligatoire
      if (normalizedVisibility === 'public' && (!cityParam || cityParam.length < 2)) {
        Alert.alert("Ville requise", "Pour un groupe public, tu dois renseigner une ville.");
        setSavingGroup(false);
        return;
      }

      // Utiliser la fonction RPC pour mettre à jour le groupe (contourne les contraintes CHECK)
      const { data: updatedGroupId, error: updateError } = await supabase.rpc('rpc_update_group', {
        p_group_id: groupId,
        p_name: trimmedName,
        p_visibility: normalizedVisibility,
        p_join_policy: normalizedJoinPolicy,
        p_club_id: clubIdParam,
        p_city: cityParam,
      });

      if (updateError) {
        console.error('[onUpdateGroup] Supabase error:', updateError);
        console.error('[onUpdateGroup] Update data:', updateData);
        throw updateError;
      }

      // Rafraîchir la liste des groupes
      await loadGroups();
      
      // Mettre à jour le groupe actif avec les nouvelles valeurs normalisées
      if (activeGroup?.id === groupId) {
        // Charger les infos du club si nécessaire
        let clubName = null;
        if (clubIdParam) {
          const { data: clubData } = await supabase
            .from("clubs")
            .select("name")
            .eq("id", clubIdParam)
            .single();
          clubName = clubData?.name || null;
        }
        
        setActiveGroup({
          ...activeGroup,
          name: trimmedName,
          visibility: normalizedVisibility,
          join_policy: normalizedJoinPolicy,
          club_id: clubIdParam,
          city: cityParam,
          club_name: clubName,
        });
      }

      Alert.alert("Succès", "Le groupe a été mis à jour.");
      
      // Sortir du mode édition seulement en cas de succès
      setShowEditGroup(false);
      setEditingGroupId(null);
      setEditingGroupName("");
      setEditingGroupVisibility("private");
      setEditingGroupJoinPolicy("invite");
      setEditingGroupClubId(null);
      setEditingGroupCity("");
      setEditingCitySuggestions([]);
    } catch (e) {
      console.error('[onUpdateGroup] Erreur:', e);
      Alert.alert("Erreur", e?.message ?? "Impossible de mettre à jour le groupe.");
      // En cas d'erreur, on garde la modale ouverte
    } finally {
      setSavingGroup(false);
    }
  }, [isAdmin, isSuperAdmin, isGlobalAdmin, editingGroupName, editingGroupVisibility, editingGroupJoinPolicy, editingGroupClubId, editingGroupCity, loadGroups, activeGroup, setActiveGroup]);

  const onJoinPublic = useCallback(
    async (groupId) => {
      try {
        // Récupérer les informations du groupe pour vérifier le join_policy
        const { data: groupData, error: groupError } = await supabase
          .from("groups")
          .select("id, name, visibility, join_policy")
          .eq("id", groupId)
          .single();
        
        if (groupError || !groupData) {
          Alert.alert("Erreur", "Groupe non trouvé");
          return;
        }
        
        console.log('[onJoinPublic] Group data:', { 
          id: groupData.id, 
          name: groupData.name, 
          visibility: groupData.visibility, 
          join_policy: groupData.join_policy,
          visibilityType: typeof groupData.visibility,
          joinPolicyType: typeof groupData.join_policy
        });
        
        // Normaliser les valeurs (au cas où il y aurait des espaces ou des variations)
        const visibility = (groupData.visibility || '').trim().toLowerCase();
        const joinPolicy = (groupData.join_policy || '').trim().toLowerCase();
        
        console.log('[onJoinPublic] Normalized values:', { visibility, joinPolicy });
        
        // Si c'est un groupe public "sur demande" ou "sur invitation", afficher la popup de confirmation
        // Note: "invite" et "request" nécessitent tous deux une demande d'approbation
        if (visibility === 'public' && (joinPolicy === 'request' || joinPolicy === 'invite')) {
          console.log('[onJoinPublic] Groupe "sur demande/sur invitation" détecté, affichage popup');
          setPendingJoinGroupId(groupId);
          setPendingJoinGroupName(groupData.name);
          setJoinRequestConfirmVisible(true);
          return;
        }
        
        // Pour les groupes publics "ouverts", rejoindre directement
        if (visibility === 'public' && joinPolicy === 'open') {
          console.log('[onJoinPublic] Groupe "ouvert" détecté, rejoindre directement');
          const { data: rpcData, error: rpcError } = await supabase.rpc('join_public_group', {
            p_group_id: groupId
          });
          
          if (rpcError) {
            console.error('[onJoinPublic] Erreur RPC join_public_group:', rpcError);
            Alert.alert("Impossible de rejoindre", rpcError.message);
            return;
          }
          
          await loadGroups();
          const { data: joined } = await supabase
            .from("groups")
            .select("id, name, avatar_url")
            .eq("id", groupId)
            .single();
          setActiveGroup(joined);
          await loadMembersAndAdmin(groupId);
          
          // Vérifier si c'est la première fois qu'un groupe est rejoint
          const wasFirstJoin = !(await getOnboardingFlag(FLAG_KEYS.GROUP_JOINED));
          if (wasFirstJoin) {
            await setOnboardingFlag(FLAG_KEYS.GROUP_JOINED, true);
            setGroupJoinedModalVisible(true);
          } else {
            Alert.alert("Bienvenue 👍", "Tu as rejoint le groupe !");
          }
          return;
        }
        
        // Pour les autres types de groupes, ne pas permettre
        console.warn('[onJoinPublic] Type de groupe non géré:', { visibility, joinPolicy });
        Alert.alert("Impossible de rejoindre", `Ce groupe nécessite une invitation valide. (visibility: ${visibility}, join_policy: ${joinPolicy})`);
      } catch (e) {
        console.error('[onJoinPublic] Exception:', e);
        Alert.alert("Impossible de rejoindre", e?.message ?? String(e));
      }
    },
    [loadGroups, setActiveGroup, loadMembersAndAdmin]
  );

  const confirmJoinRequest = useCallback(async () => {
    if (!pendingJoinGroupId) return;
    
    try {
      // Créer la demande de rejoindre
      const { data: requestId, error: requestError } = await supabase.rpc('request_join_group', {
        p_group_id: pendingJoinGroupId
      });
      
      if (requestError) {
        Alert.alert("Erreur", requestError.message);
        return;
      }
      
      setJoinRequestConfirmVisible(false);
      Alert.alert(
        "Demande envoyée ✅",
        `Votre demande pour rejoindre "${pendingJoinGroupName}" a été envoyée. L'administrateur du groupe a été notifié et validera votre demande sous peu.`
      );
      
      setPendingJoinGroupId(null);
      setPendingJoinGroupName(null);
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? "Impossible d'envoyer la demande");
    }
  }, [pendingJoinGroupId, pendingJoinGroupName]);

  // Approuver une demande de rejoindre
  const approveJoinRequest = useCallback(async (requestId) => {
    try {
      const { data: groupId, error } = await supabase.rpc('approve_join_request', {
        p_request_id: requestId
      });
      
      if (error) {
        Alert.alert("Erreur", error.message);
        return;
      }
      
      // Recharger les demandes et les membres
      if (activeGroup?.id) {
        lastLoadedGroupId.current = null; // Forcer le rechargement
        await loadJoinRequests(activeGroup.id);
        await loadMembersAndAdmin(activeGroup.id);
      }
      await loadGroups();
      
      Alert.alert("Demande approuvée ✅", "L'utilisateur a rejoint le groupe.");
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? "Impossible d'approuver la demande");
    }
  }, [activeGroup?.id, loadJoinRequests, loadMembersAndAdmin, loadGroups]);

  // Exclure un membre du groupe
  const removeMember = useCallback(async (member) => {
    console.log('[removeMember] Appelé avec:', { member: member?.name, memberId: member?.id, activeGroupId: activeGroup?.id, isAdmin, isSuperAdmin, meId });
    
    if (!activeGroup?.id || !member?.id) {
      console.log('[removeMember] Retour précoce: pas de groupe ou pas de membre');
      return;
    }
    
    // Vérifier que l'utilisateur peut exclure ce membre
    if (!isAdmin && !isSuperAdmin) {
      console.log('[removeMember] Non autorisé: pas admin ni superadmin');
      Alert.alert("Non autorisé", "Seuls les administrateurs peuvent exclure des membres.");
      return;
    }
    
    // Ne pas permettre d'exclure soi-même
    if (member.id === meId) {
      console.log('[removeMember] Impossible: tentative d\'exclure soi-même');
      Alert.alert("Impossible", "Tu ne peux pas t'exclure toi-même du groupe.");
      return;
    }
    
    // Ne pas permettre d'exclure un admin (sauf si superadmin)
    if (member.is_admin && !isSuperAdmin) {
      console.log('[removeMember] Impossible: tentative d\'exclure un admin');
      Alert.alert("Impossible", "Tu ne peux pas exclure un administrateur du groupe.");
      return;
    }
    
    console.log('[removeMember] Affichage de la confirmation');
    // Confirmation avant suppression
    Alert.alert(
      "Exclure le membre",
      `Es-tu sûr de vouloir exclure ${member.name || "ce membre"} du groupe ?`,
      [
        { text: "Annuler", style: "cancel", onPress: () => console.log('[removeMember] Annulé') },
        {
          text: "Exclure",
          style: "destructive",
          onPress: async () => {
            console.log('[removeMember] Confirmation: suppression en cours');
            try {
              const { error } = await supabase
                .from("group_members")
                .delete()
                .eq("group_id", activeGroup.id)
                .eq("user_id", member.id);
              
              if (error) {
                console.error('[removeMember] Erreur Supabase:', error);
                throw error;
              }
              
              console.log('[removeMember] Membre supprimé, rechargement...');
              // Recharger les membres
              await loadMembersAndAdmin(activeGroup.id);
              await loadGroups();
              
              Alert.alert("Membre exclu ✅", `${member.name || "Le membre"} a été exclu du groupe.`);
            } catch (e) {
              console.error('[removeMember] Exception:', e);
              Alert.alert("Erreur", e?.message ?? "Impossible d'exclure le membre");
            }
          },
        },
      ]
    );
  }, [activeGroup?.id, isAdmin, isSuperAdmin, meId, loadMembersAndAdmin, loadGroups]);

  // Rejeter une demande de rejoindre
  const rejectJoinRequest = useCallback(async (requestId) => {
    try {
      const { data: groupId, error } = await supabase.rpc('reject_join_request', {
        p_request_id: requestId
      });
      
      if (error) {
        Alert.alert("Erreur", error.message);
        return;
      }
      
      // Recharger les demandes
      if (activeGroup?.id) {
        lastLoadedGroupId.current = null; // Forcer le rechargement
        await loadJoinRequests(activeGroup.id);
      }
      
      Alert.alert("Demande rejetée", "La demande a été rejetée.");
    } catch (e) {
      Alert.alert("Erreur", e?.message ?? "Impossible de rejeter la demande");
    }
  }, [activeGroup?.id, loadJoinRequests]);
  const onLeaveGroup = useCallback(() => {
    if (!activeGroup?.id) return;

    const groupId = activeGroup.id;
    const groupName = activeGroup.name || "Ce groupe";

    const doLeave = async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const me = u?.user?.id;
        if (!me) return;

        const { error } = await supabase
          .from("group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("user_id", me);
        if (error) throw error;

        setActiveGroup(null);
        await AsyncStorage.removeItem("active_group_id");
        await loadGroups();

        Alert.alert("Tu as quitté le groupe", groupName);
      } catch (e) {
        Alert.alert("Impossible de quitter", e?.message ?? String(e));
      }
    };

    Alert.alert(
      "Quitter le groupe",
      `Es-tu sûr(e) de vouloir quitter "${groupName}" ?`,
      [
        {
          text: "Annuler",
          style: "cancel",
        },
        {
          text: "Quitter",
          style: "destructive",
          onPress: doLeave,
        },
      ]
    );
  }, [activeGroup, setActiveGroup, loadGroups]);

  const onDeleteGroup = useCallback(() => {
    if (!activeGroup?.id) return;

    if (!isAdmin) {
      Alert.alert('Action réservée', "Seuls les admins peuvent supprimer le groupe.");
      return;
    }

    const groupId = activeGroup.id;
    const groupName = activeGroup.name || 'Ce groupe';

    Alert.alert(
      'Supprimer le groupe',
      `Voulez-vous vraiment supprimer "${groupName}" ? Cette action est définitive.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.from('groups').delete().eq('id', groupId);
              if (error) throw error;
              // Nettoyage local
              setActiveGroup(null);
              try { await AsyncStorage.removeItem('active_group_id'); } catch {}
              await loadGroups();
              Alert.alert('Groupe supprimé', `${groupName} a été supprimé.`);
              try { router.replace('/(tabs)/groupes'); } catch {}
            } catch (e) {
              Alert.alert('Suppression impossible', e?.message || 'Une erreur est survenue.');
            }
          }
        }
      ]
    );
  }, [activeGroup, isAdmin, setActiveGroup, loadGroups]);

  // --- Création de groupe ---
  const [showCreate, setShowCreate] = useState(false);
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createVisibility, setCreateVisibility] = useState("private");
  const [createJoinPolicy, setCreateJoinPolicy] = useState("invite");
  const [createClubId, setCreateClubId] = useState(null);
  const [createCity, setCreateCity] = useState("");
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [loadingCitySuggestions, setLoadingCitySuggestions] = useState(false);
  const [clubsList, setClubsList] = useState([]);
  const [loadingClubs, setLoadingClubs] = useState(false);
  const [clubPickerVisible, setClubPickerVisible] = useState(false);
  const [clubSearchText, setClubSearchText] = useState("");
  const [addressHome, setAddressHome] = useState(null);
  const cityDebounceTimer = useRef(null);
  const cityAbortController = useRef(null);

  const onCreateGroup = useCallback(() => {
    setCreateName("");
    setCreateVisibility("private");
    setCreateJoinPolicy("invite");
    setCreateClubId(null);
    setCreateCity("");
    setCitySuggestions([]);
    setShowCreate(true);
  }, []);
  
  // Charger les clubs pour le sélecteur (même logique que dans profil.js)
  const loadClubs = useCallback(async () => {
    setLoadingClubs(true);
    try {
      // Charger tous les clubs avec pagination
      const pageSize = 1000;
      let from = 0;
      let to = pageSize - 1;
      let allClubs = [];
      
      while (true) {
        const { data: page, error } = await supabase
          .from('clubs')
          .select('id, name, address, lat, lng')
          .not('lat', 'is', null)
          .not('lng', 'is', null)
          .order('name', { ascending: true })
          .range(from, to);
        
        if (error) throw error;
        
        const batch = Array.isArray(page) ? page : [];
        allClubs = allClubs.concat(batch);
        
        if (batch.length < pageSize) break; // dernière page atteinte
        from += pageSize;
        to += pageSize;
      }

      // Si le joueur a un domicile, trier par distance
      if (addressHome?.lat && addressHome?.lng) {
        const clubsWithDist = allClubs.map(c => ({
          ...c,
          distance: haversineKm(addressHome, { lat: c.lat, lng: c.lng })
        }));
        clubsWithDist.sort((a, b) => a.distance - b.distance);
        setClubsList(clubsWithDist);
      } else {
        // Sinon, trier par ordre alphabétique
        allClubs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClubsList(allClubs);
      }
    } catch (e) {
      console.warn('[Groupes] Erreur chargement clubs:', e);
      Alert.alert('Erreur', 'Impossible de charger la liste des clubs');
    } finally {
      setLoadingClubs(false);
    }
  }, [addressHome]);
  
  // Charger l'adresse du domicile de l'utilisateur
  useEffect(() => {
    console.log('[Groupes] useEffect addressHome - meId:', meId);
    if (meId) {
      (async () => {
        try {
          console.log('[Groupes] Chargement address_home pour meId:', meId);
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('address_home')
            .eq('id', meId)
            .single();
          
          console.log('[Groupes] Réponse profil:', { profile, error });
          
          if (profile?.address_home) {
            console.log('[Groupes] addressHome chargé:', {
              lat: profile.address_home.lat,
              lng: profile.address_home.lng,
              address: profile.address_home.address,
              typeLat: typeof profile.address_home.lat,
              typeLng: typeof profile.address_home.lng,
              fullObject: profile.address_home
            });
            // Créer un nouvel objet pour forcer la mise à jour du useMemo
            setAddressHome({ ...profile.address_home });
          } else {
            console.log('[Groupes] Pas d\'address_home dans le profil, profile:', profile);
          }
        } catch (e) {
          console.error('[Groupes] Erreur chargement adresse:', e);
        }
      })();
    } else {
      console.log('[Groupes] Pas de meId, impossible de charger addressHome');
    }
  }, [meId]);
  
  // Charger le profil complet pour le filtre géographique
  useEffect(() => {
    if (!meId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('address_home, address_work')
          .eq('id', meId)
          .single();
        if (data) {
          setMyProfile(data);
        }
      } catch (e) {
        console.warn('[Groupes] Erreur chargement profil:', e?.message ?? String(e));
      }
    })();
  }, [meId]);

  // Demander permission GPS au démarrage
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationPermission(status);
      } catch (e) {
        console.warn('[Groupes] location permission error:', e);
        setLocationPermission('denied');
      }
    })();
  }, []);
  
  // Autocomplétion ville via Nominatim pour le filtre géographique
  const searchPublicGroupsGeoCity = useCallback(async (query) => {
    if (!query || query.length < 3) {
      setPublicGroupsGeoCitySuggestions([]);
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url);
      const data = await res.json();
      const suggestions = (data || []).map(item => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
      setPublicGroupsGeoCitySuggestions(suggestions);
    } catch (e) {
      console.warn('[Groupes] city search error:', e);
      setPublicGroupsGeoCitySuggestions([]);
    }
  }, []);
  
  // Calculer le point de référence géographique pour le filtre
  const computePublicGroupsGeoRefPoint = useCallback(async () => {
    let point = null;
    if (publicGroupsGeoLocationType === 'current') {
      if (locationPermission !== 'granted') {
        Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à la localisation.');
        setPublicGroupsGeoLocationType(null);
        return null;
      }
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        point = { lat: loc.coords.latitude, lng: loc.coords.longitude, address: 'Position actuelle' };
      } catch (e) {
        Alert.alert('Erreur', 'Impossible d\'obtenir votre position. Utilisez une ville.');
        setPublicGroupsGeoLocationType(null);
        return null;
      }
    } else if (publicGroupsGeoLocationType === 'home') {
      if (!myProfile?.address_home || !myProfile.address_home.lat || !myProfile.address_home.lng) {
        Alert.alert('Erreur', 'Veuillez renseigner votre adresse de domicile dans votre profil.');
        setPublicGroupsGeoLocationType(null);
        return null;
      }
      const addr = myProfile.address_home;
      point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Domicile' };
    } else if (publicGroupsGeoLocationType === 'work') {
      if (!myProfile?.address_work || !myProfile.address_work.lat || !myProfile.address_work.lng) {
        Alert.alert('Erreur', 'Veuillez renseigner votre adresse de travail dans votre profil.');
        setPublicGroupsGeoLocationType(null);
        return null;
      }
      const addr = myProfile.address_work;
      point = { lat: addr.lat, lng: addr.lng, address: addr.address || 'Travail' };
    }
    
    return point;
  }, [publicGroupsGeoLocationType, locationPermission, myProfile]);
  
  // Charger le point de référence géographique du filtre quand le type change
  useEffect(() => {
    if (!publicGroupsGeoFilterVisible) return; // Ne pas charger si le filtre n'est pas visible
    
    (async () => {
      // Pour 'city', le point sera défini quand l'utilisateur sélectionne une ville
      if (publicGroupsGeoLocationType === 'city') {
        // Ne rien faire, attendre la sélection de ville
        return;
      }
      
      // Pour les autres types (current, home, work), charger automatiquement
      const point = await computePublicGroupsGeoRefPoint();
      if (point) {
        setPublicGroupsGeoRefPoint(point);
      } else {
        setPublicGroupsGeoRefPoint(null);
      }
    })();
  }, [publicGroupsGeoLocationType, publicGroupsGeoFilterVisible, computePublicGroupsGeoRefPoint]);
  
  // Réinitialiser le rayon quand le type de localisation change
  useEffect(() => {
    if (!publicGroupsGeoLocationType) {
      setPublicGroupsGeoRadiusKm(null);
    }
  }, [publicGroupsGeoLocationType]);
  
  // Charger les clubs quand on ouvre le picker (comme dans profil.js)
  useEffect(() => {
    if (clubPickerVisible) {
      loadClubs();
    }
  }, [clubPickerVisible, loadClubs]);

  // Charger les clubs quand on ouvre le picker d'édition
  useEffect(() => {
    if (editClubPickerVisible) {
      loadClubs();
    }
  }, [editClubPickerVisible, loadClubs]);

  // Recherche de villes avec Nominatim
  const searchCities = useCallback(async (query) => {
    const trimmedQuery = (query || '').trim();
    
    // Réinitialiser les suggestions si la requête est trop courte
    if (trimmedQuery.length < 2) {
      setCitySuggestions([]);
      return;
    }

    // Annuler la requête précédente si elle existe
    if (cityAbortController.current) {
      cityAbortController.current.abort();
    }
    cityAbortController.current = new AbortController();
    const signal = cityAbortController.current.signal;

    setLoadingCitySuggestions(true);
    try {
      // Rechercher des villes en France avec Nominatim
      // Utiliser featuretype=city pour ne récupérer que des villes
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmedQuery)}&countrycodes=fr&limit=10&featuretype=city&accept-language=fr`;
      const res = await fetch(url, {
        signal,
        headers: {
          'User-Agent': 'PadelSync-Groupes/1.0'
        }
      });
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      if (signal.aborted) return;
      
      // Extraire uniquement le nom de la ville depuis les résultats
      const suggestions = (data || [])
        .map(item => {
          // Le nom de la ville est généralement dans 'name' ou la première partie de 'display_name'
          let cityName = item.name || item.display_name.split(',')[0].trim();
          
          // Si le nom contient des informations supplémentaires, prendre seulement la première partie
          if (cityName.includes(',')) {
            cityName = cityName.split(',')[0].trim();
          }
          
          return cityName;
        })
        .filter((name, index, self) => 
          // Éliminer les doublons et les valeurs vides
          name && name.trim() && index === self.findIndex(t => t.toLowerCase() === name.toLowerCase())
        )
        .slice(0, 5) // Limiter à 5 résultats
        .map(name => ({ name: name.trim() }));
      
      setCitySuggestions(suggestions);
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('[Groupes] Erreur recherche villes:', e);
      setCitySuggestions([]);
    } finally {
      if (!signal.aborted) {
        setLoadingCitySuggestions(false);
      }
    }
  }, []);

  // Debounce pour la recherche de villes
  useEffect(() => {
    // Nettoyer le timer précédent
    if (cityDebounceTimer.current) {
      clearTimeout(cityDebounceTimer.current);
    }

    // Si le texte est vide, réinitialiser les suggestions
    if (!createCity || createCity.trim().length < 2) {
      setCitySuggestions([]);
      return;
    }

    // Débouncer la recherche
    cityDebounceTimer.current = setTimeout(() => {
      searchCities(createCity);
    }, 300); // Attendre 300ms après la dernière frappe

    // Nettoyer le timer au démontage
    return () => {
      if (cityDebounceTimer.current) {
        clearTimeout(cityDebounceTimer.current);
      }
    };
  }, [createCity, searchCities]);

  const doCreateGroup = useCallback(async () => {
    const n = (createName || "").trim();
    if (!n) return Alert.alert("Nom requis", "Entre un nom de groupe.");
    
    // Pour les groupes publics, la ville est obligatoire
    if (createVisibility === "public") {
      const cityTrimmed = (createCity || "").trim();
      if (!cityTrimmed || cityTrimmed.length < 2) {
        return Alert.alert("Ville requise", "Pour un groupe public, tu dois renseigner une ville.");
      }
    }
    
    try {
      const { data: u } = await supabase.auth.getUser();
      const me = u?.user?.id;
      if (!me) throw new Error("Utilisateur non authentifié");

      // Sécurise la visibilité et la join policy selon le rôle
      let safeVisibility = createVisibility;
      let join_policy = createJoinPolicy;

      // Super admin : peut créer tous les types
      // Admin : peut créer privé et public sur demande (mais pas public ouvert)
      // Club Manager : peut créer privé et public sur demande (mais pas public ouvert)
      // Utilisateur : peut créer uniquement privé

      if (createVisibility === "public" && createJoinPolicy === "open") {
        // Public ouvert : uniquement super admin
        if (!isSuperAdmin) {
          Alert.alert('Restriction', 'Seuls les super admins peuvent créer un groupe public ouvert.');
          safeVisibility = "private";
          join_policy = "invite";
        }
      } else if (createVisibility === "public" && createJoinPolicy === "request") {
        // Public sur demande : super admin, admin ou club_manager
        if (!isSuperAdmin && !isGlobalAdmin && userRole !== 'club_manager') {
          Alert.alert('Restriction', 'Seuls les admins, super admins et club managers peuvent créer un groupe public sur demande.');
          safeVisibility = "private";
          join_policy = "invite";
        }
      } else if (createVisibility === "private") {
        // Privé : toujours autorisé
        safeVisibility = "private";
        join_policy = "invite";
      } else {
        // Par défaut : privé
        safeVisibility = "private";
        join_policy = "invite";
      }

      // Préparer les paramètres de localisation
      // Si l'utilisateur est club_manager, utiliser automatiquement son club_id
      let clubIdParam = null;
      if (userRole === 'club_manager' && userClubId) {
        // Club manager : utiliser automatiquement son club_id
        clubIdParam = userClubId;
      } else if (createClubId && String(createClubId).trim() !== '') {
        // Super admin peut spécifier n'importe quel club
        clubIdParam = String(createClubId).trim();
      }
      
      const cityParam = (createCity && String(createCity).trim() !== '') ? String(createCity).trim() : null;

      console.log('[Groups][create] me =', me, 'userRole =', userRole, 'userClubId =', userClubId);
      console.log('[Groups][create] visibility =', safeVisibility, 'join_policy =', join_policy);
      console.log('[Groups][create] club_id =', clubIdParam, 'city =', cityParam);
      console.log('[Groups][create] createClubId raw =', createClubId, 'type =', typeof createClubId);
      console.log('[Groups][create] createCity raw =', createCity, 'type =', typeof createCity);

      // Construire les paramètres de la RPC - toujours passer tous les paramètres
      const rpcParams = {
        p_name: n,
        p_visibility: safeVisibility,
        p_join_policy: join_policy,
        p_club_id: clubIdParam,  // Passer null explicitement si vide
        p_city: cityParam,        // Passer null explicitement si vide
      };
      
      console.log('[Groups][create] RPC params =', JSON.stringify(rpcParams, null, 2));

      // Essayer d'abord avec la RPC
      let rpcData = null;
      let rpcErr = null;
      try {
        const result = await supabase.rpc('rpc_create_group', rpcParams);
        rpcData = result.data;
        rpcErr = result.error;
      } catch (e) {
        console.error('[Groups][create][rpc] exception:', e);
        rpcErr = e;
      }
      
      // Si la RPC échoue, créer le groupe directement avec INSERT
      if (rpcErr || !rpcData) {
        console.warn('[Groups][create] RPC failed, using direct INSERT');
        console.error('[Groups][create][rpc] error =', rpcErr);
        
        // Créer le groupe directement
        const { data: insertData, error: insertErr } = await supabase
          .from('groups')
          .insert({
            name: n,
            visibility: safeVisibility,
            join_policy: join_policy,
            club_id: clubIdParam,
            city: cityParam,
          })
          .select('id, name, avatar_url, visibility, join_policy, club_id, city')
          .single();
        
        if (insertErr) {
          console.error('[Groups][create] Direct INSERT also failed:', insertErr);
          throw insertErr;
        }
        
        console.log('[Groups][create] Group created via direct INSERT:', insertData);
        rpcData = [insertData]; // Formater comme la RPC
      }

      console.log('[Groups][create][rpc] result =', rpcData);
      let created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      console.log('[Groups][create] created object =', created);
      console.log('[Groups][create] created.club_id =', created?.club_id, 'created.city =', created?.city);
      
      // Si le groupe a été créé mais sans les localisations, les mettre à jour immédiatement
      if (created && created.id && (clubIdParam || cityParam)) {
        const needsLocationUpdate = (clubIdParam && created.club_id !== clubIdParam) || 
                                   (cityParam && created.city !== cityParam) ||
                                   (clubIdParam && !created.club_id) ||
                                   (cityParam && !created.city);
        
        if (needsLocationUpdate) {
          console.log('[Groups][create] Location data missing or incorrect, updating immediately');
          const locationUpdate = {};
          if (clubIdParam) locationUpdate.club_id = clubIdParam;
          if (cityParam) locationUpdate.city = cityParam;
          
          const { data: updatedGroup, error: updateErr } = await supabase
            .from('groups')
            .update(locationUpdate)
            .eq('id', created.id)
            .select('id, name, avatar_url, visibility, join_policy, club_id, city')
            .single();
          
          if (updateErr) {
            console.error('[Groups][create] Error updating location immediately:', updateErr);
            // Ne pas échouer la création, juste logger l'erreur
          } else if (updatedGroup) {
            console.log('[Groups][create] Location updated successfully:', updatedGroup);
            created = { ...created, ...updatedGroup };
          }
        }
      }

      // Fallback: si la RPC ne renvoie pas l'ID (implémentation SQL différente),
      // on va rechercher le dernier groupe créé par l'utilisateur avec ce nom.
      if (!created || !created.id) {
        const { data: fallback, error: fbErr } = await supabase
          .from('groups')
          .select('id, name, avatar_url, club_id, city')
          .eq('name', n)
          .eq('created_by', me)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fbErr) throw fbErr;
        if (!fallback?.id) {
          throw new Error('Création du groupe : réponse invalide (aucun ID retourné)');
        }
        console.log('[Groups][create] fallback object =', fallback);
        created = fallback;
      }

      // Vérifier immédiatement dans la DB que les données ont bien été enregistrées
      const { data: verifyData, error: verifyErr } = await supabase
        .from("groups")
        .select("id, name, avatar_url, visibility, join_policy, created_by, club_id, city")
        .eq("id", created.id)
        .single();
      
      if (verifyErr) {
        console.error('[Groups][create] Error verifying group data:', verifyErr);
      } else {
        console.log('[Groups][create] Verified group data from DB:', verifyData);
        console.log('[Groups][create] Expected club_id =', clubIdParam, 'Expected city =', cityParam);
        console.log('[Groups][create] Actual club_id in DB =', verifyData?.club_id, 'Actual city in DB =', verifyData?.city);
        
        // Si les données ne sont pas enregistrées, essayer de les mettre à jour directement
        const needsUpdate = (clubIdParam && verifyData?.club_id !== clubIdParam) || 
                           (cityParam && verifyData?.city !== cityParam) ||
                           (clubIdParam && !verifyData?.club_id) ||
                           (cityParam && !verifyData?.city);
        
        if (verifyData && needsUpdate) {
          console.warn('[Groups][create] Localisation data missing or incorrect in DB, attempting direct update');
          const updateData = {};
          if (clubIdParam && verifyData?.club_id !== clubIdParam) {
            updateData.club_id = clubIdParam;
            console.log('[Groups][create] Will update club_id to:', clubIdParam);
          }
          if (cityParam && verifyData?.city !== cityParam) {
            updateData.city = cityParam;
            console.log('[Groups][create] Will update city to:', cityParam);
          }
          
          if (Object.keys(updateData).length > 0) {
            console.log('[Groups][create] Updating group with:', updateData);
            const { data: updatedData, error: updateErr } = await supabase
              .from("groups")
              .update(updateData)
              .eq("id", created.id)
              .select("id, name, avatar_url, visibility, join_policy, created_by, club_id, city")
              .single();
            
            if (updateErr) {
              console.error('[Groups][create] Error updating group location:', updateErr);
              Alert.alert("Avertissement", "Le groupe a été créé mais la localisation n'a pas pu être enregistrée. Erreur: " + updateErr.message);
            } else {
              console.log('[Groups][create] Successfully updated group location:', updatedData);
              if (updatedData) {
                verifyData.club_id = updatedData.club_id;
                verifyData.city = updatedData.city;
              }
            }
          }
        } else if (verifyData && clubIdParam && cityParam) {
          console.log('[Groups][create] Location data correctly saved in DB');
        }
      }

      await loadGroups();
      
      // Utiliser les données vérifiées depuis la DB
      const groupToUse = verifyData || created;
      console.log('[Groups][create] Using groupToUse:', groupToUse);
      
      // Charger les infos du club si nécessaire
      let clubName = null;
      let clubLat = null;
      let clubLng = null;
      if (groupToUse?.club_id) {
        const { data: clubData, error: clubErr } = await supabase
          .from("clubs")
          .select("name, lat, lng")
          .eq("id", groupToUse.club_id)
          .single();
        if (clubErr) {
          console.error('[Groups][create] Error fetching club data:', clubErr);
        } else {
          clubName = clubData?.name || null;
          clubLat = clubData?.lat || null;
          clubLng = clubData?.lng || null;
          console.log('[Groups][create] club data =', { clubName, clubLat, clubLng });
        }
      }
      
      const fullGroup = {
        ...groupToUse,
        club_name: clubName,
        club_lat: clubLat,
        club_lng: clubLng,
      };
      console.log('[Groups][create] Setting activeGroup with fullGroup =', fullGroup);
      setActiveGroup(fullGroup);
      await loadMembersAndAdmin(fullGroup.id);
      // Réinitialiser les valeurs du formulaire
      setCreateName("");
      setCreateVisibility("private");
      setCreateJoinPolicy("invite");
      setCreateClubId(null);
      setCreateCity("");
      setCitySuggestions([]);
      setShowCreate(false);
      Alert.alert("Groupe créé", `"${n}" est maintenant actif.`);
    } catch (e) {
      console.error('[Groups][create] Error:', e);
      Alert.alert("Erreur création", e?.message ?? String(e));
    }
  }, [createName, createVisibility, createJoinPolicy, createClubId, createCity, isSuperAdmin, isGlobalAdmin, loadGroups, setActiveGroup, loadMembersAndAdmin]);

  // Trouver le groupe actif dans groups.mine (plus complet avec club_name, city, etc.)
  const activeRecord = useMemo(() => {
    const a = (groups.mine ?? []).find((g) => g.id === activeGroup?.id) || null;
    // Si on ne trouve pas dans groups.mine mais qu'on a activeGroup, utiliser activeGroup
    return a || activeGroup || null;
  }, [groups.mine, activeGroup?.id, activeGroup]);

  // Mettre à jour activeGroup avec les données complètes de groups.mine si nécessaire
  useEffect(() => {
    if (activeRecord && activeGroup && activeRecord !== activeGroup) {
      // Vérifier si les données complètes sont différentes
      if (activeRecord.club_name !== activeGroup.club_name || 
          activeRecord.city !== activeGroup.city || 
          activeRecord.club_id !== activeGroup.club_id ||
          activeRecord.club_lat !== activeGroup.club_lat ||
          activeRecord.club_lng !== activeGroup.club_lng) {
        console.log('[Groupes] Updating activeGroup with complete data from groups.mine');
        setActiveGroup(activeRecord);
      }
    }
  }, [activeRecord, activeGroup, setActiveGroup]);

  // Fonctions pour rejoindre un groupe
  const handleJoinByGroupId = useCallback(async (groupId) => {
    try {
      // Essayer d'abord avec join_group_by_id (nouvelle fonction qui gère tous les cas)
      const { data: rpcData, error: rpcError } = await supabase.rpc('join_group_by_id', {
        p_group_id: groupId
      });
      
      if (!rpcError) {
        setJoinModalVisible(false);
        setInviteCode("");
        await loadGroups();
        // Récupérer le groupe directement depuis la base de données
        const { data: groupData } = await supabase
          .from('groups')
          .select('*')
          .eq('id', groupId)
          .single();
        if (groupData) {
          setActiveGroup(groupData);
        }
        
        // Vérifier si c'est la première fois qu'un groupe est rejoint
        const wasFirstJoin = !(await getOnboardingFlag(FLAG_KEYS.GROUP_JOINED));
        if (wasFirstJoin) {
          await setOnboardingFlag(FLAG_KEYS.GROUP_JOINED, true);
          setGroupJoinedModalVisible(true);
        } else {
          Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
        }
        return;
      }
      
      // Fallback: Essayer avec join_public_group pour les groupes publics
      const { data: publicData, error: publicError } = await supabase.rpc('join_public_group', {
        p_group_id: groupId
      });
      
      if (!publicError) {
        setJoinModalVisible(false);
        setInviteCode("");
        await loadGroups();
        // Récupérer le groupe directement depuis la base de données
        const { data: groupData } = await supabase
          .from('groups')
          .select('*')
          .eq('id', groupId)
          .single();
        if (groupData) {
          setActiveGroup(groupData);
        }
        
        // Vérifier si c'est la première fois qu'un groupe est rejoint
        const wasFirstJoin = !(await getOnboardingFlag(FLAG_KEYS.GROUP_JOINED));
        if (wasFirstJoin) {
          await setOnboardingFlag(FLAG_KEYS.GROUP_JOINED, true);
          setGroupJoinedModalVisible(true);
        } else {
          Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
        }
        return;
      }
      
      // Si tout échoue, afficher un message d'erreur clair
      console.error('[Join] Erreurs:', { rpcError: rpcError?.message, publicError: publicError?.message });
      Alert.alert("Impossible de rejoindre", rpcError?.message || publicError?.message || "Ce groupe nécessite une invitation valide.");
    } catch (e) {
      console.error('[Join] Erreur lors de la tentative de rejoindre:', e);
      Alert.alert("Erreur", e?.message || "Impossible de rejoindre le groupe. Veuillez contacter un administrateur.");
    }
  }, [loadGroups, setActiveGroup]);

  const handleAcceptInvite = useCallback(async () => {
    if (!inviteCode) return Alert.alert("Code requis", "Entre un code d'invitation.");
    
    // Vérifier si c'est un deep link ou une URL
    if (inviteCode.includes('syncpadel://join?group_id=') || inviteCode.includes('group_id=')) {
      try {
        let groupId;
        if (inviteCode.startsWith('syncpadel://join?group_id=')) {
          const match = inviteCode.match(/group_id=([^&]+)/);
          if (match && match[1]) {
            groupId = match[1];
          }
        } else if (inviteCode.includes('group_id=')) {
          const url = new URL(inviteCode);
          groupId = url.searchParams.get('group_id');
        }
        if (groupId) {
          await handleJoinByGroupId(groupId);
          return;
        }
      } catch (e) {
        console.error('[Join] Erreur parsing URL/deep link:', e);
      }
    }
    
    // Sinon, traiter comme un code d'invitation
    const { data, error } = await supabase.rpc("accept_invite", { p_code: inviteCode.trim() });
    if (error) return Alert.alert("Erreur", error.message);
    Alert.alert("Rejoint ✅", "Bienvenue dans le groupe !");
    setJoinModalVisible(false);
    setInviteCode("");
    await loadGroups();
    // Récupérer le groupe directement depuis la base de données
    if (data) {
      const { data: groupData } = await supabase
        .from('groups')
        .select('*')
        .eq('id', data)
        .single();
      if (groupData) {
        setActiveGroup(groupData);
      }
    }
  }, [inviteCode, handleJoinByGroupId, loadGroups, setActiveGroup]);

  const handlePasteDeepLink = useCallback(async () => {
    try {
      const text = await Clipboard.getString();
      if (!text) return;
      
      // Vérifier si c'est un deep link syncpadel://
      if (text.startsWith('syncpadel://join?group_id=')) {
        try {
          // Extraire le group_id depuis le deep link
          const match = text.match(/group_id=([^&]+)/);
          if (match && match[1]) {
            const groupId = match[1];
            await handleJoinByGroupId(groupId);
            return;
          }
        } catch (e) {
          console.error('[Join] Erreur parsing deep link:', e);
        }
      }
      
      // Vérifier si c'est un lien web avec group_id
      if (text.includes('group_id=')) {
        try {
          const url = new URL(text);
          const groupId = url.searchParams.get('group_id');
          if (groupId) {
            await handleJoinByGroupId(groupId);
            return;
          }
        } catch (e) {
          console.error('[Join] Erreur parsing URL:', e);
        }
      }
      
      // Sinon, utiliser comme code d'invitation
      setInviteCode(text.trim());
    } catch (e) {
      console.error('[Join] Erreur lors du collage:', e);
      Alert.alert("Erreur", "Impossible de lire le presse-papiers");
    }
  }, [handleJoinByGroupId]);

  if (!authChecked || loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, position: "relative", backgroundColor: "#001831" }}>
      {/* Contact Modal */}
      <Modal
        visible={contactVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setContactVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, width: '90%', maxWidth: 400 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 20, textAlign: 'center' }}>
              Contacter {contactProfile?.display_name || contactProfile?.name || contactProfile?.email || 'ce membre'}
            </Text>
            <View style={{ gap: 12 }}>
              {contactProfile?.phone && (
                <Pressable
                  onPress={() => { Linking.openURL(`tel:${contactProfile.phone}`); setContactVisible(false); }}
                  style={{ backgroundColor: '#15803d', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                >
                  <Ionicons name="call" size={20} color="white" style={{ marginRight: 8 }} />
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Appeler</Text>
                </Pressable>
              )}
              {contactProfile?.email && (
                <Pressable
                  onPress={() => { Linking.openURL(`mailto:${contactProfile.email}`); setContactVisible(false); }}
                  style={{ backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                >
                  <Ionicons name="mail" size={20} color="white" style={{ marginRight: 8 }} />
                  <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Envoyer un email</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => setContactVisible(false)}
                style={{ backgroundColor: '#6b7280', paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
              >
                <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Fermer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal filtre clubs publics */}
      <Modal
        visible={publicGroupsClubPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPublicGroupsClubPickerVisible(false)}
      >
        <View style={[s.qrWrap, { padding: 24 }]}>
          <View style={[s.qrCard, { width: 360, maxHeight: '75%', alignItems: 'stretch' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontWeight: '800', fontSize: 16 }}>Filtrer par club</Text>
              <Pressable onPress={() => setPublicGroupsClubPickerVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={{ paddingBottom: 12, gap: 8 }}>
              {(() => {
                console.log('=== MODAL OUVERTE ===');
                console.log('addressHome:', JSON.stringify(addressHome));
                console.log('publicGroupsClubs:', publicGroupsClubs.map(c => ({ name: c.name, distanceKm: c.distanceKm, lat: c.lat, lng: c.lng })));
                return null;
              })()}
              <Pressable
                onPress={() => selectPublicGroupClub(null)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: publicGroupsClubFilter === null ? BRAND : "#e5e7eb",
                  backgroundColor: publicGroupsClubFilter === null ? "rgba(26,75,151,0.08)" : "#ffffff",
                }}
              >
                <Text style={{ fontWeight: '700', color: publicGroupsClubFilter === null ? BRAND : "#111827" }}>
                  Tous les clubs
                </Text>
                <Text style={{ color: "#6b7280", fontSize: 12 }}>Afficher tous les groupes</Text>
              </Pressable>
              {publicGroupsClubs.length === 0 ? (
                <Text style={{ color: "#9ca3af", fontStyle: "italic", paddingVertical: 8 }}>
                  Aucun club disponible pour le moment.
                </Text>
              ) : (
                publicGroupsClubs.map((club) => {
                  const isSelected = publicGroupsClubFilter === club.id;
                  const hasDistance = club.distanceKm != null && Number.isFinite(club.distanceKm) && club.distanceKm !== Infinity;
                  if (__DEV__ && club.name === "Le miras padel") {
                    console.log('[Modal] Miras padel dans la liste:', {
                      club,
                      distanceKm: club.distanceKm,
                      hasDistance,
                      lat: club.lat,
                      lng: club.lng
                    });
                  }
                  return (
                    <Pressable
                      key={club.id}
                      onPress={() => selectPublicGroupClub(club.id)}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isSelected ? BRAND : "#e5e7eb",
                        backgroundColor: isSelected ? "rgba(26,75,151,0.08)" : "#ffffff",
                        gap: 4,
                      }}
                    >
                      <Text style={{ fontWeight: '700', color: isSelected ? BRAND : "#111827" }}>
                        {club.name}
                      </Text>
                      {hasDistance && (
                        <Text style={{ color: "#6b7280", fontSize: 12 }}>
                          {club.distanceKm.toFixed(1)} km
                        </Text>
                      )}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Profile Modal */}
      <Modal
        visible={profileVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setProfileVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: 'white', borderRadius: 12, padding: 20, width: '90%', maxWidth: 400 }}>
            {/* Avatar + Nom */}
            <View style={{ alignItems: 'center', gap: 8, marginBottom: 20 }}>
              {profileProfile?.avatar_url ? (
                <Image 
                  source={{ uri: profileProfile.avatar_url }} 
                  style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#f3f4f6' }}
                />
              ) : (
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#eaf2ff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1a4b97' }}>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#1a4b97' }}>
                    {(profileProfile?.display_name || profileProfile?.name || profileProfile?.email || 'J').substring(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={{ fontSize: 20, fontWeight: '800', color: '#1a4b97', textAlign: 'center' }}>
                {profileProfile?.display_name || profileProfile?.name || profileProfile?.email || 'Joueur'}
              </Text>
              <Pressable onPress={() => Linking.openURL(`mailto:${profileProfile?.email}`)}>
                <Text style={{ fontSize: 13, color: '#3b82f6', textAlign: 'center', textDecorationLine: 'underline' }}>
                  {profileProfile?.email}
                </Text>
              </Pressable>
            </View>
            
            {/* Résumé visuel */}
            <View style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 12 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>Résumé</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>🔥</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.niveau || profileProfile?.level || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Niveau</Text>
                </View>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>🖐️</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.main || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Main</Text>
                </View>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>🎯</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.cote || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Côté</Text>
                </View>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>🏟️</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.club || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Club</Text>
                </View>
                <View style={{ width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' }}>
                  <Text style={{ fontSize: 28 }}>📍</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.rayon_km ? `${profileProfile.rayon_km} km` : '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Rayon</Text>
                </View>
                <Pressable
                  onPress={() => {
                    setProfileVisible(false);
                    setContactProfile(profileProfile);
                    setContactVisible(true);
                  }}
                  style={({ pressed }) => [
                    { width: '47%', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', gap: 6, backgroundColor: '#fafafa' },
                    pressed && { opacity: 0.7 }
                  ]}
                >
                  <Text style={{ fontSize: 28 }}>📞</Text>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#1a4b97' }}>{profileProfile?.phone || '—'}</Text>
                  <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Téléphone</Text>
                </Pressable>
              </View>
            </View>
            
            <Pressable
              onPress={() => setProfileVisible(false)}
              style={{ backgroundColor: '#15803d', paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginTop: 16 }}
            >
              <Text style={{ color: 'white', fontWeight: '600', fontSize: 16 }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <ScrollView
        scrollEnabled={true}
        nestedScrollEnabled={Platform.OS === 'android'}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{ 
          padding: Platform.OS === 'ios' ? 4 : 12, 
          paddingHorizontal: Math.max(16, Math.max(insets.left, insets.right) + 8),
          gap: 10, 
          paddingBottom: Math.max(24, insets.bottom + 140),
          paddingTop: Platform.OS === 'ios' ? 4 : Math.max(4, insets.top + 2),
          flexGrow: 1
        }}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'automatic' : undefined}
        scrollIndicatorInsets={{ bottom: Math.max(8, insets.bottom + 70) }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Groupe actif */}
        {activeRecord ? (
          <View style={[s.card, s.activeCard]}>
            <View style={{ alignItems: "center", marginBottom: 0 }}>
              <Avatar
                url={activeRecord.avatar_url}
                fallback={activeRecord.name}
                size={100}
                onPress={
                  activeRecord?.club_id
                    ? press(
                        `active-group-club-avatar-${activeRecord.club_id}`,
                        () => openClubPage(activeRecord.club_id)
                      )
                    : undefined
                }
              />
            </View>
            <View style={{ alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" }}>
                <Text style={{ fontWeight: "800", fontSize: 24, color: "#001831", textTransform: 'uppercase', textAlign: 'center' }}>
                  {activeRecord.name}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <Text style={{ color: "#5b89b8", fontWeight: "700" }}>
                  {activeRecord.visibility === 'public' ? 'Public' : 'Privé'}
                </Text>
                {isAdmin && (
                  <>
                    <View style={{
                      backgroundColor: '#ef4444',
                      borderWidth: 1,
                      borderColor: '#ef4444',
                      borderRadius: 4,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                    }}>
                      <Text style={{ color: '#ffffff', fontWeight: "700", fontSize: 12 }}>
                        Admin
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        setEditingGroupId(activeRecord.id);
                        setEditingGroupName(activeRecord.name || "");
                        setEditingGroupVisibility(activeRecord.visibility || "private");
                        setEditingGroupJoinPolicy(activeRecord.join_policy || "invite");
                        setEditingGroupClubId(activeRecord.club_id || null);
                        setEditingGroupCity(activeRecord.city || "");
                        setEditingCitySuggestions([]);
                        setShowEditGroup(true);
                      }}
                      style={{
                        padding: 4,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Modifier le groupe"
                    >
                      <Ionicons name="create" size={20} color="#007cfd" />
                    </Pressable>
                  </>
                )}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, justifyContent: "center" }}>
                <Text style={{ color: "#5b89b8", textAlign: 'center' }}>
                  {`Groupe actif · ${members.length} membre${members.length > 1 ? "s" : ""}`}
                </Text>
              </View>
              {(activeRecord?.club_name || activeRecord?.city) && (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                  <Text style={{ color: "#6b7280", fontSize: 16, textAlign: 'center', fontWeight: "600" }}>
                    {[
                      activeRecord?.club_name && `🏟️ ${activeRecord.club_name}`,
                      activeRecord?.city && `📍 ${activeRecord.city}`
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  {activeRecord?.club_id && activeRecord?.club_name && (
                    <Pressable
                      onPress={press(`active-view-club-${activeRecord.club_id}`, () => openClubPage(activeRecord.club_id))}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: "#ff8c00"
                      }}
                    >
                      <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 14 }}>
                        voir la page club
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {/* Membres */}
            <View style={{ marginTop: 12 }}>
              {members?.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 8, minHeight: 56 }}
                >
                  {[...members]
                    .sort((a, b) => {
                      // Admins en premier
                      if (a.is_admin && !b.is_admin) return -1;
                      if (!a.is_admin && b.is_admin) return 1;
                      return 0;
                    })
                    .slice(0, 20)
                    .map((m) => (
                    <Avatar
                      key={m.id}
                      url={m.avatar_url}
                      fallback={m.name}
                      level={m.niveau}
                      size={36}
                      profile={m}
                      onLongPressProfile={openProfileForProfile}
                      isAdmin={m.is_admin}
                    />
                  ))}
                  {members.length > 20 ? (
                    <View style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}>
                      <Text style={{ color: "#cbd5e1", fontWeight: "700" }}>+{members.length - 20}</Text>
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <Text style={{ color: "#cbd5e1" }}>Aucun membre trouvé.</Text>
              )}
            </View>

            {/* Actions groupe actif */}
            <View style={{ flexDirection: "row", marginTop: 12, gap: 8 }}>
              <Pressable onPress={press("open-members-modal", () => setMembersModalVisible(true))} style={[s.btn, { backgroundColor: "#f3f4f6", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={[s.btnTxt, { color: "#111827" }]}>Voir les membres ({members.length})</Text>
              </Pressable>
              {isAdmin && (
                <Pressable 
                  onPress={press("open-join-requests-modal", () => setJoinRequestsModalVisible(true))} 
                  style={[s.btn, { backgroundColor: joinRequests.length > 0 ? "#dc2626" : "#6b7280", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}
                >
                  <Text style={[s.btnTxt, { color: "#ffffff" }]}>
                    Demandes {joinRequests.length > 0 ? `(${joinRequests.length})` : "(0)"}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Invite button (moved under "Voir les membres") */}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable onPress={press("invite-qr", onInviteQR)} style={[s.btn, { backgroundColor: "#10b981", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}>
                <Text style={s.btnTxt}>Inviter via CODE</Text>
              </Pressable>
            </View>

            {/* Classement du groupe */}
            {activeGroup?.id && meId && (
              <View style={{ marginTop: 16, backgroundColor: "#fff", borderRadius: 12, padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Ionicons name="trophy" size={20} color="#ff8c00" />
                  <Text style={{ color: "#ff8c00", fontWeight: "800", fontSize: 20 }}>Classement du groupe</Text>
                </View>
                <Leaderboard
                  scope="group"
                  groupId={activeGroup.id}
                  currentUserId={meId}
                  variant="compact"
                  highlightCurrentUser={true}
                />
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable
                onPress={press("change-group-avatar", onChangeGroupAvatar)}
                disabled={isAdminLoading ? true : !isAdmin}
                style={[
                  s.btn,
                  { flex: 1, flexDirection: "row", justifyContent: "center", gap: 6, paddingVertical: 8 },
                  isAdminLoading ? { backgroundColor: "#cbd5e1" } : isAdmin ? { backgroundColor: BRAND } : { backgroundColor: "#d1d5db" },
                  Platform.OS === "web" && { cursor: isAdminLoading || !isAdmin ? "not-allowed" : "pointer" }
                ]}
              >
                {isAdminLoading ? <ActivityIndicator color="#fff" /> : !isAdmin ? <Text style={{ color: "white", fontSize: 14 }}>🔒</Text> : null}
                <Text style={s.btnTxt}>Changer avatar</Text>
              </Pressable>

              <Pressable
                onPress={press("leave-group", onLeaveGroup)}
                style={[s.btn, { backgroundColor: "#dc2626", flex: 1, paddingVertical: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
              >
                <Text style={s.btnTxt}>Quitter le groupe</Text>
              </Pressable>

              {isAdmin && (
                <Pressable
                  onPress={press('delete-group', onDeleteGroup)}
                  style={[s.btn, { backgroundColor: '#991b1b', flex: 1, paddingVertical: 8 }, Platform.OS === 'web' && { cursor: 'pointer' }]}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer le groupe"
                >
                  <Text style={s.btnTxt}>Supprimer le groupe</Text>
                </Pressable>
              )}
            </View>
          </View>
        ) : (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#cbd5e1" }}>Aucun groupe actif.</Text>
          </View>
        )}

        {/* Boutons Rejoindre et Créer un groupe */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Pressable 
            onPress={press("join-group", () => setJoinModalVisible(true))} 
            style={[s.btn, { backgroundColor: "#ff8c00", flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
          >
            <Ionicons name="add-circle-outline" size={18} color="#ffffff" />
            <Text style={[s.btnTxt, { fontSize: 13 }]}>Rejoindre</Text>
          </Pressable>
          <Pressable 
            onPress={press("create-group", onCreateGroup)} 
            style={[s.btn, { backgroundColor: "#2fc249", flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
          >
            <Text style={{ 
              fontSize: 16,
              textShadowColor: 'rgba(255, 255, 255, 0.9)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 3
            }}>👑</Text>
            <Text style={[s.btnTxt, { fontSize: 13 }]}>CRÉER</Text>
          </Pressable>
        </View>

        {/* Mes groupes */}
        <View style={[s.sectionHeader, { marginTop: 0 }]}>
          <Text style={s.sectionTitle}>Mes groupes</Text>
        </View>
        {(groups.mine ?? []).length === 0 ? (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#cbd5e1" }}>Tu n’as pas encore de groupe.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {(groups.mine ?? []).map((g) => {
              const isActive = activeGroup?.id === g.id;
              
              // Initialiser les valeurs d'édition et ouvrir la modale
              const startEditing = () => {
                setEditingGroupId(g.id);
                setEditingGroupName(g.name || "");
                setEditingGroupVisibility(g.visibility || "private");
                setEditingGroupJoinPolicy(g.join_policy || "invite");
                setEditingGroupClubId(g.club_id || null);
                setEditingGroupCity(g.city || "");
                setEditingCitySuggestions([]);
                setShowEditGroup(true);
              };

              return (
                <Pressable
                  key={g.id}
                  onPress={press("activate-group", () => onActivate(g))}
                  style={[s.rowCard, Platform.OS === 'web' && { cursor: 'pointer' }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Activer le groupe ${g.name}`}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                    <Avatar
                      url={g.avatar_url}
                      fallback={g.name}
                      size={40}
                      onPress={
                        g.club_id
                          ? press(
                              `my-group-club-avatar-${g.id}`,
                              () => openClubPage(g.club_id)
                            )
                          : undefined
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: "700", color: "#ffffff", textTransform: 'uppercase' }}>{g.name}</Text>
                      <Text style={{ color: "#b0d4fb", marginTop: 2, fontWeight: "700" }}>
                        {g.visibility === 'public'
                          ? `Public · ${g.join_policy === 'open' ? 'Ouvert' : 'Sur demande'}`
                          : 'Privé'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {isActive && isAdmin && (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation();
                          startEditing();
                        }}
                        style={{
                          padding: 10,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Modifier le groupe"
                      >
                        <Ionicons name="create" size={22} color="#e0ff00" />
                      </Pressable>
                    )}
                    {isActive && (
                      <View style={[s.btnTiny, { backgroundColor: "#d1d5db" }]}>
                        <Text style={{ color: "#111827", fontWeight: "800", fontSize: 12 }}>Actif</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Groupes publics */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Groupes publics</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", marginTop: 6 }}>
            <Pressable
              onPress={() => {
                if (!publicGroupsGeoFilterVisible) {
                  setPublicGroupsGeoFilterVisible(true);
                } else {
                  setPublicGroupsGeoFilterVisible(false);
                }
              }}
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: publicGroupsGeoFilter ? "#15803d" : "rgba(156,163,175,0.4)",
                  backgroundColor: "transparent",
                  gap: 6,
                },
                Platform.OS === "web" && { cursor: "pointer" }
              ]}
              accessibilityRole="button"
              accessibilityLabel={publicGroupsGeoFilter ? `Filtre géo (${publicGroupsGeoRadiusKm}km)` : "Filtre géographique"}
            >
              <Ionicons name="location" size={16} color={publicGroupsGeoFilter ? "#15803d" : "#9ca3af"} />
              <Text style={{ fontWeight: "700", color: publicGroupsGeoFilter ? "#15803d" : "#9ca3af", fontSize: 12 }}>
                Géo
              </Text>
              <Ionicons name="chevron-down" size={16} color={publicGroupsGeoFilter ? "#15803d" : "#9ca3af"} />
            </Pressable>
            <Pressable
              onPress={() => setPublicGroupsClubPickerVisible(true)}
              style={[
                {
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: selectedPublicGroupClub ? "#e0ff00" : "rgba(156,163,175,0.4)",
                  backgroundColor: "transparent",
                  gap: 6,
                },
                Platform.OS === "web" && { cursor: "pointer" }
              ]}
            >
              <Ionicons name="trophy" size={16} color={selectedPublicGroupClub ? "#e0ff00" : "#9ca3af"} />
              <Text style={{ fontWeight: "700", color: selectedPublicGroupClub ? "#e0ff00" : "#9ca3af", fontSize: 12 }}>
                {selectedPublicGroupClub ? selectedPublicGroupClub.name : "Clubs"}
              </Text>
              <Ionicons name="chevron-down" size={16} color={selectedPublicGroupClub ? "#e0ff00" : "#9ca3af"} />
            </Pressable>
          </View>
          {/* Zone de configuration du filtre géographique */}
          {publicGroupsGeoFilterVisible && (
            <View style={{ 
              backgroundColor: "#f3f4f6", 
              borderRadius: 12, 
              padding: 12,
              marginTop: 12,
              borderWidth: 1,
              borderColor: publicGroupsGeoFilter ? "#15803d" : "#d1d5db",
            }}>
              {/* Sélection du type de position */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 8 }}>
                  Position de référence
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { key: "current", label: "📍 Position actuelle" },
                    { key: "home", label: "🏠 Domicile" },
                    { key: "work", label: "💼 Travail" },
                    { key: "city", label: "🏙️ Ville" },
                  ].map(({ key, label }) => {
                    const isSelected = publicGroupsGeoLocationType === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => {
                          // Si cette position est déjà sélectionnée, désélectionner (annuler le filtre)
                          if (isSelected) {
                            setPublicGroupsGeoRefPoint(null);
                            setPublicGroupsGeoCityQuery("");
                            setPublicGroupsGeoCitySuggestions([]);
                            setPublicGroupsGeoLocationType(null);
                          } else {
                            // Sinon, sélectionner cette position
                            setPublicGroupsGeoLocationType(key);
                            if (key === "city") {
                              setPublicGroupsGeoRefPoint(null);
                              setPublicGroupsGeoCityQuery("");
                            }
                          }
                        }}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: (isSelected && publicGroupsGeoFilter) ? "#15803d" : "#ffffff",
                          borderWidth: 1,
                          borderColor: (isSelected && publicGroupsGeoFilter) ? "#15803d" : "#d1d5db",
                        }}
                      >
                        <Text style={{ 
                          fontSize: 14, 
                          fontWeight: (isSelected && publicGroupsGeoFilter) ? "800" : "700", 
                          color: (isSelected && publicGroupsGeoFilter) ? "#ffffff" : "#111827" 
                        }}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              
              {/* Recherche de ville si type = 'city' */}
              {publicGroupsGeoLocationType && publicGroupsGeoLocationType === "city" && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 8 }}>
                    Rechercher une ville
                  </Text>
                  <TextInput
                    placeholder="Tapez le nom d'une ville..."
                    value={publicGroupsGeoCityQuery}
                    onChangeText={(text) => {
                      setPublicGroupsGeoCityQuery(text);
                      searchPublicGroupsGeoCity(text);
                    }}
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: 8,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: "#d1d5db",
                      fontSize: 14,
                    }}
                  />
                  {publicGroupsGeoCitySuggestions.length > 0 && (
                    <View style={{ marginTop: 8, backgroundColor: "#ffffff", borderRadius: 8, borderWidth: 1, borderColor: "#d1d5db" }}>
                      {publicGroupsGeoCitySuggestions.map((suggestion, idx) => (
                        <Pressable
                          key={idx}
                          onPress={() => {
                            setPublicGroupsGeoRefPoint({ lat: suggestion.lat, lng: suggestion.lng, address: suggestion.name });
                            setPublicGroupsGeoCityQuery(suggestion.name);
                            setPublicGroupsGeoCitySuggestions([]);
                          }}
                          style={{
                            padding: 12,
                            borderBottomWidth: idx < publicGroupsGeoCitySuggestions.length - 1 ? 1 : 0,
                            borderBottomColor: "#e5e7eb",
                          }}
                        >
                          <Text style={{ fontSize: 14, color: "#111827" }}>{suggestion.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}
              
              {/* Sélection du rayon */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 8 }}>
                  Rayon : {publicGroupsGeoRadiusKm ? `${publicGroupsGeoRadiusKm} km` : "non sélectionné"}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "nowrap", gap: 6 }}>
                  {[10, 20, 30, 40, 50].map((km) => {
                    const isSelected = publicGroupsGeoRadiusKm === km;
                    return (
                      <Pressable
                        key={km}
                        onPress={() => {
                          // Si ce rayon est déjà sélectionné, désélectionner (mettre à null)
                          if (isSelected) {
                            setPublicGroupsGeoRadiusKm(null);
                          } else {
                            // Sinon, sélectionner ce rayon
                            setPublicGroupsGeoRadiusKm(km);
                          }
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 6,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          backgroundColor: isSelected ? "#15803d" : "#ffffff",
                          borderWidth: 1,
                          borderColor: isSelected ? "#15803d" : "#d1d5db",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ 
                          fontSize: 12, 
                          fontWeight: isSelected ? "800" : "700", 
                          color: isSelected ? "#ffffff" : "#111827" 
                        }}>
                          {km} km
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              
              {publicGroupsGeoFilter && (
                <Text style={{ fontSize: 12, fontWeight: "500", color: "#15803d", marginTop: 8 }}>
                  ✓ Filtre actif : {publicGroupsGeoRefPoint?.address || "Position sélectionnée"} - {publicGroupsGeoRadiusKm} km
                </Text>
              )}
            </View>
          )}
        </View>
        {filteredPublicGroups.length === 0 ? (
          <View style={[s.card, { alignItems: "center" }]}>
            <Text style={{ color: "#cbd5e1" }}>
              {publicGroupsGeoFilter && (!publicGroupsGeoRefPoint || !publicGroupsGeoRadiusKm)
                ? "Configure le filtre géographique en sélectionnant une position et un rayon."
                : publicGroupsClubFilter 
                  ? "Aucun groupe public pour ce club." 
                  : publicGroupsGeoFilter
                    ? "Aucun groupe public dans le rayon sélectionné."
                    : "Aucun groupe public disponible."}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {filteredPublicGroups.map((g) => (
              <View key={g.id} style={s.rowCard} pointerEvents="box-none">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar
                    url={g.avatar_url}
                    fallback={g.name}
                    size={40}
                    onPress={
                      g.club_id
                        ? press(
                            `public-group-club-avatar-${g.id}`,
                            () => openClubPage(g.club_id)
                          )
                        : undefined
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: "700", color: "#ffffff", textTransform: 'uppercase' }}>{g.name}</Text>
                    <Text style={{ color: "#b0d4fb", marginTop: 2, fontWeight: "700" }}>
                      {g.visibility === 'public' ? `Public · ${g.join_policy === 'open' ? 'Ouvert' : 'Sur demande'}` : 'Privé'}
                      {g.club_name && ` · ${g.club_name}`}
                      {g.distanceKm !== null && g.distanceKm !== Infinity && (
                        <Text style={{ color: "#9ca3af" }}> · {typeof g.distanceKm === 'number' ? g.distanceKm.toFixed(1) : g.distanceKm} km</Text>
                      )}
                    </Text>
                    {g.club_id && g.club_name && (
                      <Pressable
                        onPress={press(`view-club-${g.club_id}`, () => router.push(`/clubs/${g.club_id}?returnTo=groupes`))}
                        style={{ marginTop: 4, alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)" }}
                      >
                        <Text style={{ color: "#b0d4fb", fontWeight: "700", fontSize: 12 }}>
                          voir la page club
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                <Pressable onPress={press("join-public", () => onJoinPublic(g.id))} style={[s.btnTiny, { backgroundColor: "#111827" }, Platform.OS === "web" && { cursor: "pointer" }]}>
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 12 }}>Rejoindre</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB "+" */}
      <Pressable 
        onPress={press("fab-create-group", onCreateGroup)} 
        style={[
          s.fab, 
          { bottom: Math.max(22, insets.bottom + 100) },
          Platform.OS === "web" && { cursor: "pointer" }
        ]} 
      >
        <Ionicons name="add" size={32} color="#ffffff" />
      </Pressable>

      {/* Modal édition groupe */}
      <Modal visible={showEditGroup} transparent animationType="fade" onRequestClose={() => setShowEditGroup(false)}>
        <KeyboardAvoidingView style={s.qrWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 16 }} keyboardShouldPersistTaps="handled">
            <View style={[s.qrCard, { width: 320, alignSelf: "center", alignItems: "stretch" }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={{ fontWeight: "800", fontSize: 18 }}>Modifier le groupe</Text>
                <Pressable 
                  onPress={() => {
                    setShowEditGroup(false);
                    setEditingGroupId(null);
                    setEditingGroupName("");
                    setEditingGroupVisibility("private");
                    setEditingGroupJoinPolicy("invite");
                  }} 
                  style={[{ padding: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
                >
                  <Ionicons name="close" size={24} color="#dc2626" />
                </Pressable>
              </View>
              
              <TextInput
                placeholder="Nom du groupe"
                value={editingGroupName}
                onChangeText={setEditingGroupName}
                style={s.input}
                autoFocus
                returnKeyType="done"
                blurOnSubmit
              />

              <Text style={{ marginTop: 12, marginBottom: 8, fontWeight: "700", color: "#111827" }}>Type de groupe</Text>

              {/* Privé - toujours disponible */}
              <TouchableOpacity
                onPress={() => {
                  setEditingGroupVisibility("private");
                  setEditingGroupJoinPolicy("invite");
                }}
                style={[s.choice, editingGroupVisibility === "private" ? s.choiceActive : null]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="lock-closed-outline" size={16} color={editingGroupVisibility === "private" ? BRAND : "#374151"} />
                  <Text style={[s.choiceTxt, editingGroupVisibility === "private" ? s.choiceTxtActive : null]}>Privé</Text>
                </View>
              </TouchableOpacity>

              {/* Public (sur demande) - pour super admin, admin et club_manager */}
              {(isSuperAdmin || isGlobalAdmin || userRole === 'club_manager') && (
                <TouchableOpacity
                  onPress={() => {
                    setEditingGroupVisibility("public");
                    setEditingGroupJoinPolicy("request");
                  }}
                  style={[s.choice, editingGroupVisibility === "public" && editingGroupJoinPolicy === "request" ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="people-outline" size={16} color={editingGroupVisibility === "public" && editingGroupJoinPolicy === "request" ? BRAND : "#374151"} />
                    <Text style={[s.choiceTxt, editingGroupVisibility === "public" && editingGroupJoinPolicy === "request" ? s.choiceTxtActive : null]}>Public (sur demande)</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Public (ouvert) - uniquement pour super admin */}
              {isSuperAdmin && (
                <TouchableOpacity
                  onPress={() => {
                    setEditingGroupVisibility("public");
                    setEditingGroupJoinPolicy("open");
                  }}
                  style={[s.choice, editingGroupVisibility === "public" && editingGroupJoinPolicy === "open" ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="earth-outline" size={16} color={editingGroupVisibility === "public" && editingGroupJoinPolicy === "open" ? BRAND : "#374151"} />
                    <Text style={[s.choiceTxt, editingGroupVisibility === "public" && editingGroupJoinPolicy === "open" ? s.choiceTxtActive : null]}>Public (ouvert)</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Localisation */}
              <Text style={{ marginTop: 16, marginBottom: 8, fontWeight: "700", color: "#111827" }}>
                Localisation {editingGroupVisibility === "public" ? "(ville obligatoire pour les groupes publics)" : "(facultatif)"}
              </Text>
              
              {/* Sélecteur de club */}
              <Pressable
                onPress={() => {
                  setShowEditGroup(false);
                  setTimeout(() => {
                    setEditClubPickerVisible(true);
                  }, 300);
                }}
                style={[
                  s.input,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                  }
                ]}
              >
                <Text style={{ fontSize: 14, color: editingGroupClubId ? '#111827' : '#9ca3af', flex: 1 }}>
                  {editingGroupClubId 
                    ? clubsList.find(c => c.id === editingGroupClubId)?.name || 'Club sélectionné'
                    : 'Sélectionner un club (facultatif)'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6b7280" />
              </Pressable>

              {/* Champ ville avec autocomplete */}
              <View style={{ marginTop: 8 }}>
                <TextInput
                  placeholder={editingGroupVisibility === "public" ? "Ville (obligatoire pour les groupes publics)" : "Ville (facultatif)"}
                  value={editingGroupCity}
                  onChangeText={async (text) => {
                    setEditingGroupCity(text);
                    if (text && text.trim().length >= 2) {
                      // Rechercher des villes pour l'édition
                      const trimmedQuery = text.trim();
                      try {
                        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmedQuery)}&countrycodes=fr&limit=5&featuretype=city&accept-language=fr`;
                        const res = await fetch(url, {
                          headers: { 'User-Agent': 'PadelSync-Groupes/1.0' }
                        });
                        if (res.ok) {
                          const data = await res.json();
                          const suggestions = (data || [])
                            .map(item => {
                              let cityName = item.name || item.display_name.split(',')[0].trim();
                              if (cityName.includes(',')) {
                                cityName = cityName.split(',')[0].trim();
                              }
                              return cityName;
                            })
                            .filter((name, index, self) => 
                              name && name.trim() && index === self.findIndex(t => t.toLowerCase() === name.toLowerCase())
                            )
                            .slice(0, 5)
                            .map(name => ({ name: name.trim() }));
                          setEditingCitySuggestions(suggestions);
                        }
                      } catch (e) {
                        console.warn('[Groupes] Erreur recherche villes édition:', e);
                      }
                    } else {
                      setEditingCitySuggestions([]);
                    }
                  }}
                  style={[
                    s.input,
                    editingGroupVisibility === "public" && (!editingGroupCity || editingGroupCity.trim().length < 2) && {
                      borderColor: "#dc2626",
                      borderWidth: 1.5
                    }
                  ]}
                  returnKeyType="done"
                />
                {loadingCitySuggestions && (
                  <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={BRAND} />
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>Recherche en cours...</Text>
                  </View>
                )}
                {editingCitySuggestions.length > 0 && (
                  <View style={{ marginTop: 4, backgroundColor: '#f9fafb', borderRadius: 8, maxHeight: 150, borderWidth: 1, borderColor: '#e5e7eb' }}>
                    <ScrollView nestedScrollEnabled>
                      {editingCitySuggestions.map((sug, idx) => (
                        <Pressable
                          key={idx}
                          onPress={() => {
                            setEditingGroupCity(sug.name);
                            setEditingCitySuggestions([]);
                          }}
                          style={({ pressed }) => ({
                            paddingVertical: 12,
                            paddingHorizontal: 12,
                            backgroundColor: pressed ? '#f3f4f6' : '#ffffff',
                            borderBottomWidth: idx < editingCitySuggestions.length - 1 ? 1 : 0,
                            borderBottomColor: '#e5e7eb',
                          })}
                        >
                          <Text style={{ fontSize: 14, color: '#111827' }}>{sug.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                <Pressable
                  onPress={() => {
                    setShowEditGroup(false);
                    setEditingGroupId(null);
                    setEditingGroupName("");
                    setEditingGroupVisibility("private");
                    setEditingGroupJoinPolicy("invite");
                    setEditingGroupClubId(null);
                    setEditingGroupCity("");
                    setEditingCitySuggestions([]);
                  }}
                  disabled={savingGroup}
                  style={[s.btn, { backgroundColor: "#6b7280", flex: 1 }, savingGroup && { opacity: 0.5 }, Platform.OS === "web" && { cursor: savingGroup ? "not-allowed" : "pointer" }]}
                >
                  <Text style={[s.btnTxt, { color: "#ffffff" }]}>Annuler</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (editingGroupId) {
                      onUpdateGroup(editingGroupId);
                    }
                  }}
                  disabled={savingGroup}
                  style={[s.btn, { backgroundColor: BRAND, flex: 1 }, savingGroup && { opacity: 0.5 }, Platform.OS === "web" && { cursor: savingGroup ? "not-allowed" : "pointer" }]}
                >
                  {savingGroup ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={[s.btnTxt, { color: "#ffffff" }]}>Sauvegarder</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal création */}
      <Modal visible={showCreate} transparent animationType="fade" onRequestClose={() => {
        setShowCreate(false);
        setCitySuggestions([]);
      }}>
        <KeyboardAvoidingView style={s.qrWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 16 }} keyboardShouldPersistTaps="always">
            <View style={[s.qrCard, { width: 320, alignSelf: "center", alignItems: "stretch" }]}>
              <Text style={{ fontWeight: "800", marginBottom: 12 }}>Nouveau groupe</Text>
              <TextInput
                placeholder="Nom du groupe"
                value={createName}
                onChangeText={setCreateName}
                style={s.input}
                autoFocus
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={doCreateGroup}
              />

              <Text style={{ marginTop: 12, marginBottom: 8, fontWeight: "700", color: "#111827" }}>Type de groupe</Text>

              {/* Privé - toujours disponible */}
              <TouchableOpacity
                onPress={() => {
                  setCreateVisibility("private");
                  setCreateJoinPolicy("invite");
                }}
                style={[s.choice, createVisibility === "private" ? s.choiceActive : null]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="lock-closed-outline" size={16} color={createVisibility === "private" ? BRAND : "#374151"} />
                  <Text style={[s.choiceTxt, createVisibility === "private" ? s.choiceTxtActive : null]}>Privé</Text>
                </View>
              </TouchableOpacity>

              {/* Public (ouvert) - uniquement pour super admin */}
              {isSuperAdmin && (
                <TouchableOpacity
                  onPress={() => {
                    setCreateVisibility("public");
                    setCreateJoinPolicy("open");
                  }}
                  style={[s.choice, createVisibility === "public" && createJoinPolicy === "open" ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="earth-outline" size={16} color={createVisibility === "public" && createJoinPolicy === "open" ? BRAND : "#374151"} />
                    <Text style={[s.choiceTxt, createVisibility === "public" && createJoinPolicy === "open" ? s.choiceTxtActive : null]}>Public (ouvert)</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Public (sur demande) - pour super admin, admin et club_manager */}
              {(isSuperAdmin || isGlobalAdmin || userRole === 'club_manager') && (
                <TouchableOpacity
                  onPress={() => {
                    setCreateVisibility("public");
                    setCreateJoinPolicy("request");
                  }}
                  style={[s.choice, createVisibility === "public" && createJoinPolicy === "request" ? s.choiceActive : null]}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Ionicons name="people-outline" size={16} color={createVisibility === "public" && createJoinPolicy === "request" ? BRAND : "#374151"} />
                    <Text style={[s.choiceTxt, createVisibility === "public" && createJoinPolicy === "request" ? s.choiceTxtActive : null]}>Public (sur demande)</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Localisation */}
              <Text style={{ marginTop: 16, marginBottom: 8, fontWeight: "700", color: "#111827" }}>
                Localisation {createVisibility === "public" ? "(ville obligatoire pour les groupes publics)" : "(facultatif)"}
              </Text>
              
              {/* Sélecteur de club - même structure que profil.js */}
              <Pressable
                onPress={() => {
                  // Fermer la modale de création et ouvrir la modale de sélection de club
                  setShowCreate(false);
                  setTimeout(() => {
                    setClubPickerVisible(true);
                  }, 300); // Petit délai pour laisser la modale se fermer
                }}
                style={[
                  s.input,
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 4,
                  },
                  Platform.OS === 'web' && { cursor: 'pointer' }
                ]}
              >
                <Text style={{ fontSize: 14, color: createClubId ? '#111827' : '#9ca3af', flex: 1 }}>
                  {createClubId 
                    ? clubsList.find(c => c.id === createClubId)?.name || 'Club sélectionné'
                    : 'Sélectionner un club support (facultatif)'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#6b7280" />
              </Pressable>

              {/* Champ ville avec autocomplete */}
              <View style={{ marginTop: 8 }}>
                <TextInput
                  placeholder={createVisibility === "public" ? "Ville (obligatoire pour les groupes publics)" : "Ville (facultatif)"}
                  value={createCity}
                  onChangeText={setCreateCity}
                  style={[
                    s.input,
                    createVisibility === "public" && (!createCity || createCity.trim().length < 2) && {
                      borderColor: "#dc2626",
                      borderWidth: 1.5
                    }
                  ]}
                  returnKeyType="done"
                />
                {loadingCitySuggestions && (
                  <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={BRAND} />
                    <Text style={{ fontSize: 12, color: '#6b7280' }}>Recherche en cours...</Text>
                  </View>
                )}
                {citySuggestions.length > 0 && (
                  <View style={{ marginTop: 4, backgroundColor: '#f9fafb', borderRadius: 8, maxHeight: 150, borderWidth: 1, borderColor: '#e5e7eb' }}>
                    <ScrollView nestedScrollEnabled>
                      {citySuggestions.map((sug, idx) => (
                        <Pressable
                          key={idx}
                          onPress={() => {
                            setCreateCity(sug.name);
                            setCitySuggestions([]);
                          }}
                          style={({ pressed }) => ({
                            paddingVertical: 12,
                            paddingHorizontal: 12,
                            backgroundColor: pressed ? '#f3f4f6' : '#ffffff',
                            borderBottomWidth: idx < citySuggestions.length - 1 ? 1 : 0,
                            borderBottomColor: '#e5e7eb',
                          })}
                        >
                          <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{sug.name}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <Pressable onPress={press("create-cancel", () => {
                  setShowCreate(false);
                  setCitySuggestions([]);
                })} style={[s.btn, { backgroundColor: "#9ca3af", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]} >
                  <Text style={s.btnTxt}>Annuler</Text>
                </Pressable>
                <Pressable onPress={press("create-confirm", doCreateGroup)} style={[s.btn, { backgroundColor: BRAND, flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]} >
                  <Text style={s.btnTxt}>Créer</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal sélection club (même style que dans profil.js) */}
      <Modal
        visible={clubPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          // Fermer la modale de sélection et rouvrir la modale de création
          setClubPickerVisible(false);
          setClubSearchText("");
          setTimeout(() => {
            setShowCreate(true);
          }, 300); // Petit délai pour laisser la modale se fermer
        }}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: 'flex-end' }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
            onPress={() => {
              // Fermer la modale de sélection et rouvrir la modale de création
              setClubPickerVisible(false);
              setClubSearchText("");
              setTimeout(() => {
                setShowCreate(true);
              }, 300); // Petit délai pour laisser la modale se fermer
            }}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' }}>
                {/* En-tête fixe - toujours visible en haut */}
                <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#ffffff' }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>
                    Sélectionner un club support
                  </Text>
                  {addressHome?.lat && addressHome?.lng && (
                    <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                      Triés par distance du domicile
                    </Text>
                  )}
                  {/* Barre de recherche */}
                  <TextInput
                    style={{
                      marginTop: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: '#d1d5db',
                      borderRadius: 8,
                      backgroundColor: '#f9fafb',
                      fontSize: 16,
                      color: '#111827',
                    }}
                    placeholder="Rechercher un club..."
                    placeholderTextColor="#9ca3af"
                    value={clubSearchText}
                    onChangeText={(text) => {
                      setClubSearchText(text);
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                {loadingClubs ? (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={BRAND} />
                    <Text style={{ marginTop: 12, color: '#6b7280' }}>Chargement des clubs...</Text>
                  </View>
                ) : (
                  <ScrollView 
                    style={{ maxHeight: 350 }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                  >
                {clubsList
                    .filter((c) => {
                      if (!clubSearchText.trim()) return true;
                      const searchLower = clubSearchText.toLowerCase().trim();
                      const nameMatch = c.name?.toLowerCase().includes(searchLower);
                      const addressMatch = c.address?.toLowerCase().includes(searchLower);
                      return nameMatch || addressMatch;
                    })
                    .map((c, idx, filteredList) => (
                  <Pressable
                    key={c.id || idx}
                    onPress={() => {
                      // Sélectionner le club, fermer la modale de sélection et rouvrir la modale de création
                      setCreateClubId(c.id);
                      
                      // Extraire la ville de l'adresse du club si disponible
                      if (c.address) {
                        const address = c.address.trim();
                        let cityName = '';
                        
                        // Pattern 1: Chercher "Code Postal Ville" (5 chiffres suivis d'un espace et d'un nom)
                        // Ex: "123 Rue Example, 59000 Lille, France" -> "Lille"
                        const cpCityMatch = address.match(/(\d{5})\s+([^,]+?)(?:\s*,\s*|$)/);
                        if (cpCityMatch) {
                          cityName = cpCityMatch[2].trim();
                        } else {
                          // Pattern 2: Si pas de code postal, prendre l'avant-dernière partie si plusieurs virgules
                          // Ex: "123 Rue Example, Ville, Pays" -> "Ville"
                          const addressParts = address.split(',').map(part => part.trim());
                          if (addressParts.length > 2) {
                            // Prendre l'avant-dernière partie (généralement la ville, la dernière étant le pays)
                            cityName = addressParts[addressParts.length - 2];
                          } else if (addressParts.length === 2) {
                            // Si seulement 2 parties, prendre la dernière (probablement "Code Postal Ville" ou "Ville")
                            cityName = addressParts[1];
                            // Enlever le code postal si présent
                            cityName = cityName.replace(/^\d{5}\s*/, '').trim();
                          } else {
                            // Si pas de virgule, chercher un code postal dans la chaîne
                            const cpMatch = address.match(/\d{5}\s+([^\s,]+)/);
                            if (cpMatch) {
                              cityName = cpMatch[1];
                            } else {
                              // Dernier recours: prendre la dernière partie après le dernier espace
                              const parts = address.split(/\s+/);
                              if (parts.length > 1) {
                                cityName = parts[parts.length - 1];
                              }
                            }
                          }
                        }
                        
                        // Nettoyer: enlever "France" ou autres noms de pays communs
                        cityName = cityName.replace(/\s*(France|FRANCE|france)\s*$/i, '').trim();
                        
                        if (cityName && cityName.length > 1) {
                          setCreateCity(cityName);
                        }
                      }
                      
                      setClubPickerVisible(false);
                      setClubSearchText("");
                      setTimeout(() => {
                        setShowCreate(true);
                      }, 300); // Petit délai pour laisser la modale se fermer
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: 16,
                      paddingHorizontal: 20,
                      backgroundColor: pressed ? '#f3f4f6' : createClubId === c.id ? '#e0f2fe' : '#ffffff',
                      borderBottomWidth: idx < filteredList.length - 1 ? 1 : 0,
                      borderBottomColor: '#e5e7eb',
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, color: '#111827', fontWeight: createClubId === c.id ? '700' : '400' }}>
                          {c.name}
                        </Text>
                        {c.address && (
                          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                            {c.address}
                          </Text>
                        )}
                        {c.distance !== undefined && c.distance !== Infinity && (
                          <Text style={{ fontSize: 12, color: BRAND, marginTop: 2 }}>
                            {c.distance} km
                          </Text>
                        )}
                      </View>
                      {createClubId === c.id && <Ionicons name="checkmark" size={20} color={BRAND} />}
                    </View>
                  </Pressable>
                ))}
                {clubsList.filter((c) => {
                  if (!clubSearchText.trim()) return true;
                  const searchLower = clubSearchText.toLowerCase().trim();
                  const nameMatch = c.name?.toLowerCase().includes(searchLower);
                  const addressMatch = c.address?.toLowerCase().includes(searchLower);
                  return nameMatch || addressMatch;
                }).length === 0 && !loadingClubs && (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ color: '#6b7280' }}>
                      {clubSearchText.trim() ? 'Aucun club trouvé' : 'Aucun club disponible'}
                    </Text>
                  </View>
                )}
                </ScrollView>
              )}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal sélection club pour édition */}
      <Modal
        visible={editClubPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setEditClubPickerVisible(false);
          setClubSearchText("");
          setTimeout(() => {
            setShowEditGroup(true);
          }, 300);
        }}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={() => {
            setEditClubPickerVisible(false);
            setClubSearchText("");
            setTimeout(() => {
              setShowEditGroup(true);
            }, 300);
          }}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1, justifyContent: 'flex-end' }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
              onPress={() => {
                setEditClubPickerVisible(false);
                setClubSearchText("");
                setTimeout(() => {
                  setShowEditGroup(true);
                }, 300);
              }}
            >
              <Pressable onPress={(e) => e.stopPropagation()}>
                <View style={{ backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' }}>
                  {/* En-tête fixe - toujours visible en haut */}
                  <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#ffffff' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>
                      Sélectionner un club support
                    </Text>
                    {addressHome?.lat && addressHome?.lng && (
                      <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                        Triés par distance du domicile
                      </Text>
                    )}
                    {/* Barre de recherche */}
                    <TextInput
                      style={{
                        marginTop: 12,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderWidth: 1,
                        borderColor: '#d1d5db',
                        borderRadius: 8,
                        backgroundColor: '#f9fafb',
                        fontSize: 16,
                        color: '#111827',
                      }}
                      placeholder="Rechercher un club..."
                      placeholderTextColor="#9ca3af"
                      value={clubSearchText}
                      onChangeText={(text) => {
                        setClubSearchText(text);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  {loadingClubs ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                      <ActivityIndicator size="large" color={BRAND} />
                      <Text style={{ marginTop: 12, color: '#6b7280' }}>Chargement des clubs...</Text>
                    </View>
                  ) : (
                    <ScrollView 
                      style={{ maxHeight: 350 }}
                      keyboardShouldPersistTaps="handled"
                      keyboardDismissMode="on-drag"
                    >
                      <Pressable
                  onPress={() => {
                    setEditingGroupClubId(null);
                    setEditClubPickerVisible(false);
                      setClubSearchText("");
                    setTimeout(() => {
                      setShowEditGroup(true);
                    }, 300);
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: 16,
                    paddingHorizontal: 20,
                    backgroundColor: pressed ? '#f3f4f6' : !editingGroupClubId ? '#e0f2fe' : '#ffffff',
                    borderBottomWidth: 1,
                    borderBottomColor: '#e5e7eb',
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 16, color: '#111827', fontWeight: !editingGroupClubId ? '700' : '400' }}>
                      Aucun club
                    </Text>
                    {!editingGroupClubId && <Ionicons name="checkmark" size={20} color={BRAND} />}
                  </View>
                </Pressable>
                  {clubsList
                    .filter((c) => {
                      if (!clubSearchText.trim()) return true;
                      const searchLower = clubSearchText.toLowerCase().trim();
                      const nameMatch = c.name?.toLowerCase().includes(searchLower);
                      const addressMatch = c.address?.toLowerCase().includes(searchLower);
                      return nameMatch || addressMatch;
                    })
                    .map((c, idx, filteredList) => (
                  <Pressable
                    key={c.id || idx}
                    onPress={() => {
                      setEditingGroupClubId(c.id);
                      
                      // Extraire la ville de l'adresse du club si disponible
                      if (c.address) {
                        const address = c.address.trim();
                        let cityName = '';
                        
                        const cpCityMatch = address.match(/(\d{5})\s+([^,]+?)(?:\s*,\s*|$)/);
                        if (cpCityMatch) {
                          cityName = cpCityMatch[2].trim();
                        } else {
                          const addressParts = address.split(',').map(part => part.trim());
                          if (addressParts.length > 2) {
                            cityName = addressParts[addressParts.length - 2];
                          } else if (addressParts.length === 2) {
                            cityName = addressParts[1];
                            cityName = cityName.replace(/^\d{5}\s*/, '').trim();
                          } else {
                            const cpMatch = address.match(/\d{5}\s+([^\s,]+)/);
                            if (cpMatch) {
                              cityName = cpMatch[1];
                            } else {
                              const parts = address.split(/\s+/);
                              if (parts.length > 1) {
                                cityName = parts[parts.length - 1];
                              }
                            }
                          }
                        }
                        
                        cityName = cityName.replace(/\s*(France|FRANCE|france)\s*$/i, '').trim();
                        
                        if (cityName && cityName.length > 1) {
                          setEditingGroupCity(cityName);
                        }
                      }
                      
                      setEditClubPickerVisible(false);
                      setClubSearchText("");
                      setTimeout(() => {
                        setShowEditGroup(true);
                      }, 300);
                    }}
                    style={({ pressed }) => ({
                      paddingVertical: 16,
                      paddingHorizontal: 20,
                      backgroundColor: pressed ? '#f3f4f6' : editingGroupClubId === c.id ? '#e0f2fe' : '#ffffff',
                      borderBottomWidth: idx < filteredList.length - 1 ? 1 : 0,
                      borderBottomColor: '#e5e7eb',
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, color: '#111827', fontWeight: editingGroupClubId === c.id ? '700' : '400' }}>
                          {c.name}
                        </Text>
                        {c.address && (
                          <Text style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                            {c.address}
                          </Text>
                        )}
                        {c.distance !== undefined && c.distance !== Infinity && (
                          <Text style={{ fontSize: 12, color: BRAND, marginTop: 2 }}>
                            {c.distance} km
                          </Text>
                        )}
                      </View>
                      {editingGroupClubId === c.id && <Ionicons name="checkmark" size={20} color={BRAND} />}
                    </View>
                  </Pressable>
                ))}
                {clubsList.filter((c) => {
                  if (!clubSearchText.trim()) return true;
                  const searchLower = clubSearchText.toLowerCase().trim();
                  const nameMatch = c.name?.toLowerCase().includes(searchLower);
                  const addressMatch = c.address?.toLowerCase().includes(searchLower);
                  return nameMatch || addressMatch;
                }).length === 0 && !loadingClubs && (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <Text style={{ color: '#6b7280' }}>
                      {clubSearchText.trim() ? 'Aucun club trouvé' : 'Aucun club disponible'}
                    </Text>
                  </View>
                )}
                  </ScrollView>
                )}
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal QR */}
      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={s.qrWrap}>
          <View style={s.qrCard}>
            <Text style={{ fontWeight: "800", marginBottom: 12 }}>Code d'invitation</Text>
            {qrCode ? (
              <>
                <Text style={{ marginTop: 16, fontSize: 14, color: "#666", textAlign: "center" }}>
                  Pour rejoindre ce groupe, utilisez le code suivant :
                </Text>
                <Text style={{ marginTop: 16, fontSize: 32, fontWeight: "700", letterSpacing: 4, textAlign: "center", color: BRAND }}>
                  {qrCode}
                </Text>
                <Text style={{ marginTop: 16, fontSize: 12, color: "#999", textAlign: "center", paddingHorizontal: 20 }}>
                  1. Ouvre l'app Padel Sync{'\n'}
                  2. Va dans "Groupes" → "Rejoindre un groupe"{'\n'}
                  3. Entre le code ci-dessus
                </Text>
              </>
            ) : (
              <ActivityIndicator style={{ marginTop: 20 }} />
            )}
            {qrCode ? (
              <Pressable 
                onPress={press("share-invite-code", async () => {
                  try {
                    // Liens de téléchargement de l'app
                    const iosAppLink = "https://apps.apple.com/app/padel-sync/id6754223924";
                    const androidAppLink = "https://play.google.com/store/apps/details?id=com.padelsync.app";
                    
                    const message = `🎾 Rejoins mon groupe Padel Sync !

Organise tes matchs en 3 clics avec l'app Padel Sync 📱



🔑 CODE DU GROUPE

${qrCode}



➡️ Une fois l'app installée

1️⃣ Ouvre l'app Padel Sync

2️⃣ Va dans l'onglet "Groupes"

3️⃣ Clique sur "Rejoindre un groupe"

4️⃣ Entre le code ci-dessus



📲 Installe l'app ici

🍎 iOS
${iosAppLink}

🤖 Android
${androidAppLink}



Padel Sync — Ton match en 3 clics 🎾`;
                    
                    await Share.share({ message });
                  } catch (e) {
                    console.error('[Share Code] Erreur:', e);
                    Alert.alert("Partage impossible", e?.message ?? String(e));
                  }
                })} 
                style={[s.btn, { backgroundColor: "#10b981", marginTop: 14, paddingVertical: 16, paddingHorizontal: 20 }, Platform.OS === "web" && { cursor: "pointer" }]} 
              >
                <Text style={s.btnTxt}>Envoyer l'invitation</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={press("close-qr", () => setQrVisible(false))} style={[s.btn, { backgroundColor: "#dc2626", marginTop: 14, paddingVertical: 16, paddingHorizontal: 20 }, Platform.OS === "web" && { cursor: "pointer" }]} >
              <Text style={s.btnTxt}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal Rejoindre un groupe */}
      <Modal visible={joinModalVisible} transparent animationType="fade" onRequestClose={() => setJoinModalVisible(false)}>
        <KeyboardAvoidingView style={s.qrWrap} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={[s.qrCard, { position: "relative", paddingTop: 20 }]}>
            <Pressable 
              onPress={press("close-join-modal", () => setJoinModalVisible(false))} 
              style={[{ position: "absolute", right: 8, top: 8, padding: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
            >
              <Ionicons name="close" size={28} color="#dc2626" />
            </Pressable>
            <Text style={{ fontWeight: "800", fontSize: 20, marginBottom: 12, paddingRight: 20 }}>
              {Platform.OS === "android" ? "Rejoindre" : "Rejoindre un groupe"}
            </Text>
            <Text style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
              Entre un code d'invitation ou colle un lien d'invitation
            </Text>
            <TextInput
              placeholder="Code d'invitation ou lien syncpadel://join?group_id=..."
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="none"
              style={[s.input, { marginBottom: 12 }]}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable 
                onPress={press("paste-deep-link", handlePasteDeepLink)} 
                style={[s.btn, { backgroundColor: "#9ca3af", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}
              >
                <Text style={s.btnTxt}>Coller et utiliser</Text>
              </Pressable>
              <Pressable 
                onPress={press("accept-invite", handleAcceptInvite)} 
                style={[s.btn, { backgroundColor: BRAND, flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}
              >
                <Text style={s.btnTxt}>Rejoindre</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal confirmation demande de rejoindre */}
      <Modal visible={joinRequestConfirmVisible} transparent animationType="fade" onRequestClose={() => setJoinRequestConfirmVisible(false)}>
        <View style={s.qrWrap}>
          <View style={s.qrCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontWeight: "800", fontSize: 20 }}>Demande de rejoindre</Text>
              <Pressable 
                onPress={press("close-join-request-confirm", () => {
                  setJoinRequestConfirmVisible(false);
                  setPendingJoinGroupId(null);
                  setPendingJoinGroupName(null);
                })} 
                style={[{ position: "absolute", right: 8, top: 8, padding: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
              >
                <Ionicons name="close" size={28} color="#dc2626" />
              </Pressable>
            </View>
            <Text style={{ fontSize: 16, color: "#111827", marginBottom: 20, textAlign: "center" }}>
              Souhaitez-vous demander à rejoindre le groupe "{pendingJoinGroupName}" ?
            </Text>
            <Text style={{ fontSize: 14, color: "#666", marginBottom: 20, textAlign: "center" }}>
              L'administrateur du groupe sera notifié et validera votre demande sous peu.
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable 
                onPress={press("cancel-join-request", () => {
                  setJoinRequestConfirmVisible(false);
                  setPendingJoinGroupId(null);
                  setPendingJoinGroupName(null);
                })} 
                style={[s.btn, { backgroundColor: "#9ca3af", flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}
              >
                <Text style={s.btnTxt}>Annuler</Text>
              </Pressable>
              <Pressable 
                onPress={press("confirm-join-request", confirmJoinRequest)} 
                style={[s.btn, { backgroundColor: BRAND, flex: 1 }, Platform.OS === "web" && { cursor: "pointer" }]}
              >
                <Text style={s.btnTxt}>Envoyer la demande</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal demandes de rejoindre */}
      <Modal visible={joinRequestsModalVisible} transparent animationType="slide" onRequestClose={() => setJoinRequestsModalVisible(false)}>
        <View style={s.qrWrap}>
          <View style={[s.qrCard, { width: 340, alignItems: "stretch" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <Text style={{ fontWeight: "800" }}>Demandes de rejoindre ({joinRequests.length})</Text>
              <Pressable 
                onPress={press("close-join-requests-modal", () => setJoinRequestsModalVisible(false))} 
                style={[{ padding: 8 }, Platform.OS === "web" && { cursor: "pointer" }]}
              >
                <Ionicons name="close" size={24} color="#dc2626" />
              </Pressable>
            </View>
            {joinRequests.length === 0 ? (
              <Text style={{ color: "#9ca3af", textAlign: "center", paddingVertical: 20 }}>Aucune demande en attente</Text>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {joinRequests.map((request) => {
                  const profile = request.profiles;
                  return (
                    <View key={request.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#e5e7eb" }}>
                      <Avatar 
                        url={profile?.avatar_url} 
                        fallback={profile?.display_name || profile?.name || "?"} 
                        size={40} 
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: "700", color: "#111827" }}>
                          {profile?.display_name || profile?.name || "Utilisateur"}
                        </Text>
                        <Text style={{ fontSize: 12, color: "#6b7280" }}>
                          {new Date(request.requested_at).toLocaleDateString('fr-FR', { 
                            day: 'numeric', 
                            month: 'short', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={press("approve-join-request", () => approveJoinRequest(request.id))}
                          style={[{ padding: 8, borderRadius: 8, backgroundColor: "#15803d" }, Platform.OS === "web" && { cursor: "pointer" }]}
                        >
                          <Ionicons name="checkmark" size={20} color="#ffffff" />
                        </Pressable>
                        <Pressable
                          onPress={press("reject-join-request", () => rejectJoinRequest(request.id))}
                          style={[{ padding: 8, borderRadius: 8, backgroundColor: "#dc2626" }, Platform.OS === "web" && { cursor: "pointer" }]}
                        >
                          <Ionicons name="close" size={20} color="#ffffff" />
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <Pressable 
              onPress={press("close-join-requests-modal", () => setJoinRequestsModalVisible(false))} 
              style={[s.btn, { backgroundColor: BRAND, marginTop: 14 }, Platform.OS === "web" && { cursor: "pointer" }]} 
            >
              <Text style={s.btnTxt}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Modal membres */}
      <Modal visible={membersModalVisible} transparent animationType="slide" onRequestClose={() => setMembersModalVisible(false)}>
        <View style={s.qrWrap}>
          <View style={[s.qrCard, { width: 340, alignItems: "stretch" }]}>
            <Text style={{ fontWeight: "800", marginBottom: 12 }}>Membres ({members.length})</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {[...members]
                .sort((a, b) => {
                  // Admins en premier
                  if (a.is_admin && !b.is_admin) return -1;
                  if (!a.is_admin && b.is_admin) return 1;
                  return 0;
                })
                .map((m) => (
                <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
                  <Avatar url={m.avatar_url} fallback={m.name} size={36} level={m.niveau} profile={m} onLongPressProfile={openProfileForProfile} isAdmin={m.is_admin} />
                  <Text style={{ flex: 1, fontWeight: "600" }}>{m.name}</Text>
                  {m.is_admin && <Text style={{ color: BRAND, fontWeight: "800", marginRight: 8 }}>Admin</Text>}
                  <Pressable
                    onPress={press('contact-member', () => contactMember(m))}
                    style={[{ padding: 6, borderRadius: 8 }, Platform.OS === 'web' && { cursor: 'pointer' }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Contacter ${m.name}`}
                  >
                    <Ionicons name="call-outline" size={20} color={BRAND} />
                  </Pressable>
                  {/* Icône d'exclusion - visible uniquement pour les admins/superadmins */}
                  {(isAdmin || isSuperAdmin) && m.id !== meId && (!m.is_admin || isSuperAdmin) && (
                    <Pressable
                      onPress={() => {
                        console.log('[Pressable] Clic sur exclure membre:', m.name, m.id);
                        removeMember(m);
                      }}
                      style={[{ padding: 6, borderRadius: 8 }, Platform.OS === 'web' && { cursor: 'pointer' }]}
                      accessibilityRole="button"
                      accessibilityLabel={`Exclure ${m.name}`}
                    >
                      <Ionicons name="person-remove-outline" size={20} color="#dc2626" />
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={press("close-members", () => setMembersModalVisible(false))} style={[s.btn, { backgroundColor: BRAND, marginTop: 14 }, Platform.OS === "web" && { cursor: "pointer" }]} >
              <Text style={s.btnTxt}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Popup pas de groupe sélectionné */}
      <OnboardingModal
        visible={groupsVisitedModalVisible}
        message="sélectionne ou rejoins un groupe pour commencer à utiliser l'app"
        onClose={() => setGroupsVisitedModalVisible(false)}
      />

      {/* Popup groupe rejoint - aller sur dispos */}
      <OnboardingModal
        visible={groupJoinedModalVisible}
        message="👉 renseigne tes dispos sur la page dispos"
        onClose={() => setGroupJoinedModalVisible(false)}
      />

      {/* Popup pas de dispos après activation */}
      <OnboardingModal
        visible={noAvailabilityModalVisible}
        message="renseigne tes dispos pour avoir des matchs"
        onClose={() => setNoAvailabilityModalVisible(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionHeader: { marginTop: 2, marginBottom: 2 },
  sectionTitle: { 
    color: "#e0ff00", 
    fontWeight: "800", 
    fontSize: 20,
    textShadowColor: "#000000",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  card: { backgroundColor: "#001831", borderWidth: 0.5, borderColor: "#808080", borderRadius: 12, padding: 12, gap: 8 },
  activeCard: { backgroundColor: "#ffffff", borderColor: "gold" },
  rowCard: { backgroundColor: "#001831", borderWidth: 0.5, borderColor: "#808080", borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  btn: { paddingVertical: 10, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  btnTxt: { color: "white", fontWeight: "800", textAlign: "center" },
  btnTiny: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  choice: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#fff" },
  choiceActive: { borderColor: BRAND, backgroundColor: "#eaf2ff" },
  choiceTxt: { color: "#374151", fontWeight: "700" },
  choiceTxtActive: { color: BRAND },
  badgePublic: { borderWidth: 1, borderColor: BRAND, backgroundColor: "#eaf2ff", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  badgePublicTxt: { color: BRAND, fontWeight: "800", fontSize: 10 },
  editInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
    textTransform: 'uppercase',
  },
  editChoice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
  },
  editChoiceActive: {
    borderColor: BRAND,
    backgroundColor: "#eaf2ff",
  },
  editChoiceTxt: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 14,
  },
  editChoiceTxtActive: {
    color: BRAND,
  },
  editBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  editBtnCancel: {
    backgroundColor: "#6b7280",
  },
  editBtnSave: {
    backgroundColor: BRAND,
  },
  editBtnTxt: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  qrWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  qrCard: { width: 300, borderRadius: 12, backgroundColor: "white", padding: 16, alignItems: "center" },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: "#2fc249",
    borderColor: "#6e935b",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  androidPromptWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  androidPromptCard: { width: 300, borderRadius: 12, backgroundColor: "white", padding: 16 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#111827", backgroundColor: "#f9fafb" },
});