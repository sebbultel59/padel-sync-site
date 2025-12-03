// app/matches/record-result.tsx
// Écran de saisie du résultat d'un match

import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SUPABASE_URL } from '../../config/env';
import { supabase } from '../../lib/supabase';

const BRAND = '#1a4b97';

type MatchType = 'ranked' | 'friendly' | 'tournament';
type ResultType = 'normal' | 'wo' | 'retire' | 'interrupted';

interface Player {
  id: string;
  display_name: string;
  name?: string;
}

const MATCH_TYPES: { value: MatchType; label: string }[] = [
  { value: 'ranked', label: 'Classé' },
  { value: 'friendly', label: 'Amical' },
  { value: 'tournament', label: 'Tournoi' },
];

const RESULT_TYPES: { value: ResultType; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'wo', label: 'WO (Walk Over)' },
  { value: 'retire', label: 'Abandon' },
  { value: 'interrupted', label: 'Interrompu' },
];

export default function MatchResultFormScreen() {
  const params = useLocalSearchParams();
  const matchId = params.matchId as string;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [players, setPlayers] = useState<Player[]>([]);
  const [winningTeamPlayers, setWinningTeamPlayers] = useState<string[]>([]);
  const [losingTeamPlayers, setLosingTeamPlayers] = useState<string[]>([]);
  const [showWinningTeamPicker, setShowWinningTeamPicker] = useState(false);
  const [showLosingTeamPicker, setShowLosingTeamPicker] = useState(false);
  const [set1Winner, setSet1Winner] = useState('');
  const [set1Loser, setSet1Loser] = useState('');
  const [set2Winner, setSet2Winner] = useState('');
  const [set2Loser, setSet2Loser] = useState('');
  const [set3Winner, setSet3Winner] = useState('');
  const [set3Loser, setSet3Loser] = useState('');
  const [matchType, setMatchType] = useState<MatchType>('ranked');
  const [resultType, setResultType] = useState<ResultType>('normal');
  const [showMatchTypePicker, setShowMatchTypePicker] = useState(false);
  const [showResultTypePicker, setShowResultTypePicker] = useState(false);

  useEffect(() => {
    if (!matchId) {
      Alert.alert('Erreur', 'ID de match manquant');
      router.back();
      return;
    }
    loadMatchPlayers();
  }, [matchId]);

  const loadMatchPlayers = async () => {
    try {
      setLoadingPlayers(true);
      // Récupérer les RSVPs acceptés du match
      const { data: rsvps, error: rsvpsError } = await supabase
        .from('match_rsvps')
        .select('user_id')
        .eq('match_id', matchId)
        .in('status', ['accepted', 'yes'])
        .order('created_at', { ascending: true });

      if (rsvpsError) throw rsvpsError;

      if (!rsvps || rsvps.length !== 4) {
        Alert.alert('Erreur', 'Le match doit avoir exactement 4 joueurs confirmés');
        router.back();
        return;
      }

      // Récupérer les profils des joueurs
      const playerIds = rsvps.map(r => r.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, name')
        .in('id', playerIds);

      if (profilesError) throw profilesError;

      const playersList: Player[] = (profiles || []).map(p => ({
        id: p.id,
        display_name: p.display_name || p.name || 'Joueur',
        name: p.name,
      }));

      setPlayers(playersList);
    } catch (error: any) {
      console.error('[MatchResultForm] Error loading players:', error);
      Alert.alert('Erreur', 'Impossible de charger les joueurs du match');
      router.back();
    } finally {
      setLoadingPlayers(false);
    }
  };

  const formatScore = (): string => {
    const sets: string[] = [];
    if (set1Winner && set1Loser) {
      sets.push(`${set1Winner}-${set1Loser}`);
    }
    if (set2Winner && set2Loser) {
      sets.push(`${set2Winner}-${set2Loser}`);
    }
    if (set3Winner && set3Loser) {
      sets.push(`${set3Winner}-${set3Loser}`);
    }
    return sets.join(', ');
  };

  const getAvailablePlayersForLosingTeam = (): Player[] => {
    return players.filter(p => !winningTeamPlayers.includes(p.id));
  };

  const getPlayerName = (playerId: string): string => {
    const player = players.find(p => p.id === playerId);
    return player?.display_name || 'Joueur';
  };

  const handleSubmit = async () => {
    if (winningTeamPlayers.length !== 2) {
      Alert.alert('Erreur', 'Veuillez sélectionner 2 joueurs pour l\'équipe gagnante');
      return;
    }

    if (losingTeamPlayers.length !== 2) {
      Alert.alert('Erreur', 'Veuillez sélectionner 2 joueurs pour l\'équipe perdante');
      return;
    }

    const scoreText = formatScore();
    if (!scoreText) {
      Alert.alert('Erreur', 'Veuillez saisir au moins un set');
      return;
    }

    setLoading(true);
    try {
      // Déterminer quelle équipe est gagnante (A ou B) basé sur les joueurs sélectionnés
      // L'équipe gagnante sera team1, l'équipe perdante sera team2
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      const isCurrentUserInWinningTeam = winningTeamPlayers.includes(currentUserId || '');

      const requestBody = {
        match_id: matchId,
        score_text: scoreText,
        winner_team: 'A', // L'équipe gagnante sera toujours team1
        result_type: resultType,
        match_type: matchType,
        team_a_player1_id: winningTeamPlayers[0],
        team_a_player2_id: winningTeamPlayers[1],
        team_b_player1_id: losingTeamPlayers[0],
        team_b_player2_id: losingTeamPlayers[1],
      };

      console.log('[MatchResultForm] Calling Edge Function with:', requestBody);

      try {
        // Utiliser fetch directement pour avoir plus de contrôle sur la réponse d'erreur
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;

        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/record-match-result`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(requestBody),
          }
        );

        const responseData = await response.json();

        if (!response.ok) {
          // Extraire le message d'erreur depuis la réponse
          console.error('[MatchResultForm] Error response:', {
            status: response.status,
            statusText: response.statusText,
            data: responseData,
          });
          
          const errorMessage = responseData?.error || responseData?.message || `Erreur ${response.status}`;
          let errorDetails = '';
          
          if (responseData?.details) {
            errorDetails = typeof responseData.details === 'string' 
              ? responseData.details 
              : JSON.stringify(responseData.details);
          }
          
          let finalErrorMessage = `[Erreur ${response.status}]\n${errorMessage}`;
          if (errorDetails) {
            finalErrorMessage += `\n\nDétails: ${errorDetails}`;
          }
          
          // Si c'est une erreur 500, suggérer de vérifier les logs
          if (response.status === 500) {
            finalErrorMessage += '\n\n💡 Conseil: Vérifiez les logs de l\'Edge Function dans le Dashboard Supabase pour plus de détails.';
          }
          
          throw new Error(finalErrorMessage);
        }

        const data = responseData;

        // Si pas d'erreur, continuer avec les données
        if (!data) {
          throw new Error('Aucune donnée retournée par le serveur');
        }

        console.log('[MatchResultForm] Success! Data received:', data);

        // Naviguer vers l'écran de résumé avec les données
        router.push({
          pathname: '/matches/result-summary',
          params: {
            old_rating: data?.current_player?.old_rating?.toString() || '',
            new_rating: data?.current_player?.new_rating?.toString() || '',
            delta_rating: data?.current_player?.delta_rating?.toString() || '',
            level: data?.current_player?.level?.toString() || '',
            xp: data?.current_player?.xp?.toString() || '',
            won: isCurrentUserInWinningTeam ? 'true' : 'false',
          },
        });
      } catch (invokeError: any) {
        // Cette erreur vient de l'appel supabase.functions.invoke
        throw invokeError;
      }
    } catch (error: any) {
      console.error('[MatchResultForm] Error caught:', error);
      console.error('[MatchResultForm] Error type:', typeof error);
      console.error('[MatchResultForm] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      console.error('[MatchResultForm] Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
        response: error?.response,
        data: error?.data,
        context: error?.context,
        status: error?.status,
        toString: error?.toString?.(),
        cause: error?.cause,
      });
      
      let errorMessage = 'Impossible d\'enregistrer le résultat';
      
      // Essayer différentes façons d'extraire le message
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.data) {
        if (typeof error.data === 'string') {
          try {
            const parsed = JSON.parse(error.data);
            errorMessage = parsed.error || parsed.message || error.data;
            if (parsed.details) {
              errorMessage += `\n\nDétails: ${typeof parsed.details === 'string' ? parsed.details : JSON.stringify(parsed.details)}`;
            }
          } catch {
            errorMessage = error.data;
          }
        } else if (error.data.error) {
          errorMessage = error.data.error;
          if (error.data.details) {
            errorMessage += `\n\nDétails: ${typeof error.data.details === 'string' ? error.data.details : JSON.stringify(error.data.details)}`;
          }
        } else if (error.data.message) {
          errorMessage = error.data.message;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error?.toString) {
        errorMessage = error.toString();
      }
      
      // Si on a un statut HTTP, l'ajouter au message
      if (error?.status || error?.context?.status) {
        const status = error.status || error.context?.status;
        errorMessage = `[Erreur ${status}]\n${errorMessage}`;
      }
      
      // Si l'erreur indique que la fonction n'existe pas
      if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('Function not found')) {
        errorMessage = 'La fonction Edge Function n\'est pas déployée. Veuillez la déployer depuis le Dashboard Supabase.';
      }
      
      console.error('[MatchResultForm] Final error message:', errorMessage);
      Alert.alert('Erreur', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const matchTypeLabel = MATCH_TYPES.find(t => t.value === matchType)?.label || 'Classé';
  const resultTypeLabel = RESULT_TYPES.find(t => t.value === resultType)?.label || 'Normal';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: Math.max(insets.bottom + 20, 100) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Retour</Text>
          </Pressable>
          <Text style={styles.title}>Résultat du match</Text>
        </View>

        {loadingPlayers ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={BRAND} />
            <Text style={styles.loadingText}>Chargement des joueurs...</Text>
          </View>
        ) : (
          <>
            {/* Équipe gagnante */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Équipe gagnante (2 joueurs)</Text>
              <Pressable
                onPress={() => setShowWinningTeamPicker(true)}
                style={styles.pickerButton}
              >
                <Text style={styles.pickerButtonText}>
                  {winningTeamPlayers.length === 0
                    ? 'Sélectionner 2 joueurs'
                    : winningTeamPlayers.length === 1
                    ? `1 joueur: ${getPlayerName(winningTeamPlayers[0])}`
                    : `${getPlayerName(winningTeamPlayers[0])} & ${getPlayerName(winningTeamPlayers[1])}`}
                </Text>
                <Text style={styles.pickerChevron}>▼</Text>
              </Pressable>
              {winningTeamPlayers.length > 0 && (
                <Text style={styles.hintText}>
                  {winningTeamPlayers.length === 1 ? 'Sélectionnez 1 joueur supplémentaire' : '✓ Équipe gagnante complète'}
                </Text>
              )}
            </View>

            {/* Équipe perdante */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Équipe perdante (2 joueurs)</Text>
              <Pressable
                onPress={() => {
                  if (winningTeamPlayers.length !== 2) {
                    Alert.alert('Information', 'Veuillez d\'abord sélectionner l\'équipe gagnante');
                    return;
                  }
                  setShowLosingTeamPicker(true);
                }}
                style={[
                  styles.pickerButton,
                  winningTeamPlayers.length !== 2 && styles.pickerButtonDisabled,
                ]}
                disabled={winningTeamPlayers.length !== 2}
              >
                <Text
                  style={[
                    styles.pickerButtonText,
                    winningTeamPlayers.length !== 2 && styles.pickerButtonTextDisabled,
                  ]}
                >
                  {losingTeamPlayers.length === 0
                    ? 'Sélectionner 2 joueurs'
                    : losingTeamPlayers.length === 1
                    ? `1 joueur: ${getPlayerName(losingTeamPlayers[0])}`
                    : `${getPlayerName(losingTeamPlayers[0])} & ${getPlayerName(losingTeamPlayers[1])}`}
                </Text>
                <Text style={styles.pickerChevron}>▼</Text>
              </Pressable>
              {losingTeamPlayers.length > 0 && (
                <Text style={styles.hintText}>
                  {losingTeamPlayers.length === 1 ? 'Sélectionnez 1 joueur supplémentaire' : '✓ Équipe perdante complète'}
                </Text>
              )}
            </View>
          </>
        )}

        {/* Score par set */}
        {!loadingPlayers && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Score par set</Text>
            <Text style={styles.scoreHint}>
              Score de l'équipe gagnante - Score de l'équipe perdante
            </Text>
            <View style={styles.setsContainer}>
              {/* Set 1 */}
              <View style={styles.setRow}>
                <Text style={styles.setLabel}>Set 1</Text>
                <View style={styles.scoreInputs}>
                  <TextInput
                    style={styles.scoreInput}
                    placeholder="0"
                    value={set1Winner}
                    onChangeText={setSet1Winner}
                    keyboardType="numeric"
                    maxLength={2}
                    editable={true}
                    selectTextOnFocus={false}
                    returnKeyType="next"
                  />
                  <Text style={styles.scoreSeparator}>-</Text>
                  <TextInput
                    style={styles.scoreInput}
                    placeholder="0"
                    value={set1Loser}
                    onChangeText={setSet1Loser}
                    keyboardType="numeric"
                    maxLength={2}
                    editable={true}
                    selectTextOnFocus={false}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Set 2 */}
              <View style={styles.setRow}>
                <Text style={styles.setLabel}>Set 2</Text>
                <View style={styles.scoreInputs}>
                  <TextInput
                    style={styles.scoreInput}
                    placeholder="0"
                    value={set2Winner}
                    onChangeText={setSet2Winner}
                    keyboardType="numeric"
                    maxLength={2}
                    editable={true}
                    selectTextOnFocus={false}
                    returnKeyType="next"
                  />
                  <Text style={styles.scoreSeparator}>-</Text>
                  <TextInput
                    style={styles.scoreInput}
                    placeholder="0"
                    value={set2Loser}
                    onChangeText={setSet2Loser}
                    keyboardType="numeric"
                    maxLength={2}
                    editable={true}
                    selectTextOnFocus={false}
                    returnKeyType="next"
                  />
                </View>
              </View>

              {/* Set 3 */}
              <View style={styles.setRow}>
                <Text style={styles.setLabel}>Set 3 (optionnel)</Text>
                <View style={styles.scoreInputs}>
                  <TextInput
                    style={styles.scoreInput}
                    placeholder="0"
                    value={set3Winner}
                    onChangeText={setSet3Winner}
                    keyboardType="numeric"
                    maxLength={2}
                    editable={true}
                    selectTextOnFocus={false}
                    returnKeyType="done"
                  />
                  <Text style={styles.scoreSeparator}>-</Text>
                  <TextInput
                    style={styles.scoreInput}
                    placeholder="0"
                    value={set3Loser}
                    onChangeText={setSet3Loser}
                    keyboardType="numeric"
                    maxLength={2}
                    editable={true}
                    selectTextOnFocus={false}
                    returnKeyType="done"
                  />
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Type de match */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type de match</Text>
          <Pressable
            onPress={() => setShowMatchTypePicker(true)}
            style={styles.pickerButton}
          >
            <Text style={styles.pickerButtonText}>{matchTypeLabel}</Text>
            <Text style={styles.pickerChevron}>▼</Text>
          </Pressable>
        </View>

        {/* Type de résultat */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Type de résultat</Text>
          <Pressable
            onPress={() => setShowResultTypePicker(true)}
            style={styles.pickerButton}
          >
            <Text style={styles.pickerButtonText}>{resultTypeLabel}</Text>
            <Text style={styles.pickerChevron}>▼</Text>
          </Pressable>
        </View>

        {/* Bouton de validation */}
        {!loadingPlayers && (
          <Pressable
            onPress={handleSubmit}
            disabled={loading || winningTeamPlayers.length !== 2 || losingTeamPlayers.length !== 2}
            style={[
              styles.submitButton,
              (loading || winningTeamPlayers.length !== 2 || losingTeamPlayers.length !== 2) && styles.submitButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Enregistrer le résultat</Text>
            )}
          </Pressable>
        )}

        {/* Picker modals */}
        {/* Modal pour sélectionner l'équipe gagnante */}
        {showWinningTeamPicker && (
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowWinningTeamPicker(false)}
          >
            <Pressable
              style={styles.modalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>Sélectionner l'équipe gagnante (2 joueurs)</Text>
              {players.map(player => {
                const isSelected = winningTeamPlayers.includes(player.id);
                const canSelect = winningTeamPlayers.length < 2 || isSelected;
                return (
                  <Pressable
                    key={player.id}
                    onPress={() => {
                      if (isSelected) {
                        setWinningTeamPlayers(prev => prev.filter(id => id !== player.id));
                        // Réinitialiser l'équipe perdante si nécessaire
                        if (losingTeamPlayers.includes(player.id)) {
                          setLosingTeamPlayers(prev => prev.filter(id => id !== player.id));
                        }
                      } else if (winningTeamPlayers.length < 2) {
                        setWinningTeamPlayers(prev => [...prev, player.id]);
                        // Retirer de l'équipe perdante si présent
                        setLosingTeamPlayers(prev => prev.filter(id => id !== player.id));
                      }
                    }}
                    style={[
                      styles.modalOption,
                      isSelected && styles.modalOptionSelected,
                      !canSelect && styles.modalOptionDisabled,
                    ]}
                    disabled={!canSelect}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        isSelected && styles.modalOptionTextSelected,
                        !canSelect && styles.modalOptionTextDisabled,
                      ]}
                    >
                      {player.display_name}
                    </Text>
                    {isSelected && <Text style={styles.modalCheck}>✓</Text>}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setShowWinningTeamPicker(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Fermer</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        )}

        {/* Modal pour sélectionner l'équipe perdante */}
        {showLosingTeamPicker && winningTeamPlayers.length === 2 && (
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowLosingTeamPicker(false)}
          >
            <Pressable
              style={styles.modalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>Sélectionner l'équipe perdante (2 joueurs)</Text>
              {getAvailablePlayersForLosingTeam().map(player => {
                const isSelected = losingTeamPlayers.includes(player.id);
                const canSelect = losingTeamPlayers.length < 2 || isSelected;
                return (
                  <Pressable
                    key={player.id}
                    onPress={() => {
                      if (isSelected) {
                        setLosingTeamPlayers(prev => prev.filter(id => id !== player.id));
                      } else if (losingTeamPlayers.length < 2) {
                        setLosingTeamPlayers(prev => [...prev, player.id]);
                      }
                    }}
                    style={[
                      styles.modalOption,
                      isSelected && styles.modalOptionSelected,
                      !canSelect && styles.modalOptionDisabled,
                    ]}
                    disabled={!canSelect}
                  >
                    <Text
                      style={[
                        styles.modalOptionText,
                        isSelected && styles.modalOptionTextSelected,
                        !canSelect && styles.modalOptionTextDisabled,
                      ]}
                    >
                      {player.display_name}
                    </Text>
                    {isSelected && <Text style={styles.modalCheck}>✓</Text>}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setShowLosingTeamPicker(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Fermer</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        )}
        {showMatchTypePicker && (
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowMatchTypePicker(false)}
          >
            <Pressable
              style={styles.modalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>Type de match</Text>
              {MATCH_TYPES.map(type => (
                <Pressable
                  key={type.value}
                  onPress={() => {
                    setMatchType(type.value);
                    setShowMatchTypePicker(false);
                  }}
                  style={styles.modalOption}
                >
                  <Text style={styles.modalOptionText}>{type.label}</Text>
                  {matchType === type.value && (
                    <Text style={styles.modalCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
              <Pressable
                onPress={() => setShowMatchTypePicker(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        )}

        {showResultTypePicker && (
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowResultTypePicker(false)}
          >
            <Pressable
              style={styles.modalContent}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>Type de résultat</Text>
              {RESULT_TYPES.map(type => (
                <Pressable
                  key={type.value}
                  onPress={() => {
                    setResultType(type.value);
                    setShowResultTypePicker(false);
                  }}
                  style={styles.modalOption}
                >
                  <Text style={styles.modalOptionText}>{type.label}</Text>
                  {resultType === type.value && (
                    <Text style={styles.modalCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
              <Pressable
                onPress={() => setShowResultTypePicker(false)}
                style={styles.modalCancel}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 16,
    minHeight: '100%',
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  backText: {
    color: BRAND,
    fontWeight: '700',
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: BRAND,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  teamSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  teamButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  teamButtonSelected: {
    borderColor: BRAND,
    backgroundColor: '#eaf4ff',
  },
  teamButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6b7280',
  },
  teamButtonTextSelected: {
    color: BRAND,
  },
  setsContainer: {
    gap: 16,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    width: 100,
  },
  scoreInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  scoreInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: '#fff',
    minHeight: 48,
    color: '#111827',
  },
  scoreSeparator: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6b7280',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
  },
  pickerButtonText: {
    fontSize: 16,
    color: '#111827',
  },
  pickerChevron: {
    fontSize: 12,
    color: '#6b7280',
  },
  submitButton: {
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalOptionText: {
    fontSize: 16,
    color: '#111827',
  },
  modalCheck: {
    fontSize: 18,
    color: BRAND,
    fontWeight: '700',
  },
  modalCancel: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '600',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  hintText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  scoreHint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  pickerButtonDisabled: {
    opacity: 0.5,
  },
  pickerButtonTextDisabled: {
    color: '#9ca3af',
  },
  modalOptionSelected: {
    backgroundColor: '#eaf4ff',
  },
  modalOptionTextSelected: {
    color: BRAND,
    fontWeight: '700',
  },
  modalOptionDisabled: {
    opacity: 0.5,
  },
  modalOptionTextDisabled: {
    color: '#9ca3af',
  },
});

