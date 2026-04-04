/**
 * UI des 4 étapes du flux « Trouver / Proposer une partie » — aligné sur MATCH_SHEET_THEME (Confirmer le match).
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { MATCH_SHEET_THEME as T } from '../../../lib/matchSheetTheme';

export const WIZARD_STEP_COPY = [
  { title: 'Quand tu veux jouer ?', subtitle: 'Choisis le jour et l’heure' },
  { title: 'Avec qui tu joues ?', subtitle: 'Choisis les joueurs déjà là et le nombre de places à compléter' },
  { title: 'Choisis le club', subtitle: 'Obligatoire pour proposer la partie' },
  { title: 'Résumé', subtitle: 'Prêt à proposer la partie ?' },
] as const;

function formatDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

type Step1Props = {
  dateVal: Date;
  timeVal: Date;
  showDatePicker: boolean;
  showTimePicker: boolean;
  setShowDatePicker: (v: boolean) => void;
  setShowTimePicker: (v: boolean) => void;
  setDateVal: (d: Date) => void;
  setTimeVal: (d: Date) => void;
};

export function WizardStepDateTime({
  dateVal,
  timeVal,
  showDatePicker,
  showTimePicker,
  setShowDatePicker,
  setShowTimePicker,
  setDateVal,
  setTimeVal,
}: Step1Props) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 24, flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={!!showDatePicker}
      indicatorStyle="white"
      nestedScrollEnabled
    >
      <View style={styles.stepBody}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>📅 Date</Text>
          <Pressable style={styles.pickRow} onPress={() => setShowDatePicker(true)}>
            <Text style={styles.pickRowTxt}>{formatDateFr(dateVal)}</Text>
            <Ionicons name="calendar-outline" size={20} color={T.accent} />
          </Pressable>
          {showDatePicker ? (
            <DateTimePicker
              value={dateVal}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              textColor={Platform.OS === 'ios' ? '#FFFFFF' : undefined}
              themeVariant={Platform.OS === 'ios' ? 'dark' : undefined}
              onChange={(_, d) => {
                setShowDatePicker(false);
                if (d) setDateVal(d);
              }}
            />
          ) : null}
        </View>
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.cardLabel}>🕒 Heure de début</Text>
          <Pressable style={styles.pickRow} onPress={() => setShowTimePicker(true)}>
            <Text style={styles.pickRowTxt}>
              {pad2(timeVal.getHours())}h{pad2(timeVal.getMinutes())}
            </Text>
            <Ionicons name="time-outline" size={20} color={T.accent} />
          </Pressable>
          {showTimePicker ? (
            <DateTimePicker
              value={timeVal}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              is24Hour
              textColor={Platform.OS === 'ios' ? '#FFFFFF' : undefined}
              themeVariant={Platform.OS === 'ios' ? 'dark' : undefined}
              onChange={(_, d) => {
                setShowTimePicker(false);
                if (d) setTimeVal(d);
              }}
            />
          ) : null}
        </View>
        <View style={[styles.previewCard, { marginTop: 14 }]}>
          <Text style={styles.previewEmoji}>📅</Text>
          <Text style={styles.previewLine}>{formatDateFr(dateVal)}</Text>
          <Text style={styles.previewEmoji}>🕒</Text>
          <Text style={styles.previewLine}>
            {pad2(timeVal.getHours())}h{pad2(timeVal.getMinutes())}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

type MemberRow = { id: string; label: string };

type Step2Props = {
  placesChipOptions: readonly number[];
  placesToFill: number;
  setPlacesToFill: (n: 1 | 2 | 3) => void;
  maxOthers: number;
  membersLoading: boolean;
  members: MemberRow[];
  meId: string | null;
  selectedOtherIds: Set<string>;
  toggleOther: (id: string) => void;
};

function InitialsAvatar({ label }: { label: string }) {
  const initials = (label || '?')
    .split(/\s+/)
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarTxt}>{initials}</Text>
    </View>
  );
}

export function WizardStepPlacesPlayers({
  placesChipOptions,
  placesToFill,
  setPlacesToFill,
  maxOthers,
  membersLoading,
  members,
  meId,
  selectedOtherIds,
  toggleOther,
}: Step2Props) {
  return (
    <View style={styles.stepBody}>
      <Text style={styles.blockTitle}>Places à compléter</Text>
      {placesChipOptions.length === 1 ? (
        <View style={styles.singlePlaceHint}>
          <Text style={styles.muted}>
            Il reste {placesChipOptions[0]} place{placesChipOptions[0] > 1 ? 's' : ''} à compléter (créneau Presque
            prêts).
          </Text>
        </View>
      ) : (
        <View style={styles.rowChips}>
          {placesChipOptions.map((n) => {
            const on = placesToFill === n;
            return (
              <Pressable
                key={n}
                onPress={() => setPlacesToFill(n as 1 | 2 | 3)}
                style={[styles.placeChip, on && styles.placeChipOn]}
              >
                <Text style={[styles.placeChipTxt, on && styles.placeChipTxtOn]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Text style={[styles.blockTitle, { marginTop: 20 }]}>Joueurs déjà là</Text>
      <Text style={[styles.muted, { marginBottom: 10, fontSize: 12 }]}>
        Max. {maxOthers} co-joueur{maxOthers > 1 ? 's' : ''} sélectionnable{maxOthers > 1 ? 's' : ''} (toi inclus par
        défaut).
      </Text>
      {membersLoading ? (
        <ActivityIndicator color={T.accent} style={{ marginVertical: 20 }} />
      ) : (
        <View style={styles.memberList}>
          {members.map((m) => {
            if (m.id === meId) {
              return (
                <View key={m.id} style={styles.memberCard}>
                  <InitialsAvatar label={m.label} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.label}</Text>
                    <Text style={styles.memberYou}>Toi · toujours dans la partie</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={22} color={T.accent} />
                </View>
              );
            }
            const sel = selectedOtherIds.has(m.id);
            const disabled = !sel && selectedOtherIds.size >= maxOthers;
            return (
              <Pressable
                key={m.id}
                disabled={disabled}
                onPress={() => toggleOther(m.id)}
                style={[styles.memberCard, sel && styles.memberCardOn, disabled && { opacity: 0.4 }]}
              >
                <InitialsAvatar label={m.label} />
                <Text style={[styles.memberName, { flex: 1 }]}>{m.label}</Text>
                <Ionicons
                  name={sel ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={sel ? T.accent : T.muted}
                />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** Aligné sur FindGameWizardModal (ClubRow). */
export type WizardClubRow = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  zone_id: string | null;
  phone: string | null;
};

export type WizardClubSection = {
  key: string;
  title: string;
  clubs: WizardClubRow[];
  emptyHint?: string;
};

type Step3Props = {
  clubSearch: string;
  setClubSearch: (s: string) => void;
  clubsLoading: boolean;
  clubSections: WizardClubSection[];
  restrictClubsToPossible: boolean;
  clubsLength: number;
  locationReady: boolean;
  userLocation: { lat: number; lng: number } | null;
  renderClubChip: (c: WizardClubRow, sectionKey: string) => React.ReactNode;
  /** Liste préfillée vide (aucun club commun) : état bloquant. */
  emptyBlocking?: { title: string; body: string } | null;
};

export function WizardStepClub(props: Step3Props) {
  const {
    clubSearch,
    setClubSearch,
    clubsLoading,
    clubSections,
    restrictClubsToPossible,
    clubsLength,
    locationReady,
    userLocation,
    renderClubChip,
    emptyBlocking,
  } = props;

  const hasAny =
    clubSections.some((s) => s.clubs.length > 0) || clubSections.some((s) => s.emptyHint);

  return (
    <View style={[styles.stepBody, { flex: 1, minHeight: 0 }]}>
      <TextInput
        value={clubSearch}
        onChangeText={setClubSearch}
        placeholder="Rechercher un club…"
        placeholderTextColor={T.muted}
        style={styles.searchInput}
      />
      {locationReady && !userLocation ? (
        <Text style={styles.locHint}>Localisation désactivée : distances masquées.</Text>
      ) : null}
      {clubsLoading ? (
        <ActivityIndicator color={T.accent} style={{ marginVertical: 24 }} />
      ) : emptyBlocking ? (
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.muted, { fontWeight: '800', color: T.text, marginBottom: 8 }]}>
            {emptyBlocking.title}
          </Text>
          <Text style={styles.muted}>{emptyBlocking.body}</Text>
        </View>
      ) : !hasAny ? (
        <Text style={styles.muted}>Aucun club ne correspond à ta recherche.</Text>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          {clubSections.map((section) => (
            <View key={section.key} style={{ marginBottom: 16 }}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={{ gap: 8 }}>
                {section.clubs.length === 0 && section.emptyHint ? (
                  <Text style={styles.sectionEmpty}>{section.emptyHint}</Text>
                ) : (
                  section.clubs.map((c) => (
                    <View key={`${section.key}-${c.id}`}>{renderClubChip(c, section.key)}</View>
                  ))
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

type SummaryLines = {
  dateStr: string;
  slotRangeStr: string;
  clubName: string;
  places: number;
  otherLabels: string[];
};

type Step4Props = {
  summary: SummaryLines;
};

export function WizardStepSummary({ summary }: Step4Props) {
  return (
    <View style={styles.stepBody}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryDate}>{summary.dateStr}</Text>
        <Text style={styles.summaryTime}>{summary.slotRangeStr}</Text>
        <View style={styles.divider} />
        <Text style={styles.summaryClub}>{summary.clubName}</Text>
        <Text style={styles.summaryMeta}>
          {summary.places} place{summary.places > 1 ? 's' : ''} à compléter
        </Text>
        {summary.otherLabels.length ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.summaryLabel}>Avec</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {summary.otherLabels.map((label, i) => (
                <View key={`${label}-${i}`} style={styles.chip}>
                  <Text style={styles.chipTxt}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={[styles.muted, { marginTop: 12 }]}>Seulement toi pour l’instant</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepBody: {
    paddingBottom: 8,
  },
  card: {
    backgroundColor: T.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: T.cardBorder,
  },
  cardLabel: {
    color: T.muted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.cardBorder,
  },
  pickRowTxt: {
    color: T.text,
    fontSize: 16,
    fontWeight: '800',
  },
  previewCard: {
    backgroundColor: T.cardAlt,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: T.cardBorder,
  },
  previewEmoji: {
    fontSize: 14,
    marginBottom: 2,
  },
  previewLine: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  blockTitle: {
    color: T.accent,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  muted: {
    color: T.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  singlePlaceHint: {
    marginBottom: 8,
  },
  rowChips: {
    flexDirection: 'row',
    gap: 12,
  },
  placeChip: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.cardBorder,
    backgroundColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeChipOn: {
    backgroundColor: T.accentSoft,
    borderColor: T.accent,
  },
  placeChipTxt: {
    fontSize: 20,
    fontWeight: '900',
    color: T.text,
  },
  placeChipTxtOn: {
    color: T.accent,
  },
  memberList: {
    gap: 8,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.cardBorder,
  },
  memberCardOn: {
    borderColor: T.accent,
    backgroundColor: T.accentSoft,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    color: T.text,
    fontSize: 13,
    fontWeight: '800',
  },
  memberName: {
    color: T.text,
    fontSize: 15,
    fontWeight: '700',
  },
  memberYou: {
    color: T.muted,
    fontSize: 12,
    marginTop: 2,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: T.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: T.text,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  locHint: {
    fontSize: 12,
    color: '#fbbf24',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionEmpty: {
    fontSize: 13,
    color: T.muted,
    fontStyle: 'italic',
  },
  summaryCard: {
    backgroundColor: T.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: T.cardBorder,
  },
  summaryDate: {
    color: T.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  summaryTime: {
    color: T.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 6,
  },
  divider: {
    height: 1,
    backgroundColor: T.cardBorder,
    marginVertical: 14,
  },
  summaryClub: {
    color: T.text,
    fontSize: 17,
    fontWeight: '800',
  },
  summaryMeta: {
    color: T.muted,
    fontSize: 14,
    marginTop: 8,
  },
  summaryLabel: {
    color: T.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipTxt: {
    color: T.text,
    fontSize: 12,
    fontWeight: '700',
  },
});
