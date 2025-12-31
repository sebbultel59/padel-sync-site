// app/profiles/[id].js
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import OnFireLabel from "../../components/OnFireLabel";
import PlayerRankSummary from "../../components/PlayerRankSummary";
import { usePlayerBadges } from "../../hooks/usePlayerBadges";
import { usePlayerRating } from "../../hooks/usePlayerRating";
import { usePlayerStats } from "../../hooks/usePlayerStats";
import { usePlayerWinStreak } from "../../hooks/usePlayerWinStreak";
import { useActiveGroup } from "../../lib/activeGroup";
import { useUserRole } from "../../lib/roles";
import { supabase } from "../../lib/supabase";
import { getBadgeImage } from "../../lib/badgeImages";
import { formatPlayerName } from "../../lib/uiSafe";

const BRAND = "#1a4b97";
const AVATAR = 120;

const LEVELS = [
  { v: 1, label: "Débutant", color: "#a3e635" },
  { v: 2, label: "Perfectionnement", color: "#86efac" },
  { v: 3, label: "Élémentaire", color: "#60a5fa" },
  { v: 4, label: "Intermédiaire", color: "#22d3ee" },
  { v: 5, label: "Confirmé", color: "#fbbf24" },
  { v: 6, label: "Avancé", color: "#f59e0b" },
  { v: 7, label: "Expert", color: "#fb7185" },
  { v: 8, label: "Elite", color: "#a78bfa" },
];
const labelToLevel = new Map(LEVELS.map(x => [x.label.toLowerCase(), x.v]));
const levelMeta = (n) => LEVELS.find((x) => x.v === n) ?? null;
const colorForLevel = (n) => (LEVELS.find(x => x.v === Number(n))?.color) || '#9ca3af';

export default function ProfileScreen() {
  const { id, fromModal, returnTo, matchId } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [p, setP] = useState(null);
  const { level, xp, isLoading: ratingLoading } = usePlayerRating(id);
  const { featuredRare, featuredRecent, unlockedCount, totalAvailable, isLoading: badgesLoading, error: badgesError } = usePlayerBadges(id);
  const { stats, isLoading: statsLoading, isError: statsError } = usePlayerStats(id);
  const { winStreak } = usePlayerWinStreak(id);
  const { clubId } = useUserRole();
  const { activeGroup } = useActiveGroup();
  const [city, setCity] = useState(null);
  
  // Historique des 5 derniers matchs (forme du moment)
  const [historyMatches, setHistoryMatches] = useState([]);
  const [historyProfilesById, setHistoryProfilesById] = useState({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);


  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!id) throw new Error("Profil introuvable");
        const { data, error } = await supabase
          .from("profiles")
          .select("id, email, display_name, name, avatar_url, niveau, main, cote, club, rayon_km, phone, address_home, address_work")
          .eq("id", String(id))
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Profil introuvable");
        if (mounted) setP(data);
      } catch (e) {
        Alert.alert("Erreur", e?.message ?? String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // Charger l'historique des 5 derniers matchs du joueur
  useEffect(() => {
    if (!id) {
      setHistoryMatches([]);
      setHistoryProfilesById({});
      setHistoryLoading(false);
      setHistoryError(null);
      return;
    }
    
    // Réinitialiser l'historique avant de charger le nouveau
    setHistoryMatches([]);
    setHistoryProfilesById({});
    setHistoryError(null);
    
    const loadHistory = async () => {
      setHistoryLoading(true);
      try {
        const playerId = String(id);
        
        // 1. Commencer par trouver TOUS les résultats où le joueur est présent ET qui ont un score_text
        // Utiliser des requêtes séparées pour être plus précis avec les UUIDs
        const { data: results1, error: err1 } = await supabase
          .from('match_results')
          .select('match_id, team1_score, team2_score, winner_team, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, score_text, recorded_at')
          .eq('team1_player1_id', playerId)
          .not('score_text', 'is', null);
        
        const { data: results2, error: err2 } = await supabase
          .from('match_results')
          .select('match_id, team1_score, team2_score, winner_team, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, score_text, recorded_at')
          .eq('team1_player2_id', playerId)
          .not('score_text', 'is', null);
        
        const { data: results3, error: err3 } = await supabase
          .from('match_results')
          .select('match_id, team1_score, team2_score, winner_team, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, score_text, recorded_at')
          .eq('team2_player1_id', playerId)
          .not('score_text', 'is', null);
        
        const { data: results4, error: err4 } = await supabase
          .from('match_results')
          .select('match_id, team1_score, team2_score, winner_team, team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id, score_text, recorded_at')
          .eq('team2_player2_id', playerId)
          .not('score_text', 'is', null);

        if (err1 || err2 || err3 || err4) {
          console.error('[Profile] Error loading results for player:', err1 || err2 || err3 || err4);
          throw err1 || err2 || err3 || err4;
        }

        // Combiner tous les résultats et supprimer les doublons
        const allResults = [
          ...(results1 || []),
          ...(results2 || []),
          ...(results3 || []),
          ...(results4 || []),
        ];
        
        // Supprimer les doublons par match_id (un joueur peut être dans plusieurs positions)
        const uniqueResults = new Map();
        allResults.forEach(result => {
          if (!uniqueResults.has(result.match_id)) {
            uniqueResults.set(result.match_id, result);
          }
        });

        const resultsArray = Array.from(uniqueResults.values());
        const matchIdsWithScores = resultsArray.map(r => r.match_id);
        
        console.log('[Profile] Loading history for player:', playerId, {
          resultsWithScores: resultsArray.length,
          matchIds: matchIdsWithScores.length
        });

        if (matchIdsWithScores.length === 0) {
          setHistoryMatches([]);
          setHistoryProfilesById({});
          return;
        }

        // 2. Charger les détails de ces matchs (seulement ceux avec status='confirmed')
        const { data: matchesData, error: matchesError } = await supabase
          .from('matches')
          .select(`
            id,
            status,
            created_at,
            time_slot_id,
            time_slots (
              id,
              starts_at,
              ends_at
            )
          `)
          .in('id', matchIdsWithScores)
          .eq('status', 'confirmed')
          .order('created_at', { ascending: false })
          .limit(5);

        if (matchesError) throw matchesError;

        if (!matchesData || matchesData.length === 0) {
          setHistoryMatches([]);
          setHistoryProfilesById({});
          return;
        }

        const confirmedMatchIds = matchesData.map(m => m.id);

        // 3. Indexer les résultats par match_id
        const resultsByMatchId = new Map();
        resultsArray.forEach(result => {
          if (confirmedMatchIds.includes(result.match_id)) {
            resultsByMatchId.set(result.match_id, result);
          }
        });

        // 4. Charger les RSVPs de ces matchs
        const { data: allRsvpsData, error: allRsvpsError } = await supabase
          .from('match_rsvps')
          .select('match_id, user_id, status')
          .in('match_id', confirmedMatchIds);

        if (allRsvpsError) throw allRsvpsError;

        const rsvpsByMatchId = new Map();
        (allRsvpsData || []).forEach(rsvp => {
          if (!rsvpsByMatchId.has(rsvp.match_id)) {
            rsvpsByMatchId.set(rsvp.match_id, []);
          }
          rsvpsByMatchId.get(rsvp.match_id).push(rsvp);
        });

        // 5. Charger les profils de tous les joueurs concernés
        const allUserIds = new Set();
        (allRsvpsData || []).forEach(r => {
          if (r.user_id) allUserIds.add(String(r.user_id));
        });
        resultsArray.forEach(res => {
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

        // 6. Construire la liste finale des matchs avec détails
        // Tous ces matchs ont déjà un score (on a filtré au niveau de la requête)
        const matchesWithDetails = matchesData
          .filter(match => {
            const matchResult = resultsByMatchId.get(match.id);
            // Double vérification : le résultat doit exister et avoir un score_text
            return matchResult && matchResult.score_text;
          })
          .map(match => ({
            ...match,
            result: resultsByMatchId.get(match.id) || null,
            rsvps: rsvpsByMatchId.get(match.id) || [],
          }))
          .sort((a, b) => {
            // Trier par date de création décroissante
            const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return dateB - dateA;
          });

        console.log('[Profile] Final matches with scores:', matchesWithDetails.length);
        setHistoryMatches(matchesWithDetails);
        setHistoryProfilesById(profilesMap);
      } catch (e) {
        console.error('[Profile] Error loading history matches for player', id, ':', e);
        setHistoryMatches([]);
        setHistoryProfilesById({});
        setHistoryError(e?.message || 'Erreur lors du chargement des derniers matchs.');
      } finally {
        setHistoryLoading(false);
      }
    };

    loadHistory();
  }, [id]);

  const levelInfo = useMemo(() => {
    const raw = p?.niveau;
    if (!raw) return null;
    const num = Number(raw);
    if (Number.isFinite(num) && num >= 1 && num <= 8) {
      return levelMeta(num);
    }
    const numFromLabel = labelToLevel.get(String(raw).toLowerCase());
    if (numFromLabel) {
      return levelMeta(numFromLabel);
    }
    return { label: String(raw) };
  }, [p?.niveau]);

  if (loading) return <View style={s.center}><ActivityIndicator /></View>;
  if (!p) return <View style={s.center}><Text style={{ color: "#9ca3af" }}>Profil introuvable</Text></View>;

  const title = formatPlayerName(p.display_name || p.name || p.email || "Joueur");
  const initial = (title?.trim?.()[0] ?? "?").toUpperCase();

  return (
    <ScrollView contentContainerStyle={s.container}>
      {/* Header avec bouton retour */}
      <View style={s.header}>
      <Pressable onPress={() => {
        if (fromModal === 'true' && returnTo === 'matches') {
          // Revenir à la page match avec un paramètre pour rouvrir la modale
          const url = matchId 
            ? `/(tabs)/matches?openInviteModal=true&matchId=${matchId}`
            : '/(tabs)/matches?openInviteModal=true';
          router.replace(url);
        } else if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/groupes");
        }
      }} style={s.backBtn}>
        <Text style={s.backTxt}>← Retour</Text>
      </Pressable>
      </View>

      {/* Avatar + Nom */}
      <View style={s.hero}>
        <View style={{ position: 'relative' }}>
        {p.avatar_url ? (
          <Image source={{ uri: p.avatar_url }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.initial}>{initial}</Text>
          </View>
        )}
          {/* Pastille niveau */}
          {level !== null && (
            <View
              style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colorForLevel(level),
                borderWidth: 2,
                borderColor: '#001831',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
              }}
            >
              <Text
                style={{
                  color: '#000000',
                  fontWeight: '900',
                  fontSize: 18,
                }}
              >
                {level}
              </Text>
            </View>
          )}
        </View>
        <View style={s.titleContainer}>
          <Text style={s.title}>{title}</Text>
          {winStreak >= 3 && (
            <OnFireLabel winStreak={winStreak} size="small" />
          )}
        </View>
        <Text style={s.subtitle}>{p.email}</Text>
      </View>

      {/* Résumé visuel */}
      <View style={[s.card, { borderWidth: 0 }]}>
        <View style={s.tiles}>
          <Tile emoji="🏟️" label="Club" value={p.club || "—"} />
          <Tile
            emoji="📞"
            label="Téléphone"
            value={p.phone || "—"}
            onPress={p.phone ? () => Linking.openURL(`tel:${p.phone}`) : null}
          />
        </View>
      </View>

      {/* Style de jeu */}
      {statsLoading ? null : (statsError || !stats ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="tennisball" size={22} color="#e0ff00" />
            <Text style={s.sectionTitle}>STYLE DE JEU</Text>
          </View>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', gap: 8 }}>
            {/* Main préférée */}
            {p.main && (
              <>
                <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                  <Ionicons name="hand-left-outline" size={32} color="#e0ff00" style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#e0ff00', marginBottom: 4 }}>
                    Main
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#9ca3af', textTransform: 'capitalize' }}>
                    {p.main}
                  </Text>
                </View>
                
                {/* Séparateur vertical */}
                <View style={{ width: 1, backgroundColor: '#e0ff00', alignSelf: 'stretch', marginVertical: 8 }} />
              </>
            )}
            
            {/* Côté préféré */}
            {(stats?.sidePreferred || p.cote) && (
              <>
                <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                  <Ionicons name="swap-horizontal-outline" size={32} color="#e0ff00" style={{ marginBottom: 8 }} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#e0ff00', marginBottom: 4 }}>
                    Côté
                  </Text>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: '#9ca3af', textTransform: 'capitalize' }}>
                    {stats?.sidePreferred || p.cote || "—"}
                  </Text>
                </View>
                
                {/* Séparateur vertical si partenaire principal existe */}
                {stats?.topPartners && stats.topPartners.length > 0 && (
                  <View style={{ width: 1, backgroundColor: '#e0ff00', alignSelf: 'stretch', marginVertical: 8 }} />
                )}
              </>
            )}
            
            {/* Partenaire principal */}
            {stats?.topPartners && stats.topPartners.length > 0 && (
              <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
                <Ionicons name="people-outline" size={32} color="#e0ff00" style={{ marginBottom: 8 }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#e0ff00', marginBottom: 4 }}>
                  Partenaire
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#9ca3af', textAlign: 'center' }}>
                  {stats.topPartners[0].displayName || "—"}
                </Text>
                <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  {stats.topPartners[0].matchesWith} matchs
                </Text>
              </View>
            )}
            </View>
          </View>
        </>
      ))}

      {/* Bilan général */}
      {statsLoading ? null : (statsError || !stats ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="stats-chart" size={22} color="#e0ff00" />
            <Text style={s.sectionTitle}>BILAN GÉNÉRAL</Text>
          </View>
          <View style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start', gap: 8 }}>
            {/* Matchs joués */}
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ fontSize: 48, fontWeight: '900', color: '#e0ff00', marginBottom: 4 }}>
                {stats.matchesPlayed}
              </Text>
              <Text style={{ fontSize: 12, color: '#9ca3af', textTransform: 'lowercase' }}>
                {stats.matchesPlayed <= 1 ? 'match' : 'matchs'}
              </Text>
            </View>
            
            {/* Séparateur vertical */}
            <View style={{ width: 1, backgroundColor: '#e0ff00', alignSelf: 'stretch', marginVertical: 8 }} />
            
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
            <View style={{ width: 1, backgroundColor: '#e0ff00', alignSelf: 'stretch', marginVertical: 8 }} />
            
            {/* Efficacité */}
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
              <View style={{ 
                width: 80, 
                height: 80, 
                borderRadius: 40, 
                borderWidth: 2, 
                borderColor: '#e0ff00', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: 4
              }}>
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#e0ff00', textAlign: 'center' }}>
                    {stats.winRate.toFixed(0)}
                  </Text>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#e0ff00', textAlign: 'center' }}>
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
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e0ff00', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: '#9ca3af', marginBottom: 4 }}>Sets</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#e0ff00' }}>
                {stats.setsWon ?? 0} / {stats.setsLost ?? 0}
              </Text>
            </View>
          )}
          </View>
        </>
      ))}

      {/* Forme du moment */}
      {statsLoading ? null : (statsError || !stats ? null : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="flame" size={22} color="#e0ff00" />
            <Text style={s.sectionTitle}>FORME DU MOMENT</Text>
          </View>
          <View style={s.card}>
          {historyLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <ActivityIndicator size="small" color="#e0ff00" />
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
              Aucun match avec score enregistré.
            </Text>
          ) : (
            <>
              <View style={{ marginBottom: 12 }}>
                <Text style={{ color: '#e0ff00', fontWeight: '800', fontSize: 16 }}>
                  5 DERNIERS MATCHS
                </Text>
              </View>
              {historyMatches.map((match, index) => {
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
                      backgroundColor: '#001831',
                      padding: 12,
                      paddingBottom: index < historyMatches.length - 1 ? 12 : 12,
                      marginBottom: index < historyMatches.length - 1 ? 0 : 0,
                      borderBottomWidth: index < historyMatches.length - 1 ? 1 : 0,
                      borderBottomColor: '#e0ff00',
                    }}
                  >
                    <View style={{ marginBottom: 4 }}>
                      <Text style={{ color: '#e0ff00', fontWeight: '700', fontSize: 14 }}>
                        {dateTimeStr}
                      </Text>
                    </View>

                    {match.result && match.result.score_text ? (
                      <>
                        <View>
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

                            // Déterminer si le joueur consulté a gagné ou perdu
                            const playerId = String(id);
                            const isPlayerInTeam1 = (
                              String(match.result.team1_player1_id) === playerId ||
                              String(match.result.team1_player2_id) === playerId
                            );
                            const isPlayerInTeam2 = (
                              String(match.result.team2_player1_id) === playerId ||
                              String(match.result.team2_player2_id) === playerId
                            );
                            
                            const playerWon = (isPlayerInTeam1 && actualWinnerTeam === 'team1') || 
                                             (isPlayerInTeam2 && actualWinnerTeam === 'team2');

                            const team1Player1Profile = historyProfilesById?.[String(match.result.team1_player1_id)];
                            const team1Player2Profile = historyProfilesById?.[String(match.result.team1_player2_id)];
                            const team2Player1Profile = historyProfilesById?.[String(match.result.team2_player1_id)];
                            const team2Player2Profile = historyProfilesById?.[String(match.result.team2_player2_id)];

                            const team1Player1 = formatPlayerName(team1Player1Profile?.display_name || 'Joueur 1');
                            const team1Player1Level = team1Player1Profile?.niveau;
                            const team1Player2 = formatPlayerName(team1Player2Profile?.display_name || 'Joueur 2');
                            const team1Player2Level = team1Player2Profile?.niveau;
                            const team2Player1 = formatPlayerName(team2Player1Profile?.display_name || 'Joueur 1');
                            const team2Player1Level = team2Player1Profile?.niveau;
                            const team2Player2 = formatPlayerName(team2Player2Profile?.display_name || 'Joueur 2');
                            const team2Player2Level = team2Player2Profile?.niveau;

                            const team1Color = actualWinnerTeam === 'team1' ? '#10b981' : '#ef4444';
                            const team2Color = actualWinnerTeam === 'team2' ? '#10b981' : '#ef4444';

                            return (
                              <>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                  {playerWon ? (
                                    <>
                                      <Ionicons name="checkmark-circle" size={20} color="#10b981" style={{ marginRight: 6 }} />
                                      <Text style={{ color: '#10b981', fontWeight: '700', fontSize: 16 }}>
                                        Victoire
                                      </Text>
                                    </>
                                  ) : (
                                    <>
                                      <Ionicons name="close-circle" size={20} color="#ef4444" style={{ marginRight: 6 }} />
                                      <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 16 }}>
                                        Défaite
                                      </Text>
                                    </>
                                  )}
                                </View>
                                <View>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                                      <Text style={{ color: team1Color, fontWeight: '400', fontSize: 12 }}>
                                        {team1Player1}
                                        {team1Player1Level != null && team1Player1Level !== '' && (
                                          <Text style={{ color: colorForLevel(team1Player1Level) }}>
                                            {' '}{team1Player1Level}
                                          </Text>
                                        )}
                                      </Text>
                                      <Text style={{ color: team1Color, fontWeight: '400', fontSize: 12 }}> / </Text>
                                      <Text style={{ color: team1Color, fontWeight: '400', fontSize: 12 }}>
                                        {team1Player2}
                                        {team1Player2Level != null && team1Player2Level !== '' && (
                                          <Text style={{ color: colorForLevel(team1Player2Level) }}>
                                            {' '}{team1Player2Level}
                                          </Text>
                                        )}
                                      </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                      {sets.map((set, index) => {
                                        const isWinningScore = (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2;
                                        const isLosingScore = set.team1 < set.team2;
                                        const scoreColor = isLosingScore ? '#9ca3af' : (isWinningScore ? '#10b981' : '#e0ff00');
                                        return (
                                          <Text key={index} style={{ color: scoreColor, fontWeight: isWinningScore ? '700' : '600', fontSize: 14, minWidth: 16, textAlign: 'right' }}>
                                            {set.team1}
                                          </Text>
                                        );
                                      })}
                                    </View>
                                  </View>
                                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                                      <Text style={{ color: team2Color, fontWeight: '400', fontSize: 12 }}>
                                        {team2Player1}
                                        {team2Player1Level != null && team2Player1Level !== '' && (
                                          <Text style={{ color: colorForLevel(team2Player1Level) }}>
                                            {' '}{team2Player1Level}
                                          </Text>
                                        )}
                                      </Text>
                                      <Text style={{ color: team2Color, fontWeight: '400', fontSize: 12 }}> / </Text>
                                      <Text style={{ color: team2Color, fontWeight: '400', fontSize: 12 }}>
                                        {team2Player2}
                                        {team2Player2Level != null && team2Player2Level !== '' && (
                                          <Text style={{ color: colorForLevel(team2Player2Level) }}>
                                            {' '}{team2Player2Level}
                                          </Text>
                                        )}
                                      </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                      {sets.map((set, index) => {
                                        const isWinningScore = (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1;
                                        const isLosingScore = set.team2 < set.team1;
                                        const scoreColor = isLosingScore ? '#9ca3af' : (isWinningScore ? '#10b981' : '#e0ff00');
                                        return (
                                          <Text key={index} style={{ color: scoreColor, fontWeight: isWinningScore ? '700' : '600', fontSize: 14, minWidth: 16, textAlign: 'right' }}>
                                            {set.team2}
                                          </Text>
                                        );
                                      })}
                                    </View>
                                  </View>
                                </View>
                              </>
                            );
                          })()}
                        </View>
                      </>
                    ) : null}
                  </View>
                );
              })}
            </>
          )}
          </View>
        </>
      ))}

      {/* Niveau XP classement */}
      {!ratingLoading && level !== null && xp !== null && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <Ionicons name="trophy" size={22} color="#e0ff00" />
            <Text style={s.sectionTitle}>NIVEAU XP CLASSEMENT</Text>
          </View>
          <View style={s.card}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ fontSize: 48, fontWeight: '900', color: colorForLevel(level), marginBottom: 4 }}>
              {level}
            </Text>
            <View style={{ width: '100%', marginVertical: 8 }}>
            <View style={s.xpBarBackground}>
              <View style={[s.xpBarFill, { width: `${xp}%` }]} />
            </View>
          </View>
          {level < 8 && (
              <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                {xp.toFixed(1)}% vers le niveau {level + 1}
              </Text>
          )}
          {level === 8 && (
              <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
                Niveau maximum atteint ! 🏆
              </Text>
          )}
        </View>
          </View>
        </>
      )}

      {/* Section Badges */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="trophy" size={22} color="#e0ff00" />
        <Text style={s.sectionTitle}>TROPHEES</Text>
      </View>
      <View style={s.badgesCard}>
        {badgesLoading ? (
          <Text style={s.badgesTitle}>Chargement des trophées...</Text>
        ) : badgesError ? (
          <>
            <Text style={[s.badgesTitle, { color: '#ef4444', marginBottom: 8 }]}>Erreur : {badgesError}</Text>
            <Text style={s.noBadgesText}>ID utilisateur: {id}</Text>
          </>
        ) : (
          <>
            <View style={s.badgesHeader}>
              <Text style={s.badgesTitle}>Trophées : {unlockedCount}/{totalAvailable}</Text>
              <Pressable
                onPress={() => router.push(`/profiles/${id}/trophies`)}
                style={s.viewAllButton}
              >
                <Text style={s.viewAllText}>Voir tous</Text>
                <Ionicons name="chevron-forward" size={16} color="#e0ff00" />
              </Pressable>
            </View>

          {/* Badges rares */}
          {featuredRare.length > 0 && (
            <View style={s.badgesRow}>
              <Text style={s.badgesRowLabel}>Rares</Text>
              <View style={s.badgesList}>
                {featuredRare.slice(0, 3).map((badge) => (
                  <BadgeIcon key={badge.id} badge={badge} size={144} />
                ))}
              </View>
            </View>
          )}

          {/* Badges récents */}
          {featuredRecent.length > 0 && (
            <View style={s.badgesRow}>
              <Text style={s.badgesRowLabel}>Récents</Text>
              <View style={s.badgesList}>
                {featuredRecent.slice(0, 3).map((badge) => (
                  <BadgeIcon key={badge.id} badge={badge} size={144} />
                ))}
              </View>
            </View>
          )}

            {unlockedCount === 0 && totalAvailable > 0 && (
              <Text style={s.noBadgesText}>Aucun badge débloqué pour le moment</Text>
            )}
            {totalAvailable === 0 && (
              <Text style={s.noBadgesText}>Aucun badge disponible</Text>
            )}
          </>
        )}
      </View>

      {/* Mes classements */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="trophy" size={22} color="#e0ff00" />
        <Text style={s.sectionTitle}>CLASSEMENTS</Text>
      </View>
      <View style={s.card}>
        <PlayerRankSummary
          playerId={id}
          clubId={clubId}
          groupId={activeGroup?.id}
          city={city}
          showGlobal={true}
          showClub={!!clubId}
          showGroup={!!activeGroup?.id}
        />
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function formatRayon(v) {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n === 99) return "+30 km";
  return `${n} km`;
}

function Tile({ emoji, label, value, hint, onPress }) {
  const content = (
    <>
      <Text style={s.tileEmoji}>{emoji}</Text>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{hint ? `${label} · ${hint}` : label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [s.tile, pressed && { opacity: 0.7 }]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={s.tile}>{content}</View>;
}

// Avatar utilisé pour l'historique des matchs (forme du moment)
function HistoryAvatar({ profile = {}, size = 40 }) {
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
}

function BadgeIcon({ badge, size = 120 }) {
  const badgeImage = getBadgeImage(badge.code, badge.unlocked);
  const opacity = badge.unlocked ? 1 : 0.4;

  // Fallback vers icône si pas d'image
  const getBadgeIcon = (category) => {
    switch (category) {
      case 'volume': return 'trophy';
      case 'performance': return 'flame';
      case 'social': return 'people';
      case 'club': return 'business';
      case 'bar': return 'wine';
      default: return 'star';
    }
  };

  const getBadgeColor = (category) => {
    switch (category) {
      case 'volume': return '#fbbf24';
      case 'performance': return '#ef4444';
      case 'social': return '#3b82f6';
      case 'club': return '#8b5cf6';
      case 'bar': return '#ec4899';
      default: return '#6b7280';
    }
  };

  const iconName = getBadgeIcon(badge.category);
  const iconColor = badge.unlocked ? getBadgeColor(badge.category) : '#d1d5db';

  return (
    <View style={[s.badgeIconContainer, { opacity, overflow: 'hidden' }]}>
      {badgeImage ? (
        <Image 
          source={badgeImage}
          style={{ 
            width: size * 0.9, 
            height: size * 0.9,
            resizeMode: 'contain'
          }}
        />
      ) : (
        <Ionicons name={iconName} size={size} color={iconColor} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12, backgroundColor: "#001831" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 35,
    marginBottom: 16,
    gap: 12,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#001831",
    borderWidth: 1,
    borderColor: "#e0ff00",
  },
  backTxt: { color: "#e0ff00", fontWeight: "700" },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#e0ff00", flex: 1 },

  hero: { alignItems: "center", gap: 8, marginBottom: 4 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: "#001831" },
  avatarFallback: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: "#001831", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#e0ff00" },
  initial: { fontSize: 48, fontWeight: "800", color: "#e0ff00" },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#e0ff00", textAlign: "center" },
  subtitle: { fontSize: 13, color: "#9ca3af", textAlign: "center" },

  levelCard: {
    backgroundColor: "#001831",
    borderWidth: 1,
    borderColor: "#e0ff00",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  levelTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#e0ff00",
    textAlign: "center",
  },
  xpBarContainer: {
    width: "100%",
    marginVertical: 8,
  },
  xpBarBackground: {
    width: "100%",
    height: 24,
    backgroundColor: "#001831",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e0ff00",
  },
  xpBarFill: {
    height: "100%",
    backgroundColor: "#e0ff00",
    borderRadius: 12,
  },
  xpText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
  },
  badgesCard: {
    backgroundColor: "#001831",
    borderWidth: 1,
    borderColor: "#e0ff00",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 16,
  },
  badgesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgesTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#e0ff00",
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#e0ff00",
  },
  badgesRow: {
    gap: 8,
  },
  badgesRowLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  badgesList: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  badgeIconContainer: {
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: 'transparent',
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    position: "relative",
  },
  rareBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#001831",
    borderRadius: 10,
    padding: 2,
    borderWidth: 1,
    borderColor: "#e0ff00",
  },
  noBadgesText: {
    fontSize: 13,
    color: "#9ca3af",
    textAlign: "center",
    fontStyle: "italic",
    paddingVertical: 8,
  },
  card: { backgroundColor: "#001831", borderWidth: 1, borderColor: "#e0ff00", borderRadius: 12, padding: 12, gap: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#e0ff00", textTransform: "uppercase" },

  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  tile: { width: "47%", borderWidth: 0, borderRadius: 12, paddingVertical: 14, alignItems: "center", gap: 6, backgroundColor: "#001831" },
  tileEmoji: { fontSize: 28 },
  tileValue: { fontSize: 18, fontWeight: "800", color: "#e0ff00" },
  tileLabel: { fontSize: 12, color: "#9ca3af", textAlign: "center" },
});