import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from "../../context/auth";
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

const LevelAvatar = ({ profile = {}, size = 48 }) => {
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

export default function StatsHistoryScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { userId: paramUserId } = useLocalSearchParams();
  const meId = paramUserId || user?.id;
  const meIdStr = String(meId);

  const [allMatches, setAllMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allMatchesProfiles, setAllMatchesProfiles] = useState({});

  useEffect(() => {
    (async () => {
      if (!meId) {
        setAllMatches([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);

        // APPROCHE IDENTIQUE À stats.js (qui fonctionne bien)
        // 1. Charger les RSVPs de l'utilisateur avec status 'accepted', 'yes', ou 'maybe'
        const { data: userRsvps, error: rsvpsError } = await supabase
          .from('match_rsvps')
          .select('match_id, status')
          .eq('user_id', meId)
          .in('status', ['accepted', 'yes', 'maybe']);

        if (rsvpsError) {
          console.error('[StatsHistory] Error loading user RSVPs:', rsvpsError);
          throw rsvpsError;
        }

        if (!userRsvps || userRsvps.length === 0) {
          setAllMatches([]);
          setAllMatchesProfiles({});
          return;
        }

        const userMatchIds = userRsvps.map(r => r.match_id);

        // 2. Charger les matches correspondants avec status 'confirmed' (SANS filtre de groupe - tous les groupes)
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
          .eq('status', 'confirmed')
          .order('created_at', { ascending: false });

        if (matchesError) {
          console.error('[StatsHistory] Error loading matches:', matchesError);
          throw matchesError;
        }

        if (!allMatchesData || allMatchesData.length === 0) {
          setAllMatches([]);
          setAllMatchesProfiles({});
          return;
        }

        const finalMatchIds = allMatchesData.map(m => m.id);

        // 3. Charger les informations des groupes pour ces matchs
        const groupIds = [...new Set(allMatchesData.map(m => m.group_id).filter(Boolean))];
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
          console.warn('[StatsHistory] Error loading results:', resultsError);
        }

        // 5. Charger TOUS les RSVPs de ces matchs (pour l'affichage)
        const { data: allRsvpsData, error: allRsvpsError } = await supabase
          .from('match_rsvps')
          .select('match_id, user_id, status')
          .in('match_id', finalMatchIds);

        if (allRsvpsError) {
          console.warn('[StatsHistory] Error loading all RSVPs:', allRsvpsError);
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
            .select('id, display_name, name, avatar_url, niveau')
            .in('id', Array.from(allUserIds));

          if (profilesError) throw profilesError;

          profilesMap = (profilesData || []).reduce((acc, p) => {
            acc[String(p.id)] = p;
            return acc;
          }, {});
        }

        // 8. Combiner les données pour le rendu et trier par date
        const matchesWithDetails = allMatchesData.map(match => {
          const slot = match.time_slots || {};
          const sortDate = new Date(
            slot?.ends_at || slot?.starts_at || match.created_at || 0
          ).getTime();
          
          return {
            id: match.id,
            match_id: match.id,
            status: match.status,
            score_text: resultsByMatchId.get(match.id)?.score_text || null,
            winner_team: resultsByMatchId.get(match.id)?.winner_team || null,
            recorded_at: resultsByMatchId.get(match.id)?.recorded_at || null,
            team1_player1_id: resultsByMatchId.get(match.id)?.team1_player1_id || null,
            team1_player2_id: resultsByMatchId.get(match.id)?.team1_player2_id || null,
            team2_player1_id: resultsByMatchId.get(match.id)?.team2_player1_id || null,
            team2_player2_id: resultsByMatchId.get(match.id)?.team2_player2_id || null,
            matches: {
              id: match.id,
              status: match.status,
              time_slots: slot,
            },
            rsvps: rsvpsByMatchId.get(match.id) || [],
            group: groupsMap[match.group_id] || null,
            _sortDate: sortDate,
          };
        }).sort((a, b) => (b._sortDate || 0) - (a._sortDate || 0));

        setAllMatches(matchesWithDetails);
        setAllMatchesProfiles(profilesMap);
      } catch (e) {
        console.error('[StatsHistory] Exception loading all matches:', e);
        setError('Impossible de charger l\'historique complet des matchs');
        setAllMatches([]);
        setAllMatchesProfiles({});
      } finally {
        setLoading(false);
      }
    })();
  }, [meId]);

  const formatShortRange = (sIso, eIso) => {
    if (!sIso || !eIso) return 'Date à définir';
    const s = new Date(sIso);
    const e = new Date(eIso);
    const WD = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const wd = WD[s.getDay()] || '';
    const dd = String(s.getDate()).padStart(2, '0');
    const mo = (s.toLocaleDateString('fr-FR', { month: 'short' }) || '').replace('.', '');
    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    const sh = s.toLocaleTimeString('fr-FR', timeOpts);
    const eh = e.toLocaleTimeString('fr-FR', timeOpts);
    return `${wd} ${dd} ${mo} • ${sh} – ${eh}`;
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
      {/* Titre avec flèche retour */}
      <View style={s.header}>
        <Pressable
          onPress={() => router.push('/(tabs)/stats')}
          style={{ marginRight: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color="#E0FF00" />
        </Pressable>
        <Text style={s.title}>HISTORIQUE COMPLET</Text>
      </View>

      {loading ? (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <ActivityIndicator size="large" color={BRAND} />
          <Text style={{ marginTop: 12, color: '#9ca3af' }}>Chargement de l'historique...</Text>
        </View>
      ) : error ? (
        <Text style={{ fontSize: 14, color: '#ef4444', textAlign: 'center', marginTop: 20 }}>
          {error}
        </Text>
      ) : allMatches.length === 0 ? (
        <Text style={{ fontSize: 14, color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', marginTop: 20 }}>
          Aucun match enregistré pour l'instant.
        </Text>
      ) : (
        <View style={{ marginTop: 16 }}>
          {allMatches.map((mr) => {
            const slot = mr.matches?.time_slots || {};
            const hasSlot = !!(slot?.starts_at && slot?.ends_at);

            const inTeam1 = [mr.team1_player1_id, mr.team1_player2_id].some(id => String(id) === meIdStr);
            const inTeam2 = [mr.team2_player1_id, mr.team2_player2_id].some(id => String(id) === meIdStr);

            const isWinner = (() => {
              if (!inTeam1 && !inTeam2) return null;

              if (mr.score_text) {
                const parseSets = (scoreText) => {
                  if (!scoreText) return [];
                  const sets = scoreText.split(',').map(s => s.trim());
                  return sets.map(set => {
                    const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                    return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                  });
                };

                const sets = parseSets(mr.score_text);
                let team1Sets = 0;
                let team2Sets = 0;

                sets.forEach(set => {
                  if (set.team1 > set.team2) team1Sets++;
                  else if (set.team2 > set.team1) team2Sets++;
                });

                if (team1Sets > team2Sets) {
                  return inTeam1 ? true : (inTeam2 ? false : null);
                } else if (team2Sets > team1Sets) {
                  return inTeam2 ? true : (inTeam1 ? false : null);
                } else {
                  return null;
                }
              }

              if (!mr.winner_team) return null;
              if (mr.winner_team === 'team1' && inTeam1) return true;
              if (mr.winner_team === 'team2' && inTeam2) return true;
              return false;
            })();

            const endIso = slot?.ends_at || slot?.starts_at || null;
            const isPastMatch = (() => {
              if (!endIso) return false;
              const end = new Date(endIso);
              if (!end || isNaN(end.getTime())) return false;
              return end <= new Date();
            })();

            // Construire la liste des joueurs : priorité aux IDs des équipes, sinon utiliser les RSVPs
            const playersForDisplay = [];
            const playerIdsFromTeams = new Set();
            
            // D'abord, ajouter les joueurs depuis les IDs des équipes (si disponibles)
            if (mr.team1_player1_id) {
              playersForDisplay.push(mr.team1_player1_id);
              playerIdsFromTeams.add(String(mr.team1_player1_id));
            }
            if (mr.team1_player2_id) {
              playersForDisplay.push(mr.team1_player2_id);
              playerIdsFromTeams.add(String(mr.team1_player2_id));
            }
            if (mr.team2_player1_id) {
              playersForDisplay.push(mr.team2_player1_id);
              playerIdsFromTeams.add(String(mr.team2_player1_id));
            }
            if (mr.team2_player2_id) {
              playersForDisplay.push(mr.team2_player2_id);
              playerIdsFromTeams.add(String(mr.team2_player2_id));
            }
            
            // Si on n'a pas 4 joueurs, compléter avec les RSVPs (en excluant ceux déjà ajoutés)
            if (playersForDisplay.length < 4 && mr.rsvps && Array.isArray(mr.rsvps)) {
              mr.rsvps.forEach(rsvp => {
                const rsvpUserId = String(rsvp.user_id);
                if (!playerIdsFromTeams.has(rsvpUserId) && playersForDisplay.length < 4) {
                  playersForDisplay.push(rsvp.user_id);
                }
              });
            }

            return (
              <View
                key={mr.id}
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: isPastMatch ? '#181818' : '#020617',
                  borderWidth: 1,
                  borderColor: '#1f2937',
                }}
              >
                {/* Ligne 1 : date / statut */}
                <View style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <Text style={{ fontSize: 12, color: isPastMatch ? '#9ca3af' : '#9ca3af' }}>
                      {hasSlot ? formatShortRange(slot.starts_at, slot.ends_at) : 'Date à définir'}
                    </Text>
                    {isWinner !== null && (
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '700',
                          color: isWinner ? '#34d399' : '#f87171',
                        }}
                      >
                        {isWinner ? 'Victoire' : 'Défaite'}
                      </Text>
                    )}
                  </View>
                  {mr.group?.name && (
                    <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '600' }}>
                      {mr.group.name}
                    </Text>
                  )}
                </View>

                {/* Avatars des joueurs */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  {playersForDisplay.map((playerId) => {
                    const profile = allMatchesProfiles?.[String(playerId)] || { id: playerId };
                    return <LevelAvatar key={String(playerId)} profile={profile} size={48} />;
                  })}
                </View>

                {/* Ligne 2 : score ou bouton pour saisir le score */}
                {mr.score_text ? (
                  <View
                    style={{
                      marginTop: 8,
                      backgroundColor: '#1f2937',
                      paddingVertical: 12,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#374151',
                    }}
                  >
                    {(() => {
                      const parseSets = (scoreText) => {
                        if (!scoreText) return [];
                        const sets = scoreText.split(',').map(s => s.trim());
                        return sets.map(set => {
                          const [a, b] = set.split('-').map(s => parseInt(s.trim(), 10));
                          return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                        });
                      };

                      const parsedSets = parseSets(mr.score_text);
                      while (parsedSets.length < 3) {
                        parsedSets.push({ team1: 0, team2: 0 });
                      }

                      let team1Sets = 0;
                      let team2Sets = 0;
                      parsedSets.forEach(set => {
                        if (set.team1 > set.team2) team1Sets++;
                        else if (set.team2 > set.team1) team2Sets++;
                      });
                      const calculatedWinnerTeam = team1Sets > team2Sets ? 'team1' : (team2Sets > team1Sets ? 'team2' : null);

                      const getProfile = (playerId) => {
                        if (!playerId) return null;
                        const idStr = String(playerId);
                        return allMatchesProfiles?.[idStr] || null;
                      };

                      const team1Player1Profile = getProfile(mr.team1_player1_id);
                      const team1Player2Profile = getProfile(mr.team1_player2_id);
                      const team2Player1Profile = getProfile(mr.team2_player1_id);
                      const team2Player2Profile = getProfile(mr.team2_player2_id);

                      const team1Player1 = formatPlayerName(team1Player1Profile?.display_name || team1Player1Profile?.name || 'Joueur 1');
                      const team1Player2 = formatPlayerName(team1Player2Profile?.display_name || team1Player2Profile?.name || 'Joueur 2');
                      const team2Player1 = formatPlayerName(team2Player1Profile?.display_name || team2Player1Profile?.name || 'Joueur 1');
                      const team2Player2 = formatPlayerName(team2Player2Profile?.display_name || team2Player2Profile?.name || 'Joueur 2');

                      const team1Color = calculatedWinnerTeam === 'team1' ? '#34d399' : '#f87171';
                      const team2Color = calculatedWinnerTeam === 'team2' ? '#34d399' : '#f87171';

                      return (
                        <View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Text
                              style={{
                                color: team1Color,
                                fontWeight: calculatedWinnerTeam === 'team1' ? '600' : '400',
                                fontSize: 14,
                                flex: 1,
                              }}
                            >
                              {team1Player1} / {team1Player2}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                              {parsedSets.map((set, index) => (
                                <Text
                                  key={index}
                                  style={{
                                    color: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '#34d399' : '#e5e7eb',
                                    fontWeight: (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '700' : '600',
                                    fontSize: 16,
                                    minWidth: 20,
                                    textAlign: 'right',
                                  }}
                                >
                                  {set.team1}
                                </Text>
                              ))}
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text
                              style={{
                                color: team2Color,
                                fontWeight: calculatedWinnerTeam === 'team2' ? '600' : '400',
                                fontSize: 14,
                                flex: 1,
                              }}
                            >
                              {team2Player1} / {team2Player2}
                            </Text>
                            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                              {parsedSets.map((set, index) => (
                                <Text
                                  key={index}
                                  style={{
                                    color: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '#34d399' : '#e5e7eb',
                                    fontWeight: (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '700' : '600',
                                    fontSize: 16,
                                    minWidth: 20,
                                    textAlign: 'right',
                                  }}
                                >
                                  {set.team2}
                                </Text>
                              ))}
                            </View>
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                ) : (
                  <View style={{ marginTop: 8 }}>
                    <Pressable
                      onPress={() => {
                        router.push({
                          pathname: '/matches/record-result',
                          params: { matchId: mr.match_id },
                        });
                      }}
                      style={{
                        backgroundColor: '#1a4b97',
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Ionicons name="trophy-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                      <Text
                        style={{
                          color: '#ffffff',
                          fontWeight: '700',
                          fontSize: 13,
                        }}
                      >
                        Enregistrer le résultat
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#001831",
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 30,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#E0FF00',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

