import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';

interface Message {
  id: string;
  match_id: string;
  user_id: string;
  message: string;
  created_at: string;
  profiles?: {
    display_name: string;
    name: string;
  };
}

interface MatchInfo {
  id: string;
  status: string;
}

export default function MatchChatScreen() {
  const { id: matchId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ display_name: string; name: string } | null>(null);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [players, setPlayers] = useState<Array<{ id: string; display_name: string }>>([]);

  // Charger l'utilisateur actuel et son profil
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        
        // Charger le profil de l'utilisateur
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, name')
          .eq('id', user.id)
          .single();
        
        if (profile) {
          setCurrentUserProfile({
            display_name: profile.display_name || profile.name || 'Vous',
            name: profile.name || '',
          });
        }
      }
    })();
  }, []);

  // Charger les informations du match et les joueurs
  useEffect(() => {
    if (!matchId) return;

    (async () => {
      try {
        // Charger les infos du match
        const { data: matchData, error: matchError } = await supabase
          .from('matches')
          .select('id, status')
          .eq('id', matchId)
          .single();

        if (matchError) throw matchError;
        if (!matchData) {
          Alert.alert('Erreur', 'Match non trouvé');
          router.back();
          return;
        }

        setMatchInfo(matchData);

        // Vérifier que le match est confirmé
        if (matchData.status !== 'confirmed') {
          Alert.alert('Erreur', 'La messagerie n\'est disponible que pour les matchs validés');
          router.back();
          return;
        }

        // Charger les joueurs du match (via match_rsvps)
        const { data: rsvps, error: rsvpsError } = await supabase
          .from('match_rsvps')
          .select('user_id, profiles:user_id(id, display_name, name)')
          .eq('match_id', matchId)
          .eq('status', 'accepted');

        if (rsvpsError) throw rsvpsError;

        const playersList = (rsvps || []).map((r: any) => ({
          id: r.user_id,
          display_name: r.profiles?.display_name || r.profiles?.name || 'Joueur',
        }));

        setPlayers(playersList);

        // Vérifier que l'utilisateur actuel est dans les joueurs
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !playersList.some((p: any) => p.id === user.id)) {
          Alert.alert('Erreur', 'Vous n\'êtes pas participant de ce match');
          router.back();
          return;
        }
      } catch (error: any) {
        console.error('[MatchChat] Error loading match:', error);
        Alert.alert('Erreur', 'Impossible de charger les informations du match');
        router.back();
      }
    })();
  }, [matchId, router]);

  // Charger les messages
  useEffect(() => {
    if (!matchId) return;

    const loadMessages = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('match_messages')
          .select(`
            id,
            match_id,
            user_id,
            message,
            created_at,
            profiles:user_id(id, display_name, name)
          `)
          .eq('match_id', matchId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        
        // Mapper les données pour s'assurer que profiles est un objet unique
        const mappedMessages: Message[] = (data || []).map((msg: any) => ({
          id: msg.id,
          match_id: msg.match_id,
          user_id: msg.user_id,
          message: msg.message,
          created_at: msg.created_at,
          profiles: Array.isArray(msg.profiles) 
            ? msg.profiles[0] 
            : msg.profiles || undefined,
        }));
        
        setMessages(mappedMessages);
      } catch (error: any) {
        console.error('[MatchChat] Error loading messages:', error);
        Alert.alert('Erreur', 'Impossible de charger les messages');
      } finally {
        setLoading(false);
      }
    };

    loadMessages();

    // Abonnement temps réel pour les nouveaux messages
    const channel = supabase
      .channel(`match_messages:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_messages',
          filter: `match_id=eq.${matchId}`,
        },
        async (payload) => {
          const newMessage = payload.new as any;
          
          // Ignorer les messages temporaires (ceux qui commencent par "temp-")
          if (String(newMessage.id).startsWith('temp-')) {
            return;
          }

          // Vérifier si le message n'existe pas déjà (pour éviter les doublons)
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMessage.id);
            if (exists) return prev;
            return prev; // On retourne prev pour l'instant, on ajoutera le message après avoir chargé le profil
          });

          // Charger le profil de l'utilisateur puis ajouter le message
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, display_name, name')
            .eq('id', newMessage.user_id)
            .single();

          setMessages((current) => {
            // Vérifier à nouveau si le message n'existe pas déjà
            const alreadyExists = current.some((m) => m.id === newMessage.id);
            if (alreadyExists) return current;

            return [
              ...current,
              {
                ...newMessage,
                profiles: profile || undefined,
              } as Message,
            ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          });

          // Scroll vers le bas après un court délai
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // Scroll vers le bas quand les messages changent
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const sendMessage = async () => {
    if (!messageText.trim() || !matchId || !currentUserId || sending) return;

    const text = messageText.trim();
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const now = new Date().toISOString();
    
    // Créer un message temporaire optimiste
    const optimisticMessage: Message = {
      id: tempId,
      match_id: matchId,
      user_id: currentUserId,
      message: text,
      created_at: now,
      profiles: currentUserProfile || undefined,
    };

    // Ajouter immédiatement le message à la liste locale
    setMessages((prev) => [...prev, optimisticMessage]);
    setMessageText('');
    setSending(true);

    // Scroll vers le bas immédiatement
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      const { data, error } = await supabase
        .from('match_messages')
        .insert({
          match_id: matchId,
          user_id: currentUserId,
          message: text,
        })
        .select()
        .single();

      if (error) throw error;

      // Remplacer le message temporaire par le vrai message
      if (data) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => m.id !== tempId);
          return [
            ...filtered,
            {
              ...data,
              profiles: currentUserProfile || undefined,
            } as Message,
          ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        });
      }
    } catch (error: any) {
      console.error('[MatchChat] Error sending message:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer le message');
      setMessageText(text); // Restaurer le texte en cas d'erreur
      
      // Retirer le message temporaire en cas d'erreur
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  const getPlayerName = (userId: string): string => {
    const player = players.find((p) => p.id === userId);
    if (player) return player.display_name;
    
    // Si pas trouvé dans la liste, chercher dans les messages
    const message = messages.find((m) => m.user_id === userId);
    return message?.profiles?.display_name || message?.profiles?.name || 'Joueur';
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }}>
        <ActivityIndicator size="large" color="#156bc9" />
        <Text style={{ marginTop: 12, color: '#6b7280' }}>Chargement...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#001831' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: '#001831',
          flexDirection: 'row',
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: '#e5e7eb',
        }}
      >
        <Pressable
          onPress={() => {
            router.replace({
              pathname: '/(tabs)/matches',
              params: { tab: 'valides' }
            });
          }}
          style={{ marginRight: 12, padding: 8 }}
        >
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#ffffff' }}>
            Discussion du match
          </Text>
          <Text style={{ fontSize: 12, color: '#cfe9ff', marginTop: 2 }}>
            {players.length} joueur{players.length > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1, backgroundColor: '#001831' }}
        contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
        onContentSizeChange={() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }}
      >
        {messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="chatbubbles-outline" size={48} color="#9ca3af" />
            <Text style={{ marginTop: 12, color: '#cfe9ff', fontSize: 14, textAlign: 'center' }}>
              Aucun message pour le moment.{'\n'}
              Commencez la conversation !
            </Text>
          </View>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.user_id === currentUserId;
            return (
              <View
                key={msg.id}
                style={{
                  marginBottom: 12,
                  alignItems: isOwn ? 'flex-end' : 'flex-start',
                }}
              >
                {!isOwn && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: '#cfe9ff',
                      marginBottom: 4,
                      marginLeft: 8,
                    }}
                  >
                    {getPlayerName(msg.user_id)}
                  </Text>
                )}
                <View
                  style={{
                    maxWidth: '75%',
                    backgroundColor: isOwn ? '#156bc9' : '#f3f4f6',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 16,
                    borderTopRightRadius: isOwn ? 4 : 16,
                    borderTopLeftRadius: isOwn ? 16 : 4,
                  }}
                >
                  <Text
                    style={{
                      color: isOwn ? '#ffffff' : '#111827',
                      fontSize: 15,
                      lineHeight: 20,
                    }}
                  >
                    {msg.message}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: isOwn ? '#cfe9ff' : '#9ca3af',
                      marginTop: 4,
                      textAlign: isOwn ? 'right' : 'left',
                    }}
                  >
                    {formatTime(msg.created_at)}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Input */}
      <View
        style={{
          paddingBottom: insets.bottom,
          paddingTop: 12,
          paddingHorizontal: 16,
          backgroundColor: '#001831',
          borderTopWidth: 1,
          borderTopColor: '#1e3a5f',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#1e3a5f',
            borderRadius: 24,
            paddingHorizontal: 4,
            paddingVertical: 4,
          }}
        >
          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Écrire un message..."
            placeholderTextColor="#9ca3af"
            style={{
              flex: 1,
              paddingHorizontal: 16,
              paddingVertical: 10,
              fontSize: 15,
              color: '#ffffff',
              maxHeight: 100,
            }}
            multiline
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            editable={!sending}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!messageText.trim() || sending}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: messageText.trim() && !sending ? '#156bc9' : '#d1d5db',
              justifyContent: 'center',
              alignItems: 'center',
              marginLeft: 8,
            }}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons
                name="send"
                size={20}
                color={messageText.trim() ? '#ffffff' : '#9ca3af'}
              />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

