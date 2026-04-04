import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Platform, Pressable, Text, View } from 'react-native';

/** Aligné sur `matchCardSlotPropose` / `hotCard` : bordure 1px, rgba #e0ff00 comme l’orange des cartes en feu. */
const feedCardSurface = {
  marginBottom: 10,
  backgroundColor: '#111D32',
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(224, 255, 0, 0.25)',
  padding: 16,
  overflow: 'visible' as const,
  ...Platform.select({
    ios: {
      shadowColor: '#4DB8D8',
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 3 },
    },
    android: {
      elevation: 6,
    },
  }),
};

type Rq = {
  id: string;
  creator_user_id?: string | null;
  club_name?: string | null;
  starts_at?: string | null;
  player_ids?: string[] | null;
  created_at?: string | null;
};

type Props = {
  rq: Rq;
  meId: string | null;
  profilesById: Record<string, { display_name?: string; avatar_url?: string }>;
  formatRange: (startIso: string, endIso: string) => string;
  formatPlayerName: (name: string) => string;
  onJoin: (searchId: string) => void;
  onDelete: (searchId: string) => void;
};

export function FindGameFeedCard({
  rq,
  meId,
  profilesById,
  formatRange,
  formatPlayerName,
  onJoin,
  onDelete,
}: Props) {
  const displayPlayers = (rq.player_ids || []).slice(0, 4);
  const emptyCount = Math.max(0, 4 - displayPlayers.length);
  const isAuthor = rq.creator_user_id && String(rq.creator_user_id) === String(meId);
  const isUserInParty =
    !!meId && (rq.player_ids || []).some((id) => String(id) === String(meId));
  const endIso = new Date(new Date(rq.starts_at || 0).getTime() + 90 * 60000).toISOString();

  return (
    <View style={feedCardSurface}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
          gap: 10,
        }}
      >
        <Text
          style={{
            flex: 1,
            minWidth: 0,
            color: '#F8FAFC',
            fontSize: 18,
            fontWeight: '900',
            marginBottom: 0,
          }}
          numberOfLines={2}
        >
          {formatRange(rq.starts_at || '', endIso)}
        </Text>
        <View
          pointerEvents="none"
          style={{
            flexShrink: 0,
            alignSelf: 'center',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: 'rgba(229, 255, 0, 0.14)',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <Text style={{ color: '#E5FF00', fontWeight: '800', fontSize: 13 }}>1h30</Text>
        </View>
      </View>
      <Text style={{ color: '#EAF2FF', fontSize: 16, fontWeight: '600', marginTop: 4 }}>
        {rq.club_name}
      </Text>

      {rq.creator_user_id ? (
        <Text style={{ color: '#94A3B8', fontWeight: '700', marginTop: 4 }}>
          Par {formatPlayerName(profilesById[String(rq.creator_user_id)]?.display_name || 'Joueur')}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 10,
          marginBottom: 8,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {displayPlayers.map((uid) => {
            const p = profilesById[String(uid)] || {};
            const avatar = p.avatar_url;
            const isMe = !!meId && String(uid) === String(meId);
            const partyPlayerRing = isMe
              ? { borderWidth: 2, borderColor: '#4ADE80' as const }
              : {};
            return (
              <View key={`${rq.id}-${uid}`} style={{ width: 52, alignItems: 'center' }}>
                {avatar ? (
                  <Image
                    source={{ uri: avatar }}
                    style={{ width: 48, height: 48, borderRadius: 24, ...partyPlayerRing }}
                  />
                ) : (
                  <View
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: 'rgba(255,255,255,0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...partyPlayerRing,
                    }}
                  >
                    <Text style={{ color: '#F1F5F9', fontWeight: '900' }}>
                      {formatPlayerName(p.display_name || 'J')
                        .slice(0, 1)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <View
              key={`${rq.id}-empty-${i}`}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                borderWidth: 2,
                borderStyle: 'dashed',
                borderColor: 'rgba(47,107,255,0.45)',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(255,255,255,0.04)',
              }}
            >
              <Ionicons name="add" size={22} color="#2F6BFF" />
            </View>
          ))}
        </View>
        {isAuthor ? (
          <Pressable
            onPress={() => void onDelete(rq.id)}
            accessibilityRole="button"
            accessibilityLabel="Supprimer la proposition"
            hitSlop={12}
            style={({ pressed }) => [
              {
                flexShrink: 0,
                padding: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                borderRadius: 12,
              },
              pressed ? { opacity: 0.88 } : null,
            ]}
          >
            <Ionicons name="trash-outline" size={22} color="rgb(248, 113, 113)" />
          </Pressable>
        ) : null}
      </View>

      {emptyCount > 0 ? (
        <Text
          style={{
            color: '#FF8A3D',
            fontWeight: '500',
            fontSize: 14,
            marginBottom: 8,
          }}
        >
          {emptyCount === 1
            ? 'En attente de 1 joueur'
            : `En attente de ${emptyCount} joueurs`}
        </Text>
      ) : null}

      {!isUserInParty ? (
        <Pressable
          onPress={() => void onJoin(rq.id)}
          style={({ pressed }) => [
            {
              marginTop: 4,
              backgroundColor: '#2F6BFF',
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            },
            pressed ? { opacity: 0.88 } : null,
          ]}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }}>Rejoindre</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </Pressable>
      ) : null}

    </View>
  );
}
