// components/AgendaClub.js
// Composant pour afficher l'agenda des événements d'un club
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { useUserRole } from "../lib/roles";
import { supabase } from "../lib/supabase";

const BRAND = "#1a4b87";
const ORANGE = "#ff6b35";

// Catégories avec leurs couleurs et icônes
const CATEGORY_CONFIG = {
  sport: { color: "#22c55e", icon: "tennisball", label: "Sportif" },
  social: { color: "#3b82f6", icon: "people", label: "Communautaire" },
  kids: { color: "#f59e0b", icon: "happy", label: "École de padel" },
  info: { color: "#6b7280", icon: "information-circle", label: "Info" },
};

// Formater la date pour l'affichage
function formatEventDate(dateStart, dateEnd) {
  const start = new Date(dateStart);
  const end = dateEnd ? new Date(dateEnd) : null;

  const dayNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const monthNames = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];

  const dayName = dayNames[start.getDay()];
  const day = start.getDate();
  const month = monthNames[start.getMonth()];
  const startTime = start.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (end) {
    const endTime = end.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    // Même jour
    if (
      start.getDate() === end.getDate() &&
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear()
    ) {
      return `${dayName} ${day} ${month} · ${startTime} – ${endTime}`;
    }
    // Plusieurs jours
    return `${dayName} ${day} ${month} · ${startTime} – ${end.getDate()} ${monthNames[end.getMonth()]} · ${endTime}`;
  }

  return `${dayName} ${day} ${month} · ${startTime}`;
}

// Générer les jours du mois pour le calendrier
function getDaysInMonth(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days = [];
  // Jours vides avant le premier jour du mois
  for (let i = 0; i < startingDayOfWeek; i++) {
    days.push(null);
  }
  // Jours du mois
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }
  return days;
}

export default function AgendaClub({
  clubId,
  isManager = false,
  showCalendar = true,
}) {
  const { role, clubId: userClubId, loading: roleLoading } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  // Charger les événements
  const loadEvents = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("club_events")
        .select("*")
        .eq("club_id", clubId)
        .gte("date_start", new Date().toISOString())
        .order("date_start", { ascending: true })
        .limit(50);

      if (error) {
        // Si la table n'existe pas, afficher un message plus clair
        if (error.code === "42703" || error.message?.includes("does not exist")) {
          // Table non créée - c'est normal si les migrations n'ont pas été exécutées
          // Ne pas logger en erreur, juste retourner une liste vide
          setEvents([]);
          setLoading(false);
          return;
        }
        throw error;
      }
      setEvents(data || []);
    } catch (e) {
      console.error("[AgendaClub] Erreur chargement:", e);
      // Ne pas afficher d'alerte si c'est juste que la table n'existe pas
      if (e.code !== "42703" && !e.message?.includes("does not exist")) {
        // Ne pas afficher d'alerte pour les joueurs, juste logger
        console.warn("[AgendaClub] Impossible de charger les événements:", e.message);
      }
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  useEffect(() => {
    if (!clubId) {
      setLoading(false);
      return;
    }
    // Attendre un peu avant de charger pour éviter les conflits
    const timer = setTimeout(() => {
      loadEvents();
    }, 200);
    return () => clearTimeout(timer);
  }, [clubId, loadEvents]);

  // Vérifier si un jour a des événements
  const hasEventsOnDay = (day) => {
    if (!day) return false;
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.some((event) => {
      const eventDate = new Date(event.date_start);
      return (
        eventDate.getFullYear() === currentYear &&
        eventDate.getMonth() === currentMonth &&
        eventDate.getDate() === day
      );
    });
  };

  // Obtenir les événements pour un jour donné
  const getEventsForDay = (day) => {
    if (!day) return [];
    return events.filter((event) => {
      const eventDate = new Date(event.date_start);
      return (
        eventDate.getFullYear() === currentYear &&
        eventDate.getMonth() === currentMonth &&
        eventDate.getDate() === day
      );
    });
  };

  // Navigation mois précédent/suivant
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const days = getDaysInMonth(currentYear, currentMonth);
  const monthNames = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];

  const isManagerOfThisClub =
    isManager &&
    role === "club_manager" &&
    userClubId &&
    String(userClubId) === String(clubId);

  // Filtrer les événements à venir (au moins 3 prochains)
  const upcomingEvents = events.slice(0, 3);

  // Ne pas afficher le spinner si on attend le rôle ou si clubId n'existe pas
  if (!clubId || roleLoading) {
    return null;
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={BRAND} />
        </View>
      </View>
    );
  }

  return (
    <>
      {/* En-tête avec bouton créer (si manager) */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="calendar" size={20} color="#e0ff00" />
          <Text style={styles.title}>Agenda du club</Text>
        </View>
        {isManagerOfThisClub && (
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push(`/clubs/${clubId}/create-event`)}
          >
            <Ionicons name="add" size={20} color="#000" />
            <Text style={styles.createButtonText}>Créer</Text>
          </TouchableOpacity>
        )}
      </View>
      {/* Calendrier condensé - affiché uniquement si showCalendar est true */}
      {showCalendar && (
        <View style={styles.container}>
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthNav}>
                <Ionicons name="chevron-back" size={20} color={BRAND} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {monthNames[currentMonth]} {currentYear}
              </Text>
              <TouchableOpacity onPress={goToNextMonth} style={styles.monthNav}>
                <Ionicons name="chevron-forward" size={20} color={BRAND} />
              </TouchableOpacity>
            </View>

            {/* Jours de la semaine */}
            <View style={styles.weekDays}>
              {["L", "M", "M", "J", "V", "S", "D"].map((day, idx) => (
                <Text key={idx} style={styles.weekDay}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Grille du calendrier */}
            <View style={styles.calendarGrid}>
              {days.map((day, idx) => {
                const hasEvents = hasEventsOnDay(day);
                const isToday =
                  day === new Date().getDate() &&
                  currentMonth === new Date().getMonth() &&
                  currentYear === new Date().getFullYear();

                if (!day) {
                  return <View key={`empty-${idx}`} style={styles.dayCell} />;
                }

                return (
                  <Pressable
                    key={day}
                    style={[
                      styles.dayCell,
                      isToday && styles.dayCellToday,
                      hasEvents && styles.dayCellWithEvents,
                    ]}
                    onPress={() => setSelectedDate(day)}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        isToday && styles.dayTextToday,
                        hasEvents && styles.dayTextWithEvents,
                      ]}
                    >
                      {day}
                    </Text>
                    {hasEvents && <View style={styles.eventDot} />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      )}

      {/* Liste des événements à venir */}
      <View style={styles.eventsListTitleRow}>
        <Ionicons name="arrow-forward" size={20} color="#e0ff00" />
        <Text style={styles.eventsListTitle}>
          Événements à venir {events.length > 0 && `(${events.length})`}
        </Text>
      </View>
      <View style={[styles.container, styles.eventsList]}>
        {events.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>
              Aucun événement programmé pour le moment
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.eventsScroll} nestedScrollEnabled>
            {events.map((event) => {
              const categoryConfig = CATEGORY_CONFIG[event.category] || CATEGORY_CONFIG.info;
              return (
                <Pressable
                  key={event.id}
                  style={styles.eventCard}
                  onPress={() => {
                    // Optionnel: ouvrir les détails de l'événement
                  }}
                >
                  <View
                    style={[
                      styles.eventCategoryBadge,
                      { backgroundColor: categoryConfig.color + "20" },
                    ]}
                  >
                    <Ionicons
                      name={categoryConfig.icon}
                      size={16}
                      color={categoryConfig.color}
                    />
                    <Text
                      style={[
                        styles.eventCategoryText,
                        { color: categoryConfig.color },
                      ]}
                    >
                      {categoryConfig.label}
                    </Text>
                  </View>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventDate}>
                    {formatEventDate(event.date_start, event.date_end)}
                  </Text>
                  {event.description && (
                    <Text style={styles.eventDescription} numberOfLines={2}>
                      {event.description}
                    </Text>
                  )}
                  {event.location && (
                    <View style={styles.eventLocation}>
                      <Ionicons name="location" size={14} color="#6b7280" />
                      <Text style={styles.eventLocationText}>
                        {event.location}
                      </Text>
                    </View>
                  )}
                  {event.image_url && (
                    <Image
                      source={{ uri: event.image_url }}
                      style={styles.eventImage}
                    />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#e0ff00",
  },
  createButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e0ff00",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  createButtonText: {
    color: "#000",
    fontSize: 14,
    fontWeight: "600",
  },
  calendarContainer: {
    marginBottom: 12,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  monthNav: {
    padding: 4,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
  },
  weekDays: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 8,
  },
  weekDay: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    width: 40,
    textAlign: "center",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dayCellToday: {
    backgroundColor: BRAND + "20",
    borderRadius: 8,
  },
  dayCellWithEvents: {
    // Style pour les jours avec événements
  },
  dayText: {
    fontSize: 14,
    color: "#374151",
  },
  dayTextToday: {
    fontWeight: "700",
    color: BRAND,
  },
  dayTextWithEvents: {
    fontWeight: "600",
  },
  eventDot: {
    position: "absolute",
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ORANGE,
  },
  eventsList: {
    marginTop: 0,
  },
  eventsListTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  eventsListTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e0ff00",
  },
  eventsScroll: {
    maxHeight: 400,
  },
  emptyState: {
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 14,
    textAlign: "center",
  },
  eventCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  eventCategoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  eventCategoryText: {
    fontSize: 12,
    fontWeight: "600",
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#000",
    marginBottom: 4,
  },
  eventDate: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 8,
  },
  eventLocation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  eventLocationText: {
    fontSize: 13,
    color: "#6b7280",
  },
  eventImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 12,
    marginTop: 10,
    backgroundColor: "#f3f4f6",
  },
});

