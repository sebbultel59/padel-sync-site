// app/clubs/[id]/_layout.js
// Layout avec navigation par onglets pour Club Manager
import { useLocalSearchParams, useRouter, useSegments, Slot } from "expo-router";
import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, Text, ActivityIndicator, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useUserRole } from "../../../lib/roles";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b87";

export default function ClubManagerLayout() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { role, clubId: userClubId, loading } = useUserRole();
  const [club, setClub] = useState(null);
  const [loadingClub, setLoadingClub] = useState(true);

  // Charger les informations du club
  const loadClub = useCallback(async () => {
    if (!clubId) return;

    try {
      const { data: clubData, error } = await supabase
        .from("clubs")
        .select("id, name, logo_url")
        .eq("id", clubId)
        .single();

      if (error) throw error;
      setClub(clubData);
    } catch (e) {
      console.error("[ClubManagerLayout] Erreur chargement club:", e);
    } finally {
      setLoadingClub(false);
    }
  }, [clubId]);

  useEffect(() => {
    loadClub();
  }, [loadClub]);

  // Vérifier les permissions et rediriger
  useEffect(() => {
    if (loading) return;
    
    const currentLastSegment = segments[segments.length - 1] || '';
    const isOnIndex = currentLastSegment === clubId || currentLastSegment === 'index' || segments.length === 2;
    
    // Si on est sur index.js (page publique), laisser passer sans redirection
    if (isOnIndex && role !== 'club_manager') {
      // Ne rien faire, laisser index.js s'afficher
      return;
    }
    
    if (role !== 'club_manager') {
      // Rediriger vers la page publique seulement si on n'est pas déjà dessus
      if (!isOnIndex) {
        router.replace(`/clubs/${clubId}`);
      }
      return;
    }

    if (!userClubId || String(userClubId) !== String(clubId)) {
      // Rediriger vers la page publique seulement si on n'est pas déjà dessus
      if (!isOnIndex) {
        router.replace(`/clubs/${clubId}`);
      }
      return;
    }

    // Rediriger vers dashboard si on est sur /manage, index, ou si aucun segment spécifique
    const isOnManage = currentLastSegment === 'manage';
    const hasSpecificRoute = ['dashboard', 'groupes', 'matchs', 'page-club', 'notifications', 'agenda'].includes(currentLastSegment);
    
    // Si on est sur index ou manage sans route spécifique, rediriger vers dashboard
    if ((isOnIndex || isOnManage) && !hasSpecificRoute) {
      router.replace(`/clubs/${clubId}/dashboard`);
    }
  }, [role, userClubId, clubId, loading, segments, router]);

  const tabs = [
    { id: 'page-club', label: 'Infos', icon: 'settings', route: `/clubs/${clubId}/page-club` },
    { id: 'groupes', label: 'Groupes', icon: 'people', route: `/clubs/${clubId}/groupes` },
    { id: 'agenda', label: 'Agenda', icon: 'calendar', route: `/clubs/${clubId}/agenda` },
    { id: 'matchs', label: 'Matchs', icon: 'calendar-outline', route: `/clubs/${clubId}/matchs` },
    { id: 'notifications', label: 'Notifs', icon: 'notifications', route: `/clubs/${clubId}/notifications` },
    { id: 'dashboard', label: 'Stats', icon: 'stats-chart', route: `/clubs/${clubId}/dashboard` },
  ];

  // Déterminer l'onglet actif depuis les segments
  const lastSegment = segments[segments.length - 1] || '';
  const activeTab = tabs.find(tab => lastSegment === tab.id) || tabs[0];
  
  // Debug: logger les segments pour comprendre le problème
  useEffect(() => {
    if (!loading && role === 'club_manager') {
      console.log('[ClubManagerLayout] Segments:', segments, 'Last:', lastSegment, 'ActiveTab:', activeTab.id);
    }
  }, [segments, lastSegment, activeTab, loading, role]);

  if (loading || loadingClub) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BRAND} />
      </View>
    );
  }

  // Si ce n'est pas un club_manager, laisser passer le Slot (index.js s'affichera)
  // Le layout ne s'affiche que pour les club_managers
  const currentLastSegment = segments[segments.length - 1] || '';
  const isOnIndexPage = currentLastSegment === clubId || currentLastSegment === 'index' || segments.length === 2;
  
  if (role !== 'club_manager') {
    // Pour les non-club_managers, rendre juste le Slot sans le layout (header/tabs)
    return <Slot />;
  }

  return (
    <View style={styles.container}>
      {/* Header avec logo du club */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Bouton retour */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push('/(tabs)/profil')}
        >
          <Ionicons name="arrow-back" size={24} color={BRAND} />
        </TouchableOpacity>

        {/* Logo et nom du club centrés */}
        <View style={styles.headerCenter}>
          {club?.logo_url ? (
            <Image 
              source={{ uri: club.logo_url }} 
              style={styles.logo}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.logoPlaceholder}>
              <Ionicons name="business" size={32} color={BRAND} />
            </View>
          )}
          {club?.name && (
            <Text style={styles.clubName} numberOfLines={1}>
              {club.name}
            </Text>
          )}
        </View>

        {/* Espace pour équilibrer le bouton retour */}
        <View style={styles.backButtonPlaceholder} />
      </View>

      {/* Contenu des onglets */}
      <View style={styles.content}>
        <Slot />
      </View>

      {/* Navigation par onglets - En bas */}
      <View style={[styles.tabBarContainer, { paddingBottom: insets.bottom }]}>
        <View style={styles.tabBar}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => router.push(tab.route)}
              >
                <View style={isActive && styles.iconGlow}>
                <Ionicons 
                  name={tab.icon} 
                  size={24} 
                  color={isActive ? '#e0ff00' : '#6b7280'} 
                />
                </View>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#001833',
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 100,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  backButtonPlaceholder: {
    width: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 8,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  clubName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  tabBarContainer: {
    backgroundColor: '#001833',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#001833',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 70,
  },
  tabActive: {
    // L'état actif est géré par les couleurs de l'icône et du texte
  },
  iconGlow: {
    shadowColor: '#e0ff00',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: '#e0ff00',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});

