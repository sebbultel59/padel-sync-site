/**
 * Bloc « Forme du moment » : 5 derniers matchs + saisie / modification du score.
 * Réutilisé par Stats et par l’onglet Validés (Matches).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatPlayerName } from '../../../lib/uiSafe';

const BRAND = '#1a4b97';

const LEVELS = [
  { v: 1, label: 'Débutant', color: '#a3e635' },
  { v: 2, label: 'Perfectionnement', color: '#86efac' },
  { v: 3, label: 'Élémentaire', color: '#0e7aff' },
  { v: 4, label: 'Intermédiaire', color: '#0d97ac' },
  { v: 5, label: 'Confirmé', color: '#ff9d00' },
  { v: 6, label: 'Avancé', color: '#f06300' },
  { v: 7, label: 'Expert', color: '#fb7185' },
  { v: 8, label: 'Elite', color: '#a78bfa' },
];
const colorForLevel = (n: number | string | null | undefined) =>
  LEVELS.find((x) => x.v === Number(n))?.color || '#9ca3af';

export type FormeMatch = {
  id: string;
  created_at?: string | null;
  time_slots?: { starts_at?: string | null; ends_at?: string | null } | null;
  group?: { name?: string | null } | null;
  result?: {
    score_text?: string | null;
    team1_player1_id?: string | null;
    team1_player2_id?: string | null;
    team2_player1_id?: string | null;
    team2_player2_id?: string | null;
  } | null;
  rsvps?: Array<{ user_id: string; status?: string | null }>;
};

type Props = {
  historyMatches: FormeMatch[];
  historyProfilesById: Record<string, { display_name?: string; name?: string; email?: string; avatar_url?: string | null; niveau?: number | null }>;
  historyLoading: boolean;
  historyError: string | null;
  meId: string | null;
  /** Masquer le lien « Voir tout » (ex. espace réduit) */
  showVoirTout?: boolean;
  /** Marge au-dessus du titre (Stats utilise souvent 16) */
  marginTop?: number;
  emptyMessage?: string;
};

function HistoryAvatar({
  profile = {},
  size = 40,
}: {
  profile?: { display_name?: string; name?: string; email?: string; avatar_url?: string | null; niveau?: number | null; level?: number | null };
  size?: number;
}) {
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
          <Image source={{ uri }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
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
      {level != null && (
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

export function FormeDuMomentSection({
  historyMatches,
  historyProfilesById,
  historyLoading,
  historyError,
  meId,
  showVoirTout = true,
  marginTop = 16,
  emptyMessage = 'Aucun match validé récent dans ce groupe.',
}: Props) {
  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginBottom: 8,
          marginTop,
        }}
      >
        <Ionicons name="flame" size={22} color="#E0FF00" />
        <Text style={styles.tileTitle}>FORME DU MOMENT</Text>
      </View>
      <View style={[styles.tile, styles.tileFull, { padding: 16 }]}>
        {historyLoading ? (
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <ActivityIndicator size="small" color={BRAND} />
            <Text style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
              Chargement des 5 derniers matchs...
            </Text>
          </View>
        ) : historyError ? (
          <Text style={{ fontSize: 12, color: '#ef4444', textAlign: 'center' }}>{historyError}</Text>
        ) : historyMatches.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>{emptyMessage}</Text>
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#e0ff00', fontWeight: '800', fontSize: 16 }}>MES 5 DERNIERS MATCHS</Text>
              {showVoirTout && meId ? (
                <Pressable
                  onPress={() => {
                    router.push({
                      pathname: '/stats/history',
                      params: { userId: meId },
                    });
                  }}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Text style={{ fontSize: 12, color: '#e0ff00', fontWeight: '600' }}>Voir tout</Text>
                </Pressable>
              ) : null}
            </View>
            {historyMatches.map((match) => {
              const slot = match.time_slots || {};
              const matchDate = slot.starts_at
                ? new Date(slot.starts_at)
                : match.created_at
                  ? new Date(match.created_at)
                  : null;

              const formatHistoryDate = (startDate: string, endDate: string) => {
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

              const dateTimeStr =
                slot.starts_at && slot.ends_at
                  ? formatHistoryDate(String(slot.starts_at), String(slot.ends_at))
                  : matchDate
                    ? matchDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                    : 'Date inconnue';

              const matchRsvps = match.rsvps || [];
              const acceptedPlayers = matchRsvps.filter((r) => String(r.status || '').toLowerCase() === 'accepted');

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
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14, marginBottom: 4 }}>{dateTimeStr}</Text>
                      {match.group?.name ? (
                        <Text style={{ color: '#9ca3af', fontWeight: '600', fontSize: 12, marginBottom: 8 }}>{match.group.name}</Text>
                      ) : null}
                      {acceptedPlayers.length > 0 && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          {(() => {
                            if (match.result) {
                              const team1Players = [match.result.team1_player1_id, match.result.team1_player2_id].filter(Boolean);
                              const team2Players = [match.result.team2_player1_id, match.result.team2_player2_id].filter(Boolean);

                              const parseSets = (scoreText: string | null | undefined) => {
                                if (!scoreText) return [];
                                const sets = scoreText.split(',').map((s) => s.trim());
                                return sets.map((set) => {
                                  const [a, b] = set.split('-').map((s) => parseInt(s.trim(), 10));
                                  return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                                });
                              };

                              const sets = parseSets(match.result.score_text);
                              let team1SetsWon = 0;
                              let team2SetsWon = 0;

                              sets.forEach((set) => {
                                if ((set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2) {
                                  team1SetsWon++;
                                } else if ((set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1) {
                                  team2SetsWon++;
                                }
                              });

                              const actualWinnerTeam =
                                team1SetsWon > team2SetsWon ? 'team1' : team2SetsWon > team1SetsWon ? 'team2' : null;

                              const winningTeamPlayers = actualWinnerTeam === 'team1' ? team1Players : team2Players;
                              const losingTeamPlayers = actualWinnerTeam === 'team1' ? team2Players : team1Players;

                              return (
                                <>
                                  {winningTeamPlayers.map((playerId) => {
                                    const p = historyProfilesById[String(playerId)];
                                    if (!p) return null;
                                    return (
                                      <View key={String(playerId)} style={{ borderWidth: 2, borderColor: '#10b981', borderRadius: 24, padding: 2 }}>
                                        <HistoryAvatar profile={p} size={40} />
                                      </View>
                                    );
                                  })}
                                  <Ionicons name="flash" size={20} color="#10b981" style={{ marginHorizontal: 4 }} />
                                  {losingTeamPlayers.map((playerId) => {
                                    const p = historyProfilesById[String(playerId)];
                                    if (!p) return null;
                                    return (
                                      <View key={String(playerId)} style={{ borderWidth: 2, borderColor: '#ef4444', borderRadius: 24, padding: 2 }}>
                                        <HistoryAvatar profile={p} size={40} />
                                      </View>
                                    );
                                  })}
                                </>
                              );
                            }
                            return acceptedPlayers.slice(0, 4).map((r) => {
                              const p = historyProfilesById[String(r.user_id)];
                              if (!p) return null;
                              return <HistoryAvatar key={r.user_id} profile={p} size={40} />;
                            });
                          })()}
                        </View>
                      )}
                    </View>
                  </View>

                  {match.result ? (
                    <>
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#2d4a6f' }}>
                        {(() => {
                          const parseSets = (scoreText: string | null | undefined) => {
                            if (!scoreText) return [];
                            const sets = scoreText.split(',').map((s) => s.trim());
                            return sets.map((set) => {
                              const [a, b] = set.split('-').map((s) => parseInt(s.trim(), 10));
                              return { team1: isNaN(a) ? 0 : a, team2: isNaN(b) ? 0 : b };
                            });
                          };

                          const sets = parseSets(match.result?.score_text);
                          while (sets.length < 3) {
                            sets.push({ team1: 0, team2: 0 });
                          }

                          let team1SetsWon = 0;
                          let team2SetsWon = 0;

                          sets.forEach((set) => {
                            if ((set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2) {
                              team1SetsWon++;
                            } else if ((set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1) {
                              team2SetsWon++;
                            }
                          });

                          const actualWinnerTeam =
                            team1SetsWon > team2SetsWon ? 'team1' : team2SetsWon > team1SetsWon ? 'team2' : null;

                          const userId = String(meId || '');
                          const isUserInTeam1 =
                            userId &&
                            (String(match.result?.team1_player1_id) === userId ||
                              String(match.result?.team1_player2_id) === userId);
                          const isUserInTeam2 =
                            userId &&
                            (String(match.result?.team2_player1_id) === userId ||
                              String(match.result?.team2_player2_id) === userId);
                          const isUserWinner =
                            (isUserInTeam1 && actualWinnerTeam === 'team1') || (isUserInTeam2 && actualWinnerTeam === 'team2');
                          const isUserLoser =
                            (isUserInTeam1 && actualWinnerTeam === 'team2') || (isUserInTeam2 && actualWinnerTeam === 'team1');

                          const team1Player1 = formatPlayerName(
                            historyProfilesById?.[String(match.result?.team1_player1_id)]?.display_name || 'Joueur 1'
                          );
                          const team1Player2 = formatPlayerName(
                            historyProfilesById?.[String(match.result?.team1_player2_id)]?.display_name || 'Joueur 2'
                          );
                          const team2Player1 = formatPlayerName(
                            historyProfilesById?.[String(match.result?.team2_player1_id)]?.display_name || 'Joueur 1'
                          );
                          const team2Player2 = formatPlayerName(
                            historyProfilesById?.[String(match.result?.team2_player2_id)]?.display_name || 'Joueur 2'
                          );

                          const team1Color = actualWinnerTeam === 'team1' ? '#10b981' : '#ef4444';
                          const team2Color = actualWinnerTeam === 'team2' ? '#10b981' : '#ef4444';

                          return (
                            <>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                {isUserWinner ? (
                                  <>
                                    <Ionicons name="trophy" size={20} color="#10b981" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#10b981', fontWeight: '700', fontSize: 16 }}>Victoire</Text>
                                  </>
                                ) : isUserLoser ? (
                                  <>
                                    <Ionicons name="close-circle" size={20} color="#ef4444" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 16 }}>Défaite</Text>
                                  </>
                                ) : (
                                  <>
                                    <Ionicons name="trophy" size={16} color="#e0ff00" style={{ marginRight: 6 }} />
                                    <Text style={{ color: '#e0ff00', fontWeight: '700', fontSize: 12 }}>Résultat enregistré</Text>
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
                                      <Text
                                        key={index}
                                        style={{
                                          color:
                                            (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '#10b981' : '#ffffff',
                                          fontWeight:
                                            (set.team1 === 6 || set.team1 === 7) && set.team1 > set.team2 ? '700' : '600',
                                          fontSize: 14,
                                          minWidth: 16,
                                          textAlign: 'right',
                                        }}
                                      >
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
                                      <Text
                                        key={index}
                                        style={{
                                          color:
                                            (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '#10b981' : '#ffffff',
                                          fontWeight:
                                            (set.team2 === 6 || set.team2 === 7) && set.team2 > set.team1 ? '700' : '600',
                                          fontSize: 14,
                                          minWidth: 16,
                                          textAlign: 'right',
                                        }}
                                      >
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
                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>Modifier le score</Text>
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
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
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
    color: '#E0FF00',
    fontWeight: '700',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
