// app/(tabs)/stats.js
// Écran des statistiques du joueur

import { Ionicons } from "@expo/vector-icons";
import { Circle, Svg } from "react-native-svg";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from "../../context/auth";
import { usePlayerBadges } from "../../hooks/usePlayerBadges";
import { usePlayerRating } from "../../hooks/usePlayerRating";
import { usePlayerStats } from "../../hooks/usePlayerStats";
import { useActiveGroup } from "../../lib/activeGroup";
import { getBadgeImage } from "../../lib/badgeImages";
import { supabase } from "../../lib/supabase";
import { formatPlayerName } from "../../lib/uiSafe";

const BRAND = "#1a4b97";

const LEVELS = [
  { v: 1, label: "Débutant", color: "#a3e635" },
  { v: 2, label: "Perfectionnement", color: "#86efac" },
  { v: 3, label: "Élémentaire", color: "#0e7aff" },
  { v: 4, label: "Intermédiaire", color: "#0d97ac" },
  { v: 5, label: "Confirmé", color: "#ff9d00" },
  { v: 6, label: "Avancé", color: "#f06300" },
  { v: 7, label: "Expert", color: "#fb7185" },
  { v: 8, label: "Elite", color: "#a78bfa" },
];
const colorForLevel = (n) => (LEVELS.find(x => x.v === Number(n))?.color) || '#9ca3af';

function BadgeIcon({ badge, size = 120 }) {
  const badgeImage = getBadgeImage(badge.code, badge.unlocked);
  const opacity = badge.unlocked ? 1 : 0.4;

  return (
    <View style={{ 
      width: size, 
      height: size, 
      borderRadius: size / 2, 
      backgroundColor: 'transparent', 
      alignItems: 'center', 
      justifyContent: 'center',
      borderWidth: 0,
      position: 'relative',
      opacity,
      overflow: 'hidden'
    }}>
      {badgeImage ? (
        <Image 
          source={badgeImage}
          style={{ 
            width: size * 0.9, 
            height: size * 0.9,
            resizeMode: 'contain'
          }}
        />
      ) : null}
    </View>
  );
}

function RatingDonut({
  value = 0,
  size = 140,
  thickness = 6,
  color = "#E0FF00",
  trackColor = "rgba(255,255,255,0.12)",
  children,
}) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const filled = (clamped / 100) * c;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={trackColor}
          strokeWidth={thickness}
          fill="transparent"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          fill="transparent"
          strokeDasharray={c}
          strokeDashoffset={c - filled}
          strokeLinecap="round"
          rotation={-90}
          originX={size / 2}
          originY={size / 2}
        />
      </Svg>
      <View
        style={{
          position: "absolute",
          width: size - thickness * 2,
          height: size - thickness * 2,
          borderRadius: (size - thickness * 2) / 2,
          backgroundColor: "rgba(6,26,43,0.5)",
        }}
      />
      <View style={{ alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}

export default function StatsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { activeGroup } = useActiveGroup();

  // États pour les données du profil
  const [me, setMe] = useState(null);
  const [main, setMain] = useState(null);
  const [club, setClub] = useState("");
  const [city, setCity] = useState(null);
  const [addressHome, setAddressHome] = useState(null);
  const [addressWork, setAddressWork] = useState(null);

  // Stats et badges
  const { featuredRare, featuredRecent, unlockedCount, totalAvailable, isLoading: badgesLoading, error: badgesError } = usePlayerBadges(me?.id);
  const { level, xp, isLoading: ratingLoading } = usePlayerRating(me?.id);
  const { stats, isLoading: statsLoading, isError: statsError } = usePlayerStats(me?.id);

  // Avatar, niveau et classement du partenaire principal
  const [partnerAvatar, setPartnerAvatar] = useState(null);
  const [partnerLevel, setPartnerLevel] = useState(null);
  const [partnerRank, setPartnerRank] = useState(null);

  // États pour les classements
  const [globalRank, setGlobalRank] = useState(null);
  const [clubRank, setClubRank] = useState(null);
  const [groupRank, setGroupRank] = useState(null);
  const [loadingRanks, setLoadingRanks] = useState(true);
  const [favoriteClubId, setFavoriteClubId] = useState(null);

  // Historique des 5 derniers matchs (forme du moment)
  const [historyMatches, setHistoryMatches] = useState([]);
  const [historyProfilesById, setHistoryProfilesById] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Charger le profil
  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const id = u?.user?.id ?? null;
        const email = u?.user?.email ?? "";
        if (!id) return;
        setMe({ id, email });

        const { data: p, error } = await supabase
          .from("profiles")
          .select("main, club, address_home, address_work")
          .eq("id", id)
          .maybeSingle();
        if (error) throw error;

        setMain(p?.main ?? null);
        setClub(p?.club ?? "");
        setAddressHome(p?.address_home || null);
        setAddressWork(p?.address_work || null);
      } catch (e) {
        console.error('[Stats] Error loading profile:', e);
      }
    })();
  }, []);

  // Déduire la ville depuis address_home / address_work
  useEffect(() => {
    let userCity = addressHome?.city || addressWork?.city || null;

    if (!userCity) {
      const homeAddress = addressHome?.address;
      const workAddress = addressWork?.address;
      const addressToParse = homeAddress || workAddress;

      if (addressToParse && typeof addressToParse === 'string') {
        const parts = addressToParse.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          userCity = parts[1];
        }
      }
    }

    setCity(userCity || null);
  }, [addressHome, addressWork]);

  // Récupérer le club_id depuis le nom du club favori
  useEffect(() => {
    if (!club || !club.trim()) {
      setFavoriteClubId(null);
      return;
    }

    (async () => {
      try {
        const clubNameTrimmed = club.trim();
        const { data, error } = await supabase
          .from('clubs')
          .select('id, name')
          .eq('name', clubNameTrimmed)
          .maybeSingle();

        if (error) {
          console.error('[Stats] Error fetching club_id:', error);
          setFavoriteClubId(null);
          return;
        }

        if (data?.id) {
          setFavoriteClubId(data.id);
        } else {
          setFavoriteClubId(null);
        }
      } catch (e) {
        console.error('[Stats] Error fetching club_id:', e);
        setFavoriteClubId(null);
      }
    })();
  }, [club]);

  // Charger l'historique des 5 derniers matchs confirmés du groupe actif
  useEffect(() => {
    const loadHistory = async () => {
      if (!activeGroup?.id || !me?.id) {
        setHistoryMatches([]);
        setHistoryProfilesById({});
        return;
      }

      try {
        setHistoryLoading(true);
        setHistoryError(null);

        const groupId = activeGroup.id;
        const meId = me.id;

        // APPROCHE IDENTIQUE À matches/index.js
        // 1. Charger les RSVPs de l'utilisateur avec status 'accepted', 'yes', ou 'maybe'
        const { data: userRsvps, error: rsvpsError } = await supabase
          .from('match_rsvps')
          .select('match_id, status')
          .eq('user_id', meId)
          .in('status', ['accepted', 'yes', 'maybe']);

        if (rsvpsError) {
          console.error('[Stats History] Error loading user RSVPs:', rsvpsError);
          throw rsvpsError;
        }

        if (!userRsvps || userRsvps.length === 0) {
          setHistoryMatches([]);
          setHistoryProfilesById({});
          return;
        }

        const userMatchIds = userRsvps.map(r => r.match_id);

        // 2. Charger les matches correspondants avec les filtres de groupe et status
        const { data: allMatchesData, error: matchesError } = await supabase
          .from('matches')
          .select(`
            id,
            status,
            created_at,
            time_slot_id,
            group_id,
            time_slots (
              id,
              starts_at,
              ends_at
            )
          `)
          .in('id', userMatchIds)
          .eq('group_id', groupId)
          .eq('status', 'confirmed')
          .order('created_at', { ascending: false });

        if (matchesError) {
          console.error('[Stats History] Error loading matches:', matchesError);
          throw matchesError;
        }

        if (!allMatchesData || allMatchesData.length === 0) {
          setHistoryMatches([]);
          setHistoryProfilesById({});
          return;
        }

        // Prendre les 5 derniers matches
        const matchesData = (allMatchesData || []).slice(0, 5);
        const finalMatchIds = matchesData.map(m => m.id);

        // 3. Charger les informations des groupes pour ces matchs
        const groupIds = [...new Set(matchesData.map(m => m.group_id).filter(Boolean))];
        let groupsMap = {};
        if (groupIds.length > 0) {
          const { data: groupsData, error: groupsError } = await supabase
            .from('groups')
            .select('id, name')
            .in('id', groupIds);

          if (!groupsError && groupsData) {
            groupsMap = (groupsData || []).reduce((acc, g) => {
              acc[g.id] = g;
              return acc;
            }, {});
          }
        }

        // 4. Charger les résultats de ces matchs (optionnels)
        const { data: resultsData, error: resultsError } = await supabase
          .from('match_results')
          .select(`
            match_id,
            team1_score,
            team2_score,
            winner_team,
            team1_player1_id,
            team1_player2_id,
            team2_player1_id,
            team2_player2_id,
            score_text,
            recorded_at
          `)
          .in('match_id', finalMatchIds);

        if (resultsError) {
          console.warn('[Stats History] Error loading results:', resultsError);
        }

        // 5. Charger TOUS les RSVPs de ces matchs (pour l'affichage)
        const { data: allRsvpsData, error: allRsvpsError } = await supabase
          .from('match_rsvps')
          .select('match_id, user_id, status')
          .in('match_id', finalMatchIds);

        if (allRsvpsError) {
          console.warn('[Stats History] Error loading all RSVPs:', allRsvpsError);
        }

        // 6. Indexer résultats et RSVPs par match
        const resultsByMatchId = new Map();
        (resultsData || []).forEach(result => {
          resultsByMatchId.set(result.match_id, result);
        });

        const rsvpsByMatchId = new Map();
        (allRsvpsData || []).forEach(rsvp => {
          if (!rsvpsByMatchId.has(rsvp.match_id)) {
            rsvpsByMatchId.set(rsvp.match_id, []);
          }
          rsvpsByMatchId.get(rsvp.match_id).push(rsvp);
        });

        // 7. Charger les profils de tous les joueurs concernés
        const allUserIds = new Set();
        (allRsvpsData || []).forEach(r => {
          if (r.user_id) allUserIds.add(String(r.user_id));
        });
        (resultsData || []).forEach(res => {
          [
            res.team1_player1_id,
            res.team1_player2_id,
            res.team2_player1_id,
            res.team2_player2_id,
          ].forEach(userId => {
            if (userId) allUserIds.add(String(userId));
          });
        });

        let profilesMap = {};
        if (allUserIds.size > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, email, niveau')
            .in('id', Array.from(allUserIds));

          if (profilesError) throw profilesError;

          profilesMap = (profilesData || []).reduce((acc, p) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }

        // 8. Combiner les données pour le rendu
        const matchesWithDetails = matchesData.map(match => ({
          ...match,
          result: resultsByMatchId.get(match.id) || null,
          rsvps: rsvpsByMatchId.get(match.id) || [],
          group: groupsMap[match.group_id] || null,
        }));

        setHistoryMatches(matchesWithDetails);
        setHistoryProfilesById(profilesMap);
      } catch (e) {
        console.error('[Stats History] Erreur lors du chargement:', e);
        setHistoryMatches([]);
        setHistoryProfilesById({});
        setHistoryError(e?.message || 'Erreur lors du chargement des derniers matchs.');
      } finally {
        setHistoryLoading(false);
      }
    };

    if (activeGroup?.id && me?.id) {
      loadHistory();
    } else {
      setHistoryMatches([]);
      setHistoryProfilesById({});
    }
  }, [activeGroup?.id, me?.id]);

  // Avatar utilisé pour l'historique des matchs (forme du moment)
  const HistoryAvatar = ({ profile = {}, size = 40 }) => {
    const uri = profile?.avatar_url || null;
    const fallback = formatPlayerName(profile?.display_name || profile?.name || profile?.email || 'Joueur');
    const level = profile?.niveau ?? profile?.level ?? null;

    let initials = 'U';
    if (fallback) {
      const parts = fallback.trim().split(/\s+/);
      if (parts.length >= 2) {
        initials = (parts[0][0] || 'U') + (parts[1][0] || 'U');
      } else if (parts[0]) {
        initials = parts[0].substring(0, 2).toUpperCase();
      }
    }

    return (
      <View style={{ position: 'relative', width: size, height: size }}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#d1d5db',
            borderWidth: 2,
            borderColor: '#374151',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {uri ? (
            <Image
              source={{ uri }}
              style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
            />
          ) : (
            <Text
              style={{
                fontSize: size < 40 ? size / 2.5 : size / 3,
                fontWeight: '900',
                color: '#374151',
                textAlign: 'center',
              }}
            >
              {initials}
            </Text>
          )}
        </View>
        {level != null && level !== '' && (
          <View
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: Math.max(22, Math.round(size * 0.38)),
              height: Math.max(22, Math.round(size * 0.38)),
              borderRadius: Math.max(11, Math.round(size * 0.19)),
              backgroundColor: colorForLevel(level),
              borderWidth: 1,
              borderColor: '#ffffff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                color: '#000000',
                fontWeight: '900',
                fontSize: Math.max(10, Math.round(size * 0.34 * 0.6)),
              }}
            >
              {String(level)}
            </Text>
          </View>
        )}
      </View>
    );
  };

  // Charger les classements
  useEffect(() => {
    if (!me?.id) {
      setLoadingRanks(false);
      return;
    }

    const fetchRanks = async () => {
      setLoadingRanks(true);
      try {
        const promises = [];

        // Classement global
        promises.push(
          (async () => {
            try {
              if (city) {
                const { data: zoneData, error: zoneError } = await supabase.rpc('zone_leaderboard', {
                  p_city: city,
                });
                if (!zoneError && zoneData && zoneData.length > 0) {
                  const playerEntry = zoneData.find((e) => e.user_id === me.id);
                  if (playerEntry) {
                    setGlobalRank({
                      rank: Number(playerEntry.rank),
                      total: zoneData.length,
                    });
                    return;
                  }
                }
              }
              
              const { data, error } = await supabase
                .from('leaderboard_view')
                .select('user_id, rank_global')
                .order('rating', { ascending: false });
              
              if (!error && data) {
                const playerEntry = data.find((e) => e.user_id === me.id);
                if (playerEntry && playerEntry.rank_global) {
                  setGlobalRank({
                    rank: Number(playerEntry.rank_global),
                    total: data.length,
                  });
                } else {
                  setGlobalRank(null);
                }
              } else {
                setGlobalRank(null);
              }
            } catch (err) {
              console.error('[Stats] Error fetching global rank:', err);
              setGlobalRank(null);
            }
          })()
        );

        // Classement club
        if (favoriteClubId) {
          promises.push(
            (async () => {
              try {
                const { data, error } = await supabase
                  .from('leaderboard_view')
                  .select('user_id, rank_club')
                  .eq('club_id', favoriteClubId)
                  .order('rating', { ascending: false });
                
                if (!error && data) {
                  const playerEntry = data.find((e) => e.user_id === me.id);
                  if (playerEntry && playerEntry.rank_club) {
                    setClubRank({
                      rank: Number(playerEntry.rank_club),
                      total: data.length,
                    });
                  } else {
                    setClubRank(null);
                  }
                } else {
                  setClubRank(null);
                }
              } catch (err) {
                console.error('[Stats] Error fetching club rank:', err);
                setClubRank(null);
              }
            })()
          );
        } else {
          setClubRank(null);
        }

        // Classement groupe
        if (activeGroup?.id) {
          promises.push(
            (async () => {
              try {
                const { data, error } = await supabase
                  .from('leaderboard_view')
                  .select('user_id, rank_group')
                  .eq('group_id', activeGroup.id)
                  .order('rating', { ascending: false });
                
                if (!error && data) {
                  const playerEntry = data.find((e) => e.user_id === me.id);
                  if (playerEntry && playerEntry.rank_group) {
                    setGroupRank({
                      rank: Number(playerEntry.rank_group),
                      total: data.length,
                    });
                  } else {
                    setGroupRank(null);
                  }
                } else {
                  setGroupRank(null);
                }
              } catch (err) {
                console.error('[Stats] Error fetching group rank:', err);
                setGroupRank(null);
              }
            })()
          );
        } else {
          setGroupRank(null);
        }

        await Promise.all(promises);
      } catch (e) {
        console.error('[Stats] Error fetching ranks:', e);
      } finally {
        setLoadingRanks(false);
      }
    };

    fetchRanks();
  }, [me?.id, city, favoriteClubId, activeGroup?.id]);

  // Avatar, niveau et classement du partenaire principal
  useEffect(() => {
    if (stats?.topPartners && stats.topPartners.length > 0) {
      (async () => {
        try {
          const partnerId = stats.topPartners[0].partnerId;
          
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('avatar_url, niveau')
            .eq('id', partnerId)
            .maybeSingle();
          
          if (!profileError && profileData) {
            setPartnerAvatar(profileData.avatar_url || null);
            setPartnerLevel(profileData.niveau ? Number(profileData.niveau) : null);
          } else {
            setPartnerAvatar(null);
            setPartnerLevel(null);
          }
          
          const { data: rankData, error: rankError } = await supabase
            .from('leaderboard_view')
            .select('rank_global')
            .eq('user_id', partnerId)
            .maybeSingle();
          
          if (!rankError && rankData && rankData.rank_global) {
            setPartnerRank(Number(rankData.rank_global));
          } else {
            setPartnerRank(null);
          }
        } catch (e) {
          console.error('[Stats] Error fetching partner data:', e);
          setPartnerAvatar(null);
          setPartnerLevel(null);
          setPartnerRank(null);
        }
      })();
    } else {
      setPartnerAvatar(null);
      setPartnerLevel(null);
      setPartnerRank(null);
    }
  }, [stats?.topPartners]);

  const xpPct = Math.min(100, Number(stats?.xp) || 0);

  return (
    <ScrollView
      contentContainerStyle={[s.container, { paddingBottom: Math.max(28, insets.bottom + 140) }]}
      scrollIndicatorInsets={{ bottom: Math.max(8, insets.bottom + 70) }}
    >

      {/* Bloc D - Style de jeu */}
      {statsLoading ? null : (statsError || !stats ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="tennisball" size={22} color="#E0FF00" />
            <Text style={s.tileTitle}>STYLE DE JEU</Text>
          </View>
          <View style={[s.tile, s.tileFull, { padding: 16 }]}>
            {(main || stats?.sidePreferred || (stats?.topPartners && stats.topPartners.length > 0)) ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', gap: 8 }}>
                {/* Main préférée */}
                {main && (
                  <>
                    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                      <View style={{ 
                        width: 90, 
                        height: 90, 
                        borderRadius: 45, 
                        borderWidth: 2, 
                        borderColor: '#374151', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        marginBottom: 6,
                        backgroundColor: '#1f2937'
                      }}>
                        <Ionicons 
                          name={main === 'droite' ? 'hand-right' : 'hand-left'} 
                          size={36} 
                          color="#E0FF00" 
                        />
                      </View>
                      <Text style={{ fontSize: 18, color: '#9ca3af' }}>
                        {main === 'droite' ? 'Droite' : main === 'gauche' ? 'Gauche' : main}
                      </Text>
                    </View>
                    
                    {/* Séparateur vertical */}
                    {(stats?.sidePreferred || (stats?.topPartners && stats.topPartners.length > 0)) && (
                      <View style={{ width: 1, backgroundColor: '#1f2937', alignSelf: 'stretch', marginVertical: 8 }} />
                    )}
                  </>
                )}
                
                {/* Côté préféré */}
                {stats?.sidePreferred && (
                  <>
                    <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                      <View style={{ 
                        width: 90, 
                        height: 90, 
                        borderRadius: 45, 
                        borderWidth: 2, 
                        borderColor: '#374151', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        marginBottom: 6,
                        backgroundColor: '#1f2937'
                      }}>
                        <Ionicons 
                          name={stats.sidePreferred === 'left' ? 'arrow-back' : 'arrow-forward'} 
                          size={36} 
                          color="#E0FF00" 
                        />
                      </View>
                      <Text style={{ fontSize: 18, color: '#9ca3af' }}>
                        {stats.sidePreferred === 'left' ? 'Gauche' : stats.sidePreferred === 'right' ? 'Droite' : stats.sidePreferred}
                      </Text>
                    </View>
                    
                    {/* Séparateur vertical */}
                    {stats.topPartners && stats.topPartners.length > 0 && (
                      <View style={{ width: 1, backgroundColor: '#1f2937', alignSelf: 'stretch', marginVertical: 8 }} />
                    )}
                  </>
                )}
                
                {/* Partenaire principal */}
                {stats?.topPartners && stats.topPartners.length > 0 && (
                  <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                    <View style={{ position: 'relative', width: 60, height: 60 }}>
                      {partnerAvatar ? (
                        <Image 
                          source={{ uri: partnerAvatar }} 
                          style={{ 
                            width: 60, 
                            height: 60, 
                            borderRadius: 30, 
                            borderWidth: 2, 
                            borderColor: '#374151',
                          }} 
                        />
                      ) : (
                        <View style={{ 
                          width: 60, 
                          height: 60, 
                          borderRadius: 30, 
                          borderWidth: 2, 
                          borderColor: '#374151', 
                          alignItems: 'center', 
                          justifyContent: 'center',
                          backgroundColor: '#1f2937'
                        }}>
                          <Text style={{ fontSize: 20, fontWeight: '800', color: '#e0ff00' }}>
                            {stats.topPartners[0].partnerName?.charAt(0)?.toUpperCase() || '?'}
                          </Text>
                        </View>
                      )}
                      {/* Badge niveau */}
                      {partnerLevel && (
                        <View
                          style={{
                            position: 'absolute',
                            right: -4,
                            bottom: -4,
                            backgroundColor: colorForLevel(partnerLevel),
                            borderColor: colorForLevel(partnerLevel),
                            borderWidth: 1,
                            borderRadius: 99,
                            minWidth: 24,
                            height: 24,
                            paddingHorizontal: 4,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: '#000000', fontWeight: '900', fontSize: 12, lineHeight: 14 }}>
                            {String(partnerLevel)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 4, marginBottom: 2 }}>
                      Partenaire
                    </Text>
                    {partnerRank && (
                      <Text style={{ fontSize: 11, color: '#E0FF00', textAlign: 'center', fontWeight: '700', marginBottom: 2 }}>
                        #{partnerRank} global
                      </Text>
                    )}
                    <Text style={{ fontSize: 10, color: '#6b7280', textAlign: 'center' }}>
                      {stats.topPartners[0].matchesWith} matchs • {stats.topPartners[0].winRateWith.toFixed(0)}%
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={{ fontSize: 14, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', paddingVertical: 8 }}>
                Aucune information disponible
              </Text>
            )}
          </View>
        </>
      ))}

      {/* Bloc C - Niveau / XP / Classement */}
      {statsLoading || ratingLoading ? null : (statsError || !stats ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="trophy" size={22} color="#E0FF00" />
            <Text style={s.tileTitle}>NIVEAU / XP / CLASSEMENT</Text>
          </View>
          <View style={[s.tile, s.tileFull, { padding: 16 }]}>
            {/* Ligne 1: Niveau + Donut + Rating */}
            <View style={{ position: 'relative', alignItems: 'center', marginBottom: 12 }}>
              {/* Donut centré */}
              <RatingDonut value={xpPct} size={140} thickness={6} color={colorForLevel(stats.level)}>
                <Text style={{ fontSize: 72, fontWeight: '900', color: colorForLevel(stats.level) }}>
                  {stats.level}
                </Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  Niveau
                </Text>
              </RatingDonut>

              {/* XP aligné à droite */}
              <View style={{ position: 'absolute', right: 0, bottom: 0, alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: colorForLevel(stats.level), marginBottom: 4, textAlign: 'right' }}>
                  {xpPct.toFixed(0)}%
                </Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>
                  XP
                </Text>
              </View>
            </View>

            {/* Ligne 2: Rang global */}
            <View style={{ marginTop: 8, alignItems: 'center' }}>
              {(stats.rankGlobal || globalRank?.rank) ? (
                <>
                  <Text style={{ fontSize: 72, fontWeight: '900', color: '#E0FF00', marginBottom: 4 }}>
                    #{globalRank?.rank ?? stats.rankGlobal}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                    Rang global
                  </Text>
                  {globalRank?.total ? (
                    <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      sur {globalRank.total} membres
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                    -
                  </Text>
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    Non classé
                  </Text>
                </>
              )}
            </View>

            {/* Rang club (si disponible) - affiché en dessous */}
            {stats.rankClub && (
              <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#1f2937', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#9ca3af', marginBottom: 4 }}>Rang club</Text>
                <Text style={{ fontSize: 27, fontWeight: '700', color: '#E0FF00' }}>
                  #{stats.rankClub} au club
                </Text>
              </View>
            )}
            
          </View>
        </>
      ))}

      {/* Bloc A - Bilan général */}
      {statsLoading ? null : (statsError || !stats ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="stats-chart" size={22} color="#E0FF00" />
            <Text style={s.tileTitle}>BILAN GÉNÉRAL</Text>
          </View>
          <View style={[s.tile, s.tileFull, { padding: 16 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', gap: 8 }}>
              {/* Matchs joués */}
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ fontSize: 48, fontWeight: '900', color: '#ffffff', marginBottom: 4 }}>
                  {stats.matchesPlayed}
                </Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', textTransform: 'lowercase' }}>
                  {stats.matchesPlayed <= 1 ? 'match' : 'matchs'}
                </Text>
              </View>
              
              {/* Séparateur vertical */}
              <View style={{ width: 1, backgroundColor: '#1f2937', alignSelf: 'stretch', marginVertical: 8 }} />
              
              {/* Victoires */}
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                <Text style={{ fontSize: 48, fontWeight: '900', color: '#10b981', marginBottom: 4 }}>
                  {stats.wins}
                </Text>
                <Text style={{ fontSize: 12, color: '#9ca3af', textTransform: 'lowercase' }}>
                  {stats.wins <= 1 ? 'victoire' : 'victoires'}
                </Text>
              </View>
              
              {/* Séparateur vertical */}
              <View style={{ width: 1, backgroundColor: '#1f2937', alignSelf: 'stretch', marginVertical: 8 }} />
              
              {/* Efficacité */}
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                <View style={{ 
                  width: 80, 
                  height: 80, 
                  borderRadius: 40, 
                  borderWidth: 2, 
                  borderColor: '#374151', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginBottom: 4
                }}>
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#ffffff', textAlign: 'center' }}>
                      {stats.winRate.toFixed(0)}
                    </Text>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: '#ffffff', textAlign: 'center' }}>
                      %
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                  Efficacité
                </Text>
              </View>
            </View>
            
            {/* Sets (si disponibles) */}
            {(stats.setsWon !== null || stats.setsLost !== null) && (
              <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#1f2937', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#9ca3af', marginBottom: 4 }}>Sets</Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#E0FF00' }}>
                  {stats.setsWon ?? 0} / {stats.setsLost ?? 0}
                </Text>
              </View>
            )}
          </View>
        </>
      ))}

      {/* Bloc B - Forme du moment */}
      {statsLoading ? null : (statsError || !stats ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="flame" size={22} color="#E0FF00" />
            <Text style={s.tileTitle}>FORME DU MOMENT</Text>
          </View>
          <View style={[s.tile, s.tileFull, { padding: 16 }]}>
            {historyLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                <ActivityIndicator size="small" color={BRAND} />
                <Text style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
                  Chargement des 5 derniers matchs...
                </Text>
              </View>
            ) : historyError ? (
              <Text style={{ fontSize: 12, color: '#ef4444', textAlign: 'center' }}>
                {historyError}
              </Text>
            ) : historyMatches.length === 0 ? (
              <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>
                Aucun match validé récent dans ce groupe.
              </Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ color: '#e0ff00', fontWeight: '800', fontSize: 16 }}>
                    MES 5 DERNIERS MATCHS
                  </Text>
                  {me?.id && (
                    <Pressable
                      onPress={() => {
                        router.push({
                          pathname: '/stats/history',
                          params: { userId: me.id },
                        });
                      }}
                      style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                    >
                      <Text style={{ fontSize: 12, color: '#e0ff00', fontWeight: '600' }}>
                        Voir tout
                      </Text>
                    </Pressable>
                  )}
                </View>
                {historyMatches.map((match) => {
                  const slot = match.time_slots || {};
                  const matchDate = slot.starts_at ? new Date(slot.starts_at) : (match.created_at ? new Date(match.created_at) : null);

                  const formatHistoryDate = (startDate, endDate) => {
                    if (!startDate || !endDate) return 'Date inconnue';
                    const start = new Date(startDate);
                    const end = new Date(endDate);
                    const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
                    const MO = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
                    const wd = WD[start.getDay()] || '';
                    const dd = String(start.getDate()).padStart(2, '0');
                    const mo = MO[start.getMonth()] || '';
                    const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    return `${wd} ${dd} ${mo} - ${startTime} à ${endTime}`;
                  };

                  const dateTimeStr = slot.starts_at && slot.ends_at
                    ? formatHistoryDate(slot.starts_at, slot.ends_at)
                    : (matchDate ? matchDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Date inconnue');

                  const matchRsvps = match.rsvps || [];
                  const acceptedPlayers = matchRsvps.filter(r => String(r.status || '').toLowerCase() === 'accepted');

                  return (
                    <View
                      key={match.id}
                      style={{
                        backgroundColor: '#1e3a5f',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: '#2d4a6f',
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14, marginBottom: 4 }}>
                            {dateTimeStr}
                          </Text>
                          {match.group?.name && (
                            <Text style={{ color: '#9ca3af', fontWeight: '600', fontSize: 12, marginBottom: 8 }}>
                              {match.group.name}
                            </Text>
                          )}
                          {acceptedPlayers.length > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                              {(() => {
                                if (match.result) {
                                  const team1Players = [
                                    match.result.team1_player1_id,
                                    match.result.team1_player2_id
                                  ].filter(Boolean);
                                  const team2Players = [
                                    match.result.team2_player1_id,
                                    match.result.team2_player2_id
                                  ].filter(Boolean);

                                  const parseSets = (scoreText) => {
                                    if (!scoreText) return [];
                                    const sets = scoreText.split(',').map(s => s.trim());
                                    return sets.map(set => {
                                      const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                                      return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                                    });
                                  };

                                  const sets = parseSets(match.result.score_text);
                                  let team1SetsWon = 0;
                                  let team2SetsWon = 0;

                                  sets.forEach(set => {
                                    if ((set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2) {
                                      team1SetsWon++;
                                    } else if ((set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1) {
                                      team2SetsWon++;
                                    }
                                  });

                                  const actualWinnerTeam = team1SetsWon > team2SetsWon ? 'team1' : (team2SetsWon > team1SetsWon ? 'team2' : null);

                                  const winningTeamPlayers = actualWinnerTeam === 'team1' ? team1Players : team2Players;
                                  const losingTeamPlayers = actualWinnerTeam === 'team1' ? team2Players : team1Players;

                                  return (
                                    <>
                                      {winningTeamPlayers.map((playerId) => {
                                        const p = historyProfilesById[String(playerId)];
                                        if (!p) return null;
                                        return (
                                          <View key={playerId} style={{ borderWidth: 2, borderColor: '#10b981', borderRadius: 24, padding: 2 }}>
                                            <HistoryAvatar
                                              profile={p}
                                              size={40}
                                            />
                                          </View>
                                        );
                                      })}
                                      <Ionicons name="flash" size={20} color="#10b981" style={{ marginHorizontal: 4 }} />
                                      {losingTeamPlayers.map((playerId) => {
                                        const p = historyProfilesById[String(playerId)];
                                        if (!p) return null;
                                        return (
                                          <View key={playerId} style={{ borderWidth: 2, borderColor: '#ef4444', borderRadius: 24, padding: 2 }}>
                                            <HistoryAvatar
                                              profile={p}
                                              size={40}
                                            />
                                          </View>
                                        );
                                      })}
                                    </>
                                  );
                                } else {
                                  return acceptedPlayers.slice(0, 4).map((r) => {
                                    const p = historyProfilesById[String(r.user_id)];
                                    if (!p) return null;
                                    return (
                                      <HistoryAvatar
                                        key={r.user_id}
                                        profile={p}
                                        size={40}
                                      />
                                    );
                                  });
                                }
                              })()}
                            </View>
                          )}
                        </View>
                      </View>

                      {match.result ? (
                        <>
                          <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2d4a6f' }}>
                            {(() => {
                              const parseSets = (scoreText) => {
                                if (!scoreText) return [];
                                const sets = scoreText.split(',').map(s => s.trim());
                                return sets.map(set => {
                                  const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                                  return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                                });
                              };

                              const sets = parseSets(match.result.score_text);
                              while (sets.length < 3) {
                                sets.push({ team1: 0, team2: 0 });
                              }

                              let team1SetsWon = 0;
                              let team2SetsWon = 0;

                              sets.forEach(set => {
                                if ((set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2) {
                                  team1SetsWon++;
                                } else if ((set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1) {
                                  team2SetsWon++;
                                }
                              });

                              const actualWinnerTeam = team1SetsWon > team2SetsWon ? 'team1' : (team2SetsWon > team1SetsWon ? 'team2' : null);
                              
                              // Déterminer si l'utilisateur actuel a gagné
                              const userId = String(me?.id || user?.id || '');
                              const isUserInTeam1 = userId && (
                                String(match.result.team1_player1_id) === userId || 
                                String(match.result.team1_player2_id) === userId
                              );
                              const isUserInTeam2 = userId && (
                                String(match.result.team2_player1_id) === userId || 
                                String(match.result.team2_player2_id) === userId
                              );
                              const isUserWinner = (isUserInTeam1 && actualWinnerTeam === 'team1') || 
                                                   (isUserInTeam2 && actualWinnerTeam === 'team2');
                              const isUserLoser = (isUserInTeam1 && actualWinnerTeam === 'team2') || 
                                                  (isUserInTeam2 && actualWinnerTeam === 'team1');

                              const team1Player1 = formatPlayerName(historyProfilesById?.[String(match.result.team1_player1_id)]?.display_name || 'Joueur 1');
                              const team1Player2 = formatPlayerName(historyProfilesById?.[String(match.result.team1_player2_id)]?.display_name || 'Joueur 2');
                              const team2Player1 = formatPlayerName(historyProfilesById?.[String(match.result.team2_player1_id)]?.display_name || 'Joueur 1');
                              const team2Player2 = formatPlayerName(historyProfilesById?.[String(match.result.team2_player2_id)]?.display_name || 'Joueur 2');

                              const team1Color = actualWinnerTeam === 'team1' ? '#10b981' : '#ef4444';
                              const team2Color = actualWinnerTeam === 'team2' ? '#10b981' : '#ef4444';

                              return (
                                <>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    {isUserWinner ? (
                                      <>
                                        <Ionicons name="trophy" size={20} color="#10b981" style={{ marginRight: 6 }} />
                                        <Text style={{ color: '#10b981', fontWeight: '700', fontSize: 16 }}>
                                          Victoire
                                        </Text>
                                      </>
                                    ) : isUserLoser ? (
                                      <>
                                        <Ionicons name="close-circle" size={20} color="#ef4444" style={{ marginRight: 6 }} />
                                        <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 16 }}>
                                          Défaite
                                        </Text>
                                      </>
                                    ) : (
                                      <>
                                        <Ionicons name="trophy" size={16} color="#e0ff00" style={{ marginRight: 6 }} />
                                        <Text style={{ color: '#e0ff00', fontWeight: '700', fontSize: 12 }}>
                                          Résultat enregistré
                                        </Text>
                                      </>
                                    )}
                                  </View>
                                  <View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                      <Text style={{ color: team1Color, fontWeight: '400', fontSize: 12, flex: 1 }}>
                                        {team1Player1} / {team1Player2}
                                      </Text>
                                      <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {sets.map((set, index) => (
                                          <Text key={index} style={{ color: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '#10b981' : '#ffffff', fontWeight: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '700' : '600', fontSize: 14, minWidth: 16, textAlign: 'right' }}>
                                            {set.team1}
                                          </Text>
                                        ))}
                                      </View>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                      <Text style={{ color: team2Color, fontWeight: '400', fontSize: 12, flex: 1 }}>
                                        {team2Player1} / {team2Player2}
                                      </Text>
                                      <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {sets.map((set, index) => (
                                          <Text key={index} style={{ color: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '#10b981' : '#ffffff', fontWeight: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '700' : '600', fontSize: 14, minWidth: 16, textAlign: 'right' }}>
                                            {set.team2}
                                          </Text>
                                        ))}
                                      </View>
                                    </View>
                                  </View>
                                </>
                              );
                            })()}
                          </View>
                          <Pressable
                            onPress={() => {
                              router.push({
                                pathname: '/matches/record-result',
                                params: { matchId: match.id },
                              });
                            }}
                            style={{
                              marginTop: 12,
                              backgroundColor: '#9ca3af',
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Ionicons name="create-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                              Modifier le score
                            </Text>
                          </Pressable>
                        </>
                      ) : (
                        <Pressable
                          onPress={() => {
                            router.push({
                              pathname: '/matches/record-result',
                              params: { matchId: match.id },
                            });
                          }}
                          style={{
                            marginTop: 8,
                            backgroundColor: '#1a4b97',
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="trophy-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>
                            Enregistrer le score
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        </>
      ))}

      {/* Section Badges */}
      <View style={{ marginBottom: 8, marginTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Ionicons name="medal" size={22} color="#E0FF00" />
          <Text style={s.tileTitle} numberOfLines={1}>
            {badgesLoading ? 'Chargement...' : `MES TROPHEES : ${unlockedCount}/${totalAvailable}`}
          </Text>
        </View>
        {!badgesLoading && me?.id && (
          <Pressable
            onPress={() => router.push(`/profiles/${me.id}/trophies`)}
            style={{ marginTop: 4, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Text style={{ fontSize: 12, color: '#E0FF00', fontWeight: '600' }}>Voir tous</Text>
            <Ionicons name="chevron-forward" size={14} color="#E0FF00" />
          </Pressable>
        )}
      </View>
      <View style={[s.tile, s.tileFull]}>
        {badgesLoading ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={BRAND} />
          </View>
        ) : badgesError ? (
          <Text style={{ fontSize: 12, color: '#ef4444', textAlign: 'center', marginTop: 8 }}>
            Erreur : {badgesError}
          </Text>
        ) : (
          <>
            {/* Badges rares */}
            {featuredRare.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#ff751d', textTransform: 'uppercase', marginBottom: 6 }}>Rares</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {featuredRare.slice(0, 3).map((badge) => (
                    <BadgeIcon key={badge.id} badge={badge} size={120} />
                  ))}
                </View>
              </View>
            )}

            {/* Badges récents */}
            {featuredRecent.length > 0 && (
              <View style={{ marginTop: featuredRare.length > 0 ? 12 : 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#ff751d', textTransform: 'uppercase', marginBottom: 6 }}>Récents</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {featuredRecent.slice(0, 3).map((badge) => (
                    <BadgeIcon key={badge.id} badge={badge} size={120} />
                  ))}
                </View>
              </View>
            )}

            {unlockedCount === 0 && totalAvailable > 0 && (
              <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
                Aucun badge débloqué pour le moment
              </Text>
            )}
            {totalAvailable === 0 && (
              <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 8, fontStyle: 'italic' }}>
                Aucun badge disponible
              </Text>
            )}
          </>
        )}
      </View>

      {/* Section Mes classements */}
      {me?.id && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
            <Ionicons name="stats-chart" size={22} color="#E0FF00" />
            <Text style={s.tileTitle}>MES CLASSEMENTS PADEL SYNC</Text>
          </View>
          <View style={[s.tile, s.tileFull, { padding: 16 }]}>
            {loadingRanks ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={BRAND} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', gap: 8 }}>
                {/* Classement Global */}
                <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                  {globalRank ? (
                    <>
                      <Text style={{ fontSize: 32, fontWeight: '900', color: '#E0FF00', marginBottom: 4 }}>
                        {globalRank.rank}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#9ca3af', textTransform: 'lowercase' }}>
                        Global
                      </Text>
                      <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                        sur {globalRank.total}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                        -
                      </Text>
                      <Text style={{ fontSize: 12, color: '#6b7280' }}>
                        Non disponible
                      </Text>
                    </>
                  )}
                </View>
                
                {/* Séparateur vertical */}
                <View style={{ width: 1, backgroundColor: '#1f2937', alignSelf: 'stretch', marginVertical: 8 }} />
                
                {/* Classement Club favori */}
                <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                  {!club || !club.trim() ? (
                    <>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                        -
                      </Text>
                      <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                        Pas de club
                      </Text>
                    </>
                  ) : clubRank ? (
                    <>
                      <Text style={{ fontSize: 32, fontWeight: '900', color: '#E0FF00', marginBottom: 4 }}>
                        {clubRank.rank}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#9ca3af', textTransform: 'lowercase' }}>
                        Club
                      </Text>
                      <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                        sur {clubRank.total}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                        -
                      </Text>
                      <Text style={{ fontSize: 12, color: '#6b7280' }}>
                        Non classé
                      </Text>
                    </>
                  )}
                </View>
                
                {/* Séparateur vertical */}
                <View style={{ width: 1, backgroundColor: '#1f2937', alignSelf: 'stretch', marginVertical: 8 }} />
                
                {/* Classement Groupe actuel */}
                <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                  {!activeGroup?.id ? (
                    <>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                        -
                      </Text>
                      <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                        Aucun groupe
                      </Text>
                    </>
                  ) : groupRank ? (
                    <>
                      <Text style={{ fontSize: 32, fontWeight: '900', color: '#E0FF00', marginBottom: 4 }}>
                        {groupRank.rank}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#9ca3af', textTransform: 'lowercase' }}>
                        Groupe
                      </Text>
                      <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                        sur {groupRank.total}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: '#6b7280', marginBottom: 4 }}>
                        -
                      </Text>
                      <Text style={{ fontSize: 12, color: '#6b7280' }}>
                        Non classé
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, gap: 12, backgroundColor: "#001831" },
  tile: {
    backgroundColor: "rgba(10, 32, 56, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 26,
    padding: 12,
    minWidth: 0,
    width: '100%',
    marginBottom: 8,
  },
  tileFull: {
    width: '100%',
  },
  tileTitle: {
    fontSize: 18,
    color: "#E0FF00",
    fontWeight: "700",
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});

