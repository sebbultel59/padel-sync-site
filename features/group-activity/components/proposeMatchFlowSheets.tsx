import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { MATCH_SHEET_THEME as T } from '../../../lib/matchSheetTheme';

const PROPOSE_MATCH_HOLD_MS = 3000;
const COUNTDOWN_LABEL_COLOR = '#001833';

export type ClubRowLite = { id: string; name: string; phone?: string | null };

export type SummaryLines = {
  dateStr: string;
  timeStr: string;
  /** Créneau complet « 14h00 – 15h30 » */
  slotRangeStr: string;
  clubName: string;
  places: number;
  otherLabels: string[];
};

type ProposeMatchCombinedSheetProps = {
  insets: EdgeInsets;
  onBack: () => void;
  onClose: () => void;
  onPublish: () => void | Promise<void>;
  busy: boolean;
  clubsLoading: boolean;
  recommended: ClubRowLite | null;
  others: ClubRowLite[];
  recommendedTitle: string;
  clubsLength: number;
  renderPill: (c: ClubRowLite, opts?: { fullWidth?: boolean }) => React.ReactNode;
  summary: SummaryLines;
  canPublish: boolean;
  /** Aucun club dans la liste préfillée (écran Matchs) : proposition impossible. */
  noClubsAvailable?: boolean;
};

export function ProposeMatchCombinedSheet({
  insets,
  onBack,
  onClose,
  onPublish,
  busy,
  clubsLoading,
  recommended,
  others,
  recommendedTitle,
  clubsLength,
  renderPill,
  summary,
  canPublish,
  noClubsAvailable = false,
}: ProposeMatchCombinedSheetProps) {
  const windowH = Dimensions.get('window').height;
  /** Hauteur de la bottom sheet : quasi plein écran pour afficher toute la carte sans scroll. */
  const sheetHeight = Math.round(Math.min(windowH * 0.94, windowH - 4));
  const barAnim = useRef(new Animated.Value(1)).current;
  const countdownActiveRef = useRef(false);
  const [countdownActive, setCountdownActive] = useState(false);

  const resetCountdown = useCallback(() => {
    barAnim.stopAnimation();
    barAnim.setValue(1);
    countdownActiveRef.current = false;
    setCountdownActive(false);
  }, [barAnim]);

  useEffect(() => {
    if (!busy) return;
    resetCountdown();
  }, [busy, resetCountdown]);

  const onPressPublish = useCallback(() => {
    if (!canPublish || busy) return;
    if (countdownActiveRef.current) {
      resetCountdown();
      return;
    }
    countdownActiveRef.current = true;
    setCountdownActive(true);
    barAnim.setValue(1);
    Animated.timing(barAnim, {
      toValue: 0,
      duration: PROPOSE_MATCH_HOLD_MS,
      useNativeDriver: false,
    }).start(({ finished }) => {
      countdownActiveRef.current = false;
      setCountdownActive(false);
      if (finished) {
        barAnim.setValue(1);
        void Promise.resolve(onPublish());
      } else {
        barAnim.setValue(1);
      }
    });
  }, [canPublish, busy, barAnim, onPublish, resetCountdown]);

  const barWidth = barAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={{ flex: 1, backgroundColor: T.overlay, justifyContent: 'flex-end' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ width: '100%' }}
      >
        <View
          style={{
            flexDirection: 'column',
            backgroundColor: T.bg,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            paddingHorizontal: 16,
            paddingTop: 12,
            height: sheetHeight,
            paddingBottom: Math.max(16, insets.bottom + 8),
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
            <Pressable onPress={onBack} hitSlop={12} style={{ padding: 4, marginRight: 4 }}>
              <Ionicons name="chevron-back" size={22} color={T.text} />
            </Pressable>
            <View style={{ flex: 1, paddingRight: 40 }}>
              <Text style={{ color: T.text, fontSize: 22, fontWeight: '900' }}>Proposer la partie</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={{ position: 'absolute', right: 0, top: 0, padding: 4 }}
            >
              <Ionicons name="close" size={22} color={T.text} />
            </Pressable>
          </View>

          <View style={{ flex: 1, minHeight: 0 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: T.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: T.cardBorder,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: T.muted, fontSize: 12, fontWeight: '700', marginBottom: 8 }}>Récap</Text>
              <Text style={{ color: T.text, fontSize: 22, fontWeight: '800' }}>{summary.dateStr}</Text>
              <Text
                style={{
                  color: T.text,
                  fontSize: 19,
                  fontWeight: '800',
                  marginTop: 8,
                  letterSpacing: 0.2,
                }}
              >
                {summary.slotRangeStr}
              </Text>
              <Text style={{ color: T.text, fontSize: 16, fontWeight: '800', marginTop: 12 }}>{summary.clubName}</Text>
              <Text style={{ color: T.muted, fontSize: 14, marginTop: 8 }}>
                {summary.places} place{summary.places > 1 ? 's' : ''} à compléter
              </Text>
              {summary.otherLabels.length ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: T.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Avec</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {summary.otherLabels.map((label, i) => (
                      <View
                        key={`${label}-${i}`}
                        style={{
                          paddingVertical: 5,
                          paddingHorizontal: 10,
                          borderRadius: 999,
                          backgroundColor: 'rgba(255,255,255,0.08)',
                        }}
                      >
                        <Text style={{ color: T.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <Text style={{ color: T.muted, fontSize: 13, marginTop: 10 }}>Seulement toi pour l’instant</Text>
              )}

              <View
                style={{
                  height: 1,
                  backgroundColor: T.cardBorder,
                  marginVertical: 14,
                }}
              />

              <Text style={{ color: T.accent, fontSize: 15, fontWeight: '800', marginBottom: 4 }}>Choisis le club</Text>
              <Text style={{ color: T.muted, fontSize: 12, marginBottom: 10 }}>
                Obligatoire pour proposer la partie
              </Text>

              {clubsLoading ? (
                <ActivityIndicator color={T.accent} style={{ marginVertical: 16 }} />
              ) : noClubsAvailable ? (
                <View style={{ marginTop: 4 }}>
                  <Text style={{ color: T.text, fontSize: 15, fontWeight: '800', marginBottom: 8 }}>
                    Aucun club commun disponible
                  </Text>
                  <Text style={{ color: T.muted, fontSize: 14, lineHeight: 20 }}>
                    Ajuste ton rayon ou tes clubs acceptés pour proposer cette partie
                  </Text>
                </View>
              ) : !recommended ? (
                <Text style={{ color: T.muted, fontSize: 14 }}>
                  Sélectionne un club dans la liste ci-dessous pour continuer.
                </Text>
              ) : (
                <View>
                  <Text style={{ color: T.accent, fontSize: 14, fontWeight: '800', marginBottom: 10 }}>
                    {recommendedTitle}
                  </Text>
                  {renderPill(recommended, {
                    fullWidth: clubsLength === 1 || others.length === 0,
                  })}
                  {others.length > 0 ? (
                    <>
                      <View style={{ height: 14 }} />
                      <Text
                        style={{
                          color: T.muted,
                          fontSize: 12,
                          fontWeight: '700',
                          marginBottom: 10,
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                        }}
                      >
                        Autres clubs compatibles
                      </Text>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          rowGap: 10,
                        }}
                      >
                        {others.map((c) => renderPill(c))}
                      </View>
                    </>
                  ) : null}
                </View>
              )}
            </View>

            <Text
              style={{
                color: '#f59e0b',
                fontSize: 12,
                fontWeight: '700',
                marginBottom: 8,
                lineHeight: 17,
              }}
            >
              Pense à réserver un terrain au club avant de valider ta proposition si nécessaire. Appelle le club si tu
              as un doute.
            </Text>
          </View>

          <Pressable
            onPress={onPressPublish}
            disabled={!canPublish || busy}
            style={{
              marginTop: 4,
              borderRadius: 12,
              overflow: 'hidden',
              opacity: canPublish && !busy ? 1 : 0.55,
            }}
          >
            <View style={{ minHeight: 48, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' }}>
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: T.accent,
                  width: barWidth,
                }}
              />
              <View style={{ paddingVertical: 12, alignItems: 'center', zIndex: 1 }}>
                {busy ? (
                  <ActivityIndicator color={T.ink} />
                ) : (
                  <>
                    <Text
                      style={{
                        color: countdownActive ? COUNTDOWN_LABEL_COLOR : canPublish ? T.ink : T.muted,
                        fontWeight: '800',
                        fontSize: 15,
                      }}
                    >
                      {countdownActive ? 'Proposition demandée' : 'Proposer le match'}
                    </Text>
                    {countdownActive ? (
                      <Text style={{ color: T.muted, fontSize: 11, fontWeight: '600', marginTop: 4 }}>
                        Touche à nouveau pour annuler
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
