// components/DateTimePicker.js
// Composant réutilisable pour sélectionner une date et une heure avec calendrier
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

const BRAND = "#1a4b87";

export default function CustomDateTimePicker({
  value,
  onChange,
  label,
  placeholder = "Sélectionner la date et l'heure",
  minimumDate,
  maximumDate,
  mode = "datetime", // 'date', 'time', 'datetime'
}) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(value || new Date());
  const { width } = useWindowDimensions();

  const formatDate = (date) => {
    if (!date) return "";
    const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const months = [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ];
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const dayFormatted = day === 1 ? "1er" : String(day);
    return `${dayName} ${dayFormatted} ${month} ${year}`;
  };

  const formatTime = (date) => {
    if (!date) return "";
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDayOfWeek = (date) => {
    if (!date) return "";
    const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    return days[date.getDay()];
  };

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      const newDate = new Date(selectedDate);
      // Préserver l'heure existante si on a déjà une date
      if (tempDate && mode === "datetime") {
        newDate.setHours(tempDate.getHours());
        newDate.setMinutes(tempDate.getMinutes());
      } else {
        // Sinon, mettre l'heure actuelle
        const now = new Date();
        newDate.setHours(now.getHours());
        newDate.setMinutes(now.getMinutes());
      }
      setTempDate(newDate);
      if (Platform.OS === "android") {
        // Sur Android, ouvrir le time picker après la date
        if (mode === "datetime") {
          setTimeout(() => setShowTimePicker(true), 300);
        } else {
          onChange(newDate);
        }
      }
    }
  };

  const handleTimeChange = (event, selectedTime) => {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }
    if (selectedTime) {
      const newDate = new Date(tempDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      newDate.setSeconds(0);
      setTempDate(newDate);
      onChange(newDate);
    }
  };

  const handlePress = () => {
    // Initialiser tempDate avec la valeur actuelle ou maintenant
    if (value) {
      setTempDate(new Date(value));
    } else {
      setTempDate(new Date());
    }
    
    if (Platform.OS === "ios") {
      // Sur iOS, ouvrir un modal avec les deux pickers
      setShowDatePicker(true);
    } else {
      // Sur Android, ouvrir le date picker d'abord
      setShowDatePicker(true);
    }
  };

  const handleConfirm = () => {
    onChange(tempDate);
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  const handleCancel = () => {
    setTempDate(value || new Date());
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  // Sur iOS, afficher un modal avec les deux pickers
  if (Platform.OS === "ios" && showDatePicker) {
    return (
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="slide"
        onRequestClose={handleCancel}
      >
        <View style={styles.modalOverlay}>
          <Pressable 
            style={StyleSheet.absoluteFill} 
            onPress={handleCancel}
          />
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalContent, { maxHeight: width > 600 ? "90%" : "95%" }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{label || "Date et heure"}</Text>
              </View>

              <ScrollView 
                style={styles.pickerScrollView}
                contentContainerStyle={styles.pickerScrollContent}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
              >
                <View style={styles.pickerContainer}>
                  <View style={styles.pickerWrapper}>
                    <Text style={styles.pickerLabel}>Date</Text>
                    {tempDate && (
                      <Text style={styles.dayOfWeek}>
                        {formatDayOfWeek(tempDate)}
                      </Text>
                    )}
                    <DateTimePicker
                      value={tempDate || new Date()}
                      mode="date"
                      display="spinner"
                      onChange={handleDateChange}
                      minimumDate={minimumDate}
                      maximumDate={maximumDate}
                      locale="fr_FR"
                      style={styles.picker}
                    />
                  </View>
                  {mode === "datetime" && (
                    <View style={styles.pickerWrapper}>
                      <Text style={styles.pickerLabel}>Heure</Text>
                      <DateTimePicker
                        value={tempDate || new Date()}
                        mode="time"
                        display="spinner"
                        onChange={handleTimeChange}
                        locale="fr_FR"
                        style={styles.pickerTime}
                      />
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCancel}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>Valider</Text>
              </TouchableOpacity>
            </View>
          </View>
          </Pressable>
        </View>
      </Modal>
    );
  }

  // Sur Android, afficher les pickers natifs
  return (
    <>
      <Pressable style={styles.container} onPress={handlePress}>
        <View style={styles.inputContainer}>
          <Ionicons name="calendar-outline" size={20} color={BRAND} />
          <View style={styles.textContainer}>
            {value ? (
              <>
                <Text style={styles.dateText}>{formatDate(value)}</Text>
                {mode === "datetime" && (
                  <Text style={styles.timeText}>{formatTime(value)}</Text>
                )}
              </>
            ) : (
              <Text style={styles.placeholder}>{placeholder}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </View>
      </Pressable>

      {showDatePicker && (
        <DateTimePicker
          value={tempDate || new Date()}
          mode={mode === "datetime" ? "date" : mode}
          display="default"
          onChange={handleDateChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={tempDate || new Date()}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 0,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    backgroundColor: "#fff",
    gap: 12,
  },
  textContainer: {
    flex: 1,
  },
  dateText: {
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
  },
  timeText: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 2,
  },
  placeholder: {
    fontSize: 16,
    color: "#999",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    minHeight: 600,
  },
  modalHeader: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
  },
  pickerScrollView: {
    maxHeight: 600,
    minHeight: 500,
  },
  pickerScrollContent: {
    paddingVertical: 10,
  },
  pickerContainer: {
    flexDirection: "column",
    alignItems: "center",
    paddingVertical: 20,
    gap: 30,
  },
  pickerWrapper: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  dayOfWeek: {
    fontSize: 18,
    fontWeight: "700",
    color: BRAND,
    marginBottom: 12,
    textAlign: "center",
  },
  picker: {
    width: "100%",
    height: 220,
    maxWidth: 300,
  },
  pickerTime: {
    width: "100%",
    height: 280,
    maxWidth: 300,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#ef4444",
  },
  confirmButton: {
    backgroundColor: BRAND,
  },
  cancelButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  confirmButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

