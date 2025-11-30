// app/clubs/[id]/page-club.js
// Paramètres de la page club (logo, nom, description, adresse, horaires, tarifs, réseaux sociaux, posts)
// Ce fichier reprend les fonctionnalités de manage.js pour les paramètres
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  exchangeShortLivedForLongLived,
  getInstagramBusinessAccountId,
  getTokenInfo,
  syncInstagramPosts,
  validateInstagramToken,
} from "../../../lib/instagram-sync";
import { useUserRole } from "../../../lib/roles";
import { supabase } from "../../../lib/supabase";

const BRAND = "#1a4b87";

// Composant TimePicker pour sélectionner une heure
function TimePickerInput({ label, value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempTime, setTempTime] = useState(() => {
    if (value) {
      const [hours, minutes] = value.split(":");
      const date = new Date();
      date.setHours(parseInt(hours) || 9, parseInt(minutes) || 0, 0);
      return date;
    }
    return new Date();
  });

  const formatTime = (timeStr) => {
    if (!timeStr) return "09:00";
    return timeStr;
  };

  const handleTimeChange = (event, selectedTime) => {
    if (Platform.OS === "android") {
      setShowPicker(false);
    }
    if (selectedTime) {
      setTempTime(selectedTime);
      const hours = String(selectedTime.getHours()).padStart(2, "0");
      const minutes = String(selectedTime.getMinutes()).padStart(2, "0");
      onChange(`${hours}:${minutes}`);
    }
  };

  const handlePress = () => {
    if (value) {
      const [hours, minutes] = value.split(":");
      const date = new Date();
      date.setHours(parseInt(hours) || 9, parseInt(minutes) || 0, 0);
      setTempTime(date);
    }
    setShowPicker(true);
  };

  const handleConfirm = () => {
    const hours = String(tempTime.getHours()).padStart(2, "0");
    const minutes = String(tempTime.getMinutes()).padStart(2, "0");
    onChange(`${hours}:${minutes}`);
    setShowPicker(false);
  };

  const handleCancel = () => {
    setShowPicker(false);
  };

  return (
    <>
      <View style={styles.hoursTimeInput}>
        <Text style={styles.hoursTimeLabel}>{label}</Text>
        <Pressable style={styles.hoursInput} onPress={handlePress}>
          <Text style={styles.hoursInputText}>{formatTime(value)}</Text>
          <Ionicons name="time-outline" size={20} color={BRAND} />
        </Pressable>
      </View>

      {Platform.OS === "ios" && showPicker && (
        <Modal
          visible={showPicker}
          transparent={true}
          animationType="slide"
          onRequestClose={handleCancel}
        >
          <View style={styles.timePickerModalOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleCancel} />
            <View style={styles.timePickerModalContent}>
              <View style={styles.timePickerModalHeader}>
                <Text style={styles.timePickerModalTitle}>{label}</Text>
              </View>
              <DateTimePicker
                value={tempTime}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                locale="fr_FR"
                style={styles.timePicker}
              />
              <View style={styles.timePickerModalActions}>
                <TouchableOpacity
                  style={[styles.timePickerModalButton, styles.timePickerCancelButton]}
                  onPress={handleCancel}
                >
                  <Text style={styles.timePickerButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.timePickerModalButton, styles.timePickerConfirmButton]}
                  onPress={handleConfirm}
                >
                  <Text style={styles.timePickerButtonText}>Valider</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {Platform.OS === "android" && showPicker && (
        <DateTimePicker
          value={tempTime}
          mode="time"
          display="default"
          onChange={handleTimeChange}
        />
      )}
    </>
  );
}

export default function ClubPageScreen() {
  const params = useLocalSearchParams();
  const clubId = params?.id;
  const insets = useSafeAreaInsets();
  const { role, clubId: userClubId } = useUserRole();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [club, setClub] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photos, setPhotos] = useState([]);

  // États pour l'édition
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [callButtonEnabled, setCallButtonEnabled] = useState(true);
  const [callButtonLabel, setCallButtonLabel] = useState("");
  const [callPhone, setCallPhone] = useState("");
  const [address, setAddress] = useState("");
  const [addressInput, setAddressInput] = useState(""); // Input text pour l'adresse
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [geocoding, setGeocoding] = useState(false);
  const [clubLat, setClubLat] = useState(null);
  const [clubLng, setClubLng] = useState(null);
  
  // Refs pour le debouncing et l'annulation des requêtes
  const debounceTimerAddress = useRef(null);
  const abortControllerAddress = useRef(null);
  const addressCache = useRef(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const CACHE_MAX_SIZE = 50;
  
  const [socialLinks, setSocialLinks] = useState({
    facebook: "",
    instagram: "",
    website: "",
  });
  
  // États pour Instagram
  const [instagramUsername, setInstagramUsername] = useState("");
  const [instagramEnabled, setInstagramEnabled] = useState(false);
  const [instagramLastSync, setInstagramLastSync] = useState(null);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [instagramSyncing, setInstagramSyncing] = useState(false);
  const [instagramTokenModalVisible, setInstagramTokenModalVisible] = useState(false);
  const [instagramTokenInput, setInstagramTokenInput] = useState("");
  const [validatingToken, setValidatingToken] = useState(false);
  const [tokenAppId, setTokenAppId] = useState("");
  const [tokenAppSecret, setTokenAppSecret] = useState("");
  const [tokenType] = useState("auto"); // "auto" pour essayer l'échange si App ID/Secret fournis
  const [openingHours, setOpeningHours] = useState({
    monday: { open: "09:00", close: "22:00", closed: false },
    tuesday: { open: "09:00", close: "22:00", closed: false },
    wednesday: { open: "09:00", close: "22:00", closed: false },
    thursday: { open: "09:00", close: "22:00", closed: false },
    friday: { open: "09:00", close: "22:00", closed: false },
    saturday: { open: "09:00", close: "22:00", closed: false },
    sunday: { open: "09:00", close: "22:00", closed: false },
  });

  const loadClub = useCallback(async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      const { data: clubData, error: clubError } = await supabase
        .from("clubs")
        .select("*")
        .eq("id", clubId)
        .single();

      if (clubError) throw clubError;
      if (!clubData) {
        Alert.alert("Erreur", "Club non trouvé");
        router.back();
        return;
      }

      setClub(clubData);
      setName(clubData.name || "");
      setDescription(clubData.description || "");
      setLogoUrl(clubData.logo_url || "");
      setCallButtonEnabled(clubData.call_button_enabled ?? true);
      setCallButtonLabel(clubData.call_button_label || "");
      setCallPhone(clubData.call_phone || "");
      setAddress(clubData.address || "");
      setAddressInput(clubData.address || "");
      setClubLat(clubData.lat || null);
      setClubLng(clubData.lng || null);
      
      const photosData = clubData.photos || [];
      setPhotos(Array.isArray(photosData) ? photosData : []);

      const links = clubData.social_links || {};
      setSocialLinks({
        facebook: links.facebook || "",
        instagram: links.instagram || "",
        website: links.website || "",
      });
      
      // Charger les données Instagram depuis instagram_tokens
      const { data: tokenData } = await supabase
        .from("instagram_tokens")
        .select("access_token, instagram_user_id, updated_at")
        .eq("club_id", clubId)
        .single();
      
      setInstagramConnected(!!(tokenData?.access_token && tokenData?.instagram_user_id));
      setInstagramLastSync(tokenData?.updated_at || null);
      setInstagramEnabled(!!(tokenData?.access_token && tokenData?.instagram_user_id));

      // Charger les horaires
      const hours = clubData.opening_hours || {};
      setOpeningHours({
        monday: hours.monday || { open: "09:00", close: "22:00", closed: false },
        tuesday: hours.tuesday || { open: "09:00", close: "22:00", closed: false },
        wednesday: hours.wednesday || { open: "09:00", close: "22:00", closed: false },
        thursday: hours.thursday || { open: "09:00", close: "22:00", closed: false },
        friday: hours.friday || { open: "09:00", close: "22:00", closed: false },
        saturday: hours.saturday || { open: "09:00", close: "22:00", closed: false },
        sunday: hours.sunday || { open: "09:00", close: "22:00", closed: false },
      });

    } catch (e) {
      console.error("[PageClub] Erreur:", e);
      Alert.alert("Erreur", e?.message || "Impossible de charger les données");
    } finally {
      setLoading(false);
    }
  }, [clubId]);

  // Fonction pour extraire le nom d'utilisateur Instagram depuis une URL
  const extractInstagramUsernameFromLink = useCallback((instagramLink) => {
    if (!instagramLink || !instagramLink.trim()) {
      setInstagramUsername("");
      return;
    }
    
    // Extraire le nom d'utilisateur depuis l'URL (ex: https://instagram.com/username)
    const match = instagramLink.match(/instagram\.com\/([^\/\?]+)/);
    if (match && match[1]) {
      setInstagramUsername(match[1].replace('@', ''));
    } else {
      // Si ce n'est pas une URL complète, vérifier si c'est juste un nom d'utilisateur
      const cleanUsername = instagramLink.trim().replace('@', '').replace('https://', '').replace('http://', '').replace('www.', '');
      if (cleanUsername && !cleanUsername.includes('/') && !cleanUsername.includes(' ')) {
        setInstagramUsername(cleanUsername);
      } else {
        setInstagramUsername("");
      }
    }
  }, []);

  useEffect(() => {
    loadClub();
  }, [loadClub]);

  // Mettre à jour le nom d'utilisateur Instagram quand le lien change
  useEffect(() => {
    extractInstagramUsernameFromLink(socialLinks.instagram);
  }, [socialLinks.instagram, extractInstagramUsernameFromLink]);

  const handleSave = useCallback(async () => {
    if (!clubId) return;

    try {
      setSaving(true);

      const updateData = {
        name: name.trim(),
        description: description.trim() || null,
        logo_url: logoUrl.trim() || null,
        call_button_enabled: callButtonEnabled,
        call_button_label: callButtonLabel.trim() || null,
        call_phone: callPhone.trim() || null,
        address: address.trim() || null,
        lat: clubLat,
        lng: clubLng,
        photos: photos.length > 0 ? photos : null,
        social_links: {
          facebook: socialLinks.facebook.trim() || null,
          instagram: socialLinks.instagram.trim() || null,
          website: socialLinks.website.trim() || null,
        },
        opening_hours: openingHours,
        instagram_enabled: instagramEnabled,
      };

      const { error } = await supabase
        .from("clubs")
        .update(updateData)
        .eq("id", clubId);

      if (error) throw error;

      Alert.alert("Succès", "Les modifications ont été enregistrées");
      loadClub();
    } catch (e) {
      console.error("[PageClub] Erreur sauvegarde:", e);
      Alert.alert("Erreur", e?.message || "Impossible de sauvegarder");
    } finally {
      setSaving(false);
    }
  }, [
    clubId,
    name,
    description,
    logoUrl,
    callButtonEnabled,
    callButtonLabel,
    callPhone,
    address,
    clubLat,
    clubLng,
    photos,
    socialLinks,
    openingHours,
    loadClub,
  ]);

  // Recherche d'adresse avec l'API adresse.data.gouv.fr
  const searchAddressAdresseDataGouv = useCallback(async (query, signal) => {
    try {
      const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`;
      const res = await fetch(url, {
        signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data || !data.features) return [];
      
      return data.features.map(feature => {
        const props = feature.properties;
        const coords = feature.geometry.coordinates; // [lng, lat]
        // Construire l'adresse en incluant toujours le numéro de rue si disponible
        // Format: "Numéro rue, Code postal Ville"
        let formattedAddress;
        
        // Toujours construire manuellement avec housenumber + street si disponibles
        // pour garantir que le numéro de rue est inclus
        if (props.housenumber) {
          const streetPart = `${props.housenumber} ${props.street || props.name || ''}`.trim();
          const cityPart = props.postcode && props.city 
            ? `${props.postcode} ${props.city}`
            : props.postcode || props.city || '';
          formattedAddress = cityPart ? `${streetPart}, ${cityPart}` : streetPart;
        } else if (props.label) {
          // Utiliser label si housenumber n'est pas disponible
          formattedAddress = props.label;
        } else {
          // Fallback: construire avec ce qu'on a
          const streetPart = `${props.street || props.name || ''}`.trim();
          const cityPart = props.postcode || props.city 
            ? `${props.postcode || ''} ${props.city || ''}`.trim()
            : '';
          formattedAddress = cityPart ? `${streetPart}, ${cityPart}` : streetPart;
        }
        
        return {
          name: formattedAddress,
          lat: coords[1],
          lng: coords[0],
          address: formattedAddress,
        };
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        throw e;
      }
      console.warn('[PageClub] adresse.data.gouv.fr error:', e);
      return null;
    }
  }, []);

  // Recherche d'adresse avec Nominatim (fallback)
  const searchAddressNominatim = useCallback(async (query, signal) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=fr&accept-language=fr`;
      const res = await fetch(url, {
        signal,
        headers: {
          'User-Agent': 'PadelSync-Club/1.0'
        }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data || []).map(item => ({
        name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        address: item.display_name,
      }));
    } catch (e) {
      if (e.name === 'AbortError') {
        throw e;
      }
      console.warn('[PageClub] Nominatim error:', e);
      return [];
    }
  }, []);

  // Recherche d'adresse avec autocomplétion (debouncing, cache, API principale + fallback)
  const searchAddress = useCallback(async (query) => {
    const trimmedQuery = (query || '').trim();
    
    if (trimmedQuery.length < 3) {
      setAddressSuggestions([]);
      return;
    }

    const cacheKey = trimmedQuery.toLowerCase();
    const cached = addressCache.current.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      setAddressSuggestions(cached.suggestions);
      return;
    }

    if (abortControllerAddress.current) {
      abortControllerAddress.current.abort();
    }
    abortControllerAddress.current = new AbortController();
    const signal = abortControllerAddress.current.signal;

    try {
      let suggestions = await searchAddressAdresseDataGouv(trimmedQuery, signal);
      
      if (!suggestions || suggestions.length === 0) {
        suggestions = await searchAddressNominatim(trimmedQuery, signal);
      }

      if (suggestions && suggestions.length > 0) {
        if (addressCache.current.size >= CACHE_MAX_SIZE) {
          const firstKey = addressCache.current.keys().next().value;
          addressCache.current.delete(firstKey);
        }
        addressCache.current.set(cacheKey, {
          suggestions,
          timestamp: Date.now()
        });
        setAddressSuggestions(suggestions);
      } else {
        setAddressSuggestions([]);
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        return;
      }
      console.warn('[PageClub] address search error:', e);
      setAddressSuggestions([]);
    }
  }, [searchAddressAdresseDataGouv, searchAddressNominatim]);

  // Géocoder une adresse complète
  const geocodeAddress = useCallback(async (addressText) => {
    if (!addressText || !addressText.trim()) return null;
    const trimmedAddress = addressText.trim();
    
    try {
      const urlAdresse = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(trimmedAddress)}&limit=1`;
      const resAdresse = await fetch(urlAdresse, {
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (resAdresse.ok) {
        const dataAdresse = await resAdresse.json();
        if (dataAdresse && dataAdresse.features && dataAdresse.features.length > 0) {
          const feature = dataAdresse.features[0];
          const coords = feature.geometry.coordinates;
          const lat = coords[1];
          const lng = coords[0];
          const props = feature.properties;
          const formattedAddress = props.label || trimmedAddress;
          
          if (lat >= 38 && lat <= 54 && lng >= -10 && lng <= 15) {
            return {
              address: formattedAddress,
              lat,
              lng,
            };
          }
        }
      }
      
      const urlNominatim = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmedAddress)}&limit=1&countrycodes=fr&accept-language=fr`;
      const resNominatim = await fetch(urlNominatim, {
        headers: {
          'User-Agent': 'PadelSync-Club/1.0'
        }
      });
      const dataNominatim = await resNominatim.json();
      if (dataNominatim && dataNominatim.length > 0) {
        const result = dataNominatim[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        if (lat >= 38 && lat <= 54 && lng >= -10 && lng <= 15) {
          return {
            address: trimmedAddress,
            lat,
            lng,
          };
        }
      }
      return null;
    } catch (e) {
      console.warn('[PageClub] geocode error:', e);
      return null;
    }
  }, []);

  // Connexion Instagram via token
  const connectInstagram = useCallback(() => {
    setInstagramTokenModalVisible(true);
  }, []);

  // Valider et connecter Instagram avec le token
  const handleConnectInstagramToken = useCallback(async () => {
    if (!instagramTokenInput || !instagramTokenInput.trim()) {
      Alert.alert("Erreur", "Le token ne peut pas être vide");
      return;
    }

    try {
      setValidatingToken(true);
      let token = instagramTokenInput.trim();

      // Vérifier le type de token et échanger si nécessaire
      let tokenInfo = null;
      try {
        tokenInfo = await getTokenInfo(token);
      } catch (infoError) {
        console.warn("[PageClub] Impossible de récupérer les infos du token:", infoError);
        // Continuer même si on ne peut pas récupérer les infos
      }
      
      // Si c'est un token court et qu'on a App ID/Secret, essayer de l'échanger
      let tokenExchanged = false;
      let longLivedTokenInfo = null;
      if (tokenType === "auto" || tokenType === "short") {
        if (tokenAppId && tokenAppSecret) {
          try {
            const longLivedToken = await exchangeShortLivedForLongLived(token, tokenAppId, tokenAppSecret);
            token = longLivedToken.access_token;
            tokenExchanged = true;
            longLivedTokenInfo = longLivedToken;
            // Ne pas afficher le message de succès maintenant, on l'affichera à la fin si tout fonctionne
          } catch (exchangeError) {
            console.warn("[PageClub] Échec échange token:", exchangeError);
            tokenExchanged = false;
            
            // Si l'échange échoue avec erreur 101, informer mais continuer avec le token court
            if (exchangeError.message && (exchangeError.message.includes("101") || exchangeError.message.includes("application") || exchangeError.message.includes("validating"))) {
              // Afficher un message informatif mais continuer le processus
              Alert.alert(
                "Avertissement - Token court",
                "L'échange en token long a échoué (erreur 101).\n\nCauses possibles :\n• L'application Facebook n'est pas correctement configurée\n• L'App ID ou App Secret est incorrect\n• L'application n'est pas en mode développement\n\nLe système continuera avec le token court fourni (valide 1-2h).\n\nPour obtenir un token long :\n• Utilisez directement un token long depuis Graph API Explorer\n• Ou configurez correctement votre application Facebook",
                [{ text: "Continuer", onPress: () => {} }]
              );
            } else {
              // Autre erreur, afficher un message mais continuer
              Alert.alert(
                "Avertissement",
                `L'échange en token long a échoué : ${exchangeError.message}\n\nLe système continuera avec le token fourni. Si c'est un token court, il expirera dans 1-2 heures.`,
                [{ text: "OK", onPress: () => {} }]
              );
            }
          }
        } else if (tokenInfo && tokenInfo.type === "SHORT") {
          // Token court détecté mais pas d'App ID/Secret fournis
          Alert.alert(
            "Token court détecté",
            "Vous avez fourni un token court (valide 1-2 heures).\n\nPour obtenir un token long (60 jours) :\n1. Utilisez directement un token long depuis Graph API Explorer\n2. Ou fournissez App ID et App Secret pour échange automatique",
            [{ text: "OK" }]
          );
        }
      }

      // Valider le token avec détails
      const validationResult = await validateInstagramToken(token);
      if (!validationResult.isValid) {
        Alert.alert(
          "Token invalide",
          validationResult.error || "Le token fourni n'est pas valide. Vérifiez que vous avez copié le token complet depuis Facebook Graph API Explorer."
        );
        setValidatingToken(false);
        return;
      }

      // Récupérer l'ID du compte Instagram Business
      let instagramUserId;
      try {
        instagramUserId = await getInstagramBusinessAccountId(token);
      } catch (instagramError) {
        console.error("[PageClub] Erreur récupération Instagram ID:", instagramError);
        let errorMessage = "Impossible de récupérer l'ID du compte Instagram Business.\n\n";
        
        if (instagramError.message && instagramError.message.includes("Aucune page Facebook trouvée")) {
          // Le message d'erreur de getInstagramBusinessAccountId contient déjà les solutions détaillées
          errorMessage = instagramError.message;
        } else if (instagramError.message && instagramError.message.includes("Permission")) {
          errorMessage += "❌ Permission manquante : " + instagramError.message + "\n\n";
          errorMessage += "Solution :\n";
          errorMessage += "• Régénérez le token dans Graph API Explorer\n";
          errorMessage += "• Assurez-vous de sélectionner la permission 'pages_show_list'\n";
          errorMessage += "• Sélectionnez votre PAGE Facebook (pas votre compte utilisateur) dans 'Utilisateur ou Page'";
        } else {
          errorMessage += "Erreur : " + instagramError.message + "\n\n";
          errorMessage += "Assurez-vous que :\n";
          errorMessage += "• Votre compte Instagram est un compte Business/Creator\n";
          errorMessage += "• Votre compte Instagram est connecté à une page Facebook\n";
          errorMessage += "• Le token a les permissions 'pages_show_list' et 'instagram_basic'";
        }
        
        Alert.alert("Erreur de configuration", errorMessage);
        setValidatingToken(false);
        return;
      }
      
      if (!instagramUserId) {
        Alert.alert(
          "Erreur de configuration",
          "Aucun compte Instagram Business trouvé.\n\nAssurez-vous que :\n• Votre compte Instagram est un compte Business/Creator\n• Votre compte Instagram est connecté à une page Facebook\n• Le token a les permissions 'pages_show_list' et 'instagram_basic'"
        );
        setValidatingToken(false);
        return;
      }

      // Sauvegarder dans la table instagram_tokens (upsert pour créer ou mettre à jour)
      const { error: updateError } = await supabase
        .from("instagram_tokens")
        .upsert({
          club_id: clubId,
          access_token: token,
          instagram_user_id: instagramUserId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'club_id'
        });

      if (updateError) throw updateError;

      // Afficher le message de succès du token long maintenant que tout a fonctionné
      let successMessage = "Instagram connecté avec succès !\n\nLa synchronisation est maintenant activée.";
      if (tokenExchanged && longLivedTokenInfo) {
        successMessage = `Token long obtenu et Instagram connecté avec succès !\n\nToken valide pour ${Math.floor(longLivedTokenInfo.expires_in / 86400)} jours.\nLa synchronisation est maintenant activée.`;
      }
      
      Alert.alert("Succès", successMessage);
      setInstagramTokenModalVisible(false);
      setInstagramTokenInput("");
      setTokenAppId("");
      setTokenAppSecret("");
      loadClub();
      
      // Synchroniser immédiatement après la connexion
      setInstagramSyncing(true);
      const syncResult = await syncInstagramPosts(clubId);
      setInstagramSyncing(false);
      
      if (syncResult.success && syncResult.newPosts > 0) {
        Alert.alert(
          "Synchronisation réussie",
          `${syncResult.newPosts} nouveau(x) post(s) Instagram synchronisé(s)`
        );
      }
    } catch (error) {
      console.error("[PageClub] Erreur connexion Instagram:", error);
      let errorMessage = error.message || "Impossible de connecter Instagram. Vérifiez votre token et réessayez.";
      
      // Messages d'erreur spécifiques
      if (error.message && error.message.includes("101")) {
        errorMessage = "Erreur 101 : Application Facebook non configurée.\n\nPour obtenir un token long :\n1. Utilisez directement un token long depuis Graph API Explorer\n2. Ou configurez correctement votre application Facebook avec App ID et App Secret";
      }
      
      Alert.alert("Erreur", errorMessage);
    } finally {
      setValidatingToken(false);
    }
  }, [instagramTokenInput, tokenType, tokenAppId, tokenAppSecret, clubId, loadClub]);

  // Synchronisation manuelle Instagram
  const handleSyncInstagram = useCallback(async () => {
    if (!clubId) return;
    
    try {
      setInstagramSyncing(true);
      const result = await syncInstagramPosts(clubId);
      
      if (result.success) {
        Alert.alert(
          "Synchronisation réussie",
          `${result.newPosts} nouveau(x) post(s) Instagram synchronisé(s)`
        );
        loadClub();
      } else {
        Alert.alert("Erreur", result.error || "Impossible de synchroniser Instagram");
      }
    } catch (error) {
      console.error("[PageClub] Erreur synchronisation:", error);
      Alert.alert("Erreur", error.message || "Impossible de synchroniser Instagram");
    } finally {
      setInstagramSyncing(false);
    }
  }, [clubId, loadClub]);

  // Fonctions d'upload (simplifiées, reprendre de manage.js si besoin)
  const pickAndUploadLogo = useCallback(async () => {
    // TODO: Implémenter l'upload de logo (code depuis manage.js)
    Alert.alert("Info", "Fonctionnalité à implémenter");
  }, [clubId]);

  const pickAndUploadPhoto = useCallback(async () => {
    // TODO: Implémenter l'upload de photos (code depuis manage.js)
    Alert.alert("Info", "Fonctionnalité à implémenter");
  }, [clubId, photos]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Informations générales */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleEmoji}>🏟️</Text>
            <Text style={styles.sectionTitle}>Informations générales</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom du club *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nom du club"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Description du club"
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Logo du club</Text>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logoPreview} />
            ) : null}
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={pickAndUploadLogo}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.uploadButtonText}>
                  {logoUrl ? "Changer le logo" : "Choisir un logo"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Adresse */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleEmoji}>🗺️</Text>
            <Text style={styles.sectionTitle}>Adresse</Text>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse du club</Text>
            <TextInput
              style={styles.input}
              value={addressInput}
              onChangeText={(text) => {
                setAddressInput(text);
                setAddress(text);
                
                if (debounceTimerAddress.current) {
                  clearTimeout(debounceTimerAddress.current);
                }
                
                if (text.trim().length < 3) {
                  setAddressSuggestions([]);
                  return;
                }
                
                debounceTimerAddress.current = setTimeout(() => {
                  searchAddress(text);
                }, 400);
              }}
              placeholder="Ex: 12 rue du Padel, 59000 Lille"
              placeholderTextColor="#999"
              autoCapitalize="words"
            />
            {addressSuggestions.length > 0 && (
              <View style={{ marginTop: 4, backgroundColor: '#f9fafb', borderRadius: 8, maxHeight: 150 }}>
                <ScrollView nestedScrollEnabled>
                  {addressSuggestions.map((sug, idx) => (
                    <Pressable
                      key={idx}
                      onPress={async () => {
                        setAddressInput(sug.address);
                        setAddress(sug.address);
                        setAddressSuggestions([]);
                        setGeocoding(true);
                        const geocoded = await geocodeAddress(sug.address);
                        setGeocoding(false);
                        if (geocoded) {
                          setClubLat(geocoded.lat);
                          setClubLng(geocoded.lng);
                        } else {
                          Alert.alert('Erreur', 'Impossible de géocoder cette adresse.');
                        }
                      }}
                      style={{
                        padding: 12,
                        borderBottomWidth: idx < addressSuggestions.length - 1 ? 1 : 0,
                        borderBottomColor: '#e5e7eb',
                      }}
                    >
                      <Text style={{ fontSize: 14, color: '#111827', fontWeight: '500' }}>{sug.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            {geocoding && (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={BRAND} />
                <Text style={{ fontSize: 12, color: '#6b7280' }}>Géocodage en cours...</Text>
              </View>
            )}
            {clubLat && clubLng && address && (
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', padding: 8, borderRadius: 8 }}>
                <Text style={{ fontSize: 12, color: '#15803d', flex: 1 }}>✓ {address}</Text>
                <Pressable
                  onPress={() => {
                    setClubLat(null);
                    setClubLng(null);
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close-circle" size={18} color="#dc2626" />
                </Pressable>
              </View>
            )}
          </View>
        </View>

        {/* Bouton d'appel */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleEmoji}>📞</Text>
            <Text style={styles.sectionTitle}>Bouton d'appel</Text>
          </View>
          <View style={styles.inputGroup}>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Activer le bouton d'appel</Text>
              <TouchableOpacity
                style={[styles.switch, callButtonEnabled && styles.switchActive]}
                onPress={() => setCallButtonEnabled(!callButtonEnabled)}
              >
                <View
                  style={[
                    styles.switchThumb,
                    callButtonEnabled && styles.switchThumbActive,
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>

          {callButtonEnabled && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Label du bouton</Text>
                <TextInput
                  style={styles.input}
                  value={callButtonLabel}
                  onChangeText={setCallButtonLabel}
                  placeholder={`Ex: Appeler ${name || "le club"}`}
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Numéro de téléphone</Text>
                <TextInput
                  style={styles.input}
                  value={callPhone}
                  onChangeText={setCallPhone}
                  placeholder="+33321000000"
                  placeholderTextColor="#999"
                  keyboardType="phone-pad"
                />
              </View>
            </>
          )}
        </View>

        {/* Horaires d'ouverture */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleEmoji}>⌚️</Text>
            <Text style={styles.sectionTitle}>Horaires d'ouverture</Text>
          </View>

          {[
            { key: "monday", label: "Lundi" },
            { key: "tuesday", label: "Mardi" },
            { key: "wednesday", label: "Mercredi" },
            { key: "thursday", label: "Jeudi" },
            { key: "friday", label: "Vendredi" },
            { key: "saturday", label: "Samedi" },
            { key: "sunday", label: "Dimanche" },
          ].map(({ key, label }) => {
            const dayHours = openingHours[key];
            return (
              <View key={key} style={styles.hoursRow}>
                <View style={styles.hoursDayRow}>
                  <Text style={styles.hoursDayLabel}>{label}</Text>
                  <TouchableOpacity
                    style={[styles.switch, !dayHours.closed && styles.switchActive]}
                    onPress={() =>
                      setOpeningHours({
                        ...openingHours,
                        [key]: { ...dayHours, closed: !dayHours.closed },
                      })
                    }
                  >
                    <View
                      style={[
                        styles.switchThumb,
                        !dayHours.closed && styles.switchThumbActive,
                      ]}
                    />
                  </TouchableOpacity>
                  <Text style={styles.hoursClosedLabel}>
                    {dayHours.closed ? "Fermé" : "Ouvert"}
                  </Text>
                </View>
                {!dayHours.closed && (
                  <View style={styles.hoursTimeRow}>
                    <TimePickerInput
                      label="Ouverture"
                      value={dayHours.open}
                      onChange={(time) =>
                        setOpeningHours({
                          ...openingHours,
                          [key]: { ...dayHours, open: time },
                        })
                      }
                    />
                    <TimePickerInput
                      label="Fermeture"
                      value={dayHours.close}
                      onChange={(time) =>
                        setOpeningHours({
                          ...openingHours,
                          [key]: { ...dayHours, close: time },
                        })
                      }
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Liens sociaux */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitleEmoji}>🌎</Text>
            <Text style={styles.sectionTitle}>Liens sociaux</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Facebook</Text>
            <TextInput
              style={styles.input}
              value={socialLinks.facebook}
              onChangeText={(text) =>
                setSocialLinks({ ...socialLinks, facebook: text })
              }
              placeholder="https://facebook.com/..."
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Instagram</Text>
            <TextInput
              style={styles.input}
              value={socialLinks.instagram}
              onChangeText={(text) =>
                setSocialLinks({ ...socialLinks, instagram: text })
              }
              placeholder="https://instagram.com/..."
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>

          {/* Synchronisation Instagram */}
          <View style={styles.inputGroup}>
            <View style={styles.instagramHeader}>
              <View style={styles.instagramHeaderLeft}>
                <Ionicons name="logo-instagram" size={20} color="#e1306c" />
                <Text style={styles.label}>Synchronisation Instagram</Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.switch,
                  instagramEnabled && styles.switchActive,
                ]}
                onPress={() => {
                  if (!instagramConnected && !instagramEnabled) {
                    Alert.alert(
                      "Instagram non connecté",
                      "Vous devez d'abord connecter votre compte Instagram pour activer la synchronisation.",
                      [{ text: "OK" }]
                    );
                    return;
                  }
                  setInstagramEnabled(!instagramEnabled);
                }}
              >
                <View
                  style={[
                    styles.switchThumb,
                    instagramEnabled && styles.switchThumbActive,
                  ]}
                />
              </TouchableOpacity>
            </View>

            {!instagramConnected ? (
              <TouchableOpacity
                style={styles.instagramConnectButton}
                onPress={connectInstagram}
              >
                <Ionicons name="logo-instagram" size={18} color="#fff" />
                <Text style={styles.instagramConnectButtonText}>
                  Connecter Instagram
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.instagramStatus}>
                <View style={styles.instagramStatusRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                  <Text style={styles.instagramStatusText}>
                    Instagram connecté
                  </Text>
                </View>
                {instagramLastSync && (
                  <Text style={styles.instagramLastSync}>
                    Dernière sync: {new Date(instagramLastSync).toLocaleString('fr-FR')}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.instagramSyncButton}
                  onPress={handleSyncInstagram}
                  disabled={instagramSyncing}
                >
                  {instagramSyncing ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={16} color="#fff" />
                      <Text style={styles.instagramSyncButtonText}>
                        Synchroniser maintenant
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Lien Instagram (affichage du profil) */}
          {instagramUsername && (
            <View style={styles.inputGroup}>
              <View style={styles.instagramLinkCard}>
                <Ionicons name="logo-instagram" size={20} color="#e1306c" />
                <View style={styles.instagramLinkInfo}>
                  <Text style={styles.instagramLinkLabel}>Profil Instagram</Text>
                  <Text style={styles.instagramLinkUsername}>@{instagramUsername}</Text>
                </View>
                <TouchableOpacity
                  style={styles.instagramOpenButton}
                  onPress={() => {
                    const url = `https://instagram.com/${instagramUsername}`;
                    Linking.openURL(url).catch(err => {
                      console.error('Erreur ouverture Instagram:', err);
                      Alert.alert('Erreur', 'Impossible d\'ouvrir Instagram');
                    });
                  }}
                >
                  <Ionicons name="open-outline" size={16} color="#fff" />
                  <Text style={styles.instagramOpenButtonText}>Ouvrir</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Site web</Text>
            <TextInput
              style={styles.input}
              value={socialLinks.website}
              onChangeText={(text) =>
                setSocialLinks({ ...socialLinks, website: text })
              }
              placeholder="https://..."
              placeholderTextColor="#999"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Bouton de sauvegarde */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving || !name.trim()}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Enregistrer les modifications</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal pour saisir le token Instagram */}
      <Modal
        visible={instagramTokenModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setInstagramTokenModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Connexion Instagram</Text>
              <TouchableOpacity
                onPress={() => {
                  setInstagramTokenModalVisible(false);
                  setInstagramTokenInput("");
                }}
              >
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.modalGuideSection}>
                <Text style={styles.modalGuideTitle}>📖 Guide rapide</Text>
                <View style={styles.modalGuideSteps}>
                  <Text style={styles.modalGuideStep}>
                    1. Allez sur{" "}
                    <Text style={styles.modalGuideLink}>developers.facebook.com/tools/explorer/</Text>
                  </Text>
                  <Text style={styles.modalGuideStep}>
                    2. Connectez-vous avec votre compte Facebook
                  </Text>
                  <Text style={styles.modalGuideStep}>
                    3. Dans "Meta App", sélectionnez "Graph API Explorer" (recommandé - pas de problème de réassociation)
                  </Text>
                  <Text style={[styles.modalGuideStep, { marginLeft: 20, fontSize: 13, color: "#6b7280" }]}>
                    💡 Si "Padel Sync" demande de réassocier et que ça ne fonctionne pas, utilisez "Graph API Explorer" à la place. Voir "SOLUTION_REASSOCIER_NE_FONCTIONNE_PAS.md"
                  </Text>
                  <Text style={styles.modalGuideStep}>
                    4. Dans "Utilisateur ou Page", sélectionnez votre PAGE Facebook (pas votre compte utilisateur)
                  </Text>
                  <Text style={[styles.modalGuideStep, { marginLeft: 20, fontSize: 13, color: "#6b7280" }]}>
                    💡 Comment faire : Cliquez sur le menu "Utilisateur ou Page", cherchez le nom de votre page (ex: "Hercule & Hops"), pas votre nom personnel. Voir le guide "GUIDE_SELECTIONNER_PAGE_FACEBOOK.md" pour plus de détails.
                  </Text>
                  <Text style={styles.modalGuideStep}>
                    5. Cliquez sur "Générer un token d'accès"
                  </Text>
                  <Text style={styles.modalGuideStep}>
                    7. Sélectionnez les permissions :
                  </Text>
                  <View style={styles.modalGuidePermissions}>
                    <Text style={styles.modalGuidePermission}>• instagram_basic</Text>
                    <Text style={styles.modalGuidePermission}>• pages_show_list</Text>
                    <Text style={styles.modalGuidePermission}>• pages_read_engagement</Text>
                  </View>
                  <Text style={styles.modalGuideStep}>
                    8. Copiez le token et collez-le ci-dessous
                  </Text>
                </View>
                <View style={[styles.modalGuideWarningBox, { backgroundColor: "#dbeafe", borderColor: "#3b82f6" }]}>
                  <Text style={[styles.modalGuideWarningTitle, { color: "#1e40af" }]}>ℹ️ Important : Supabase gratuit fonctionne</Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#1e40af" }]}>
                    Cette fonctionnalité fonctionne parfaitement avec un projet Supabase gratuit.
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#1e40af" }]}>
                    Aucune variable d'environnement n'est nécessaire - tout est stocké dans la base de données.
                  </Text>
                </View>
                <View style={[styles.modalGuideWarningBox, { backgroundColor: "#fee2e2", borderColor: "#ef4444" }]}>
                  <Text style={[styles.modalGuideWarningTitle, { color: "#991b1b" }]}>🚫 Pas d'accès au Dashboard ?</Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#991b1b" }]}>
                    Le problème d'accès Facebook Dashboard n'est PAS lié à Supabase.
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#991b1b" }]}>
                    Solutions :
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#991b1b" }]}>
                    • Utilisez l'app "Graph API Explorer" (par défaut) - pas besoin de configuration
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#991b1b" }]}>
                    • Utilisez une app existante (ex: "Padel Sync") dans Graph API Explorer
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#991b1b" }]}>
                    • Voir le guide "OBTENIR_TOKEN_SANS_DASHBOARD.md" pour plus d'options
                  </Text>
                </View>
                <View style={[styles.modalGuideWarningBox, { backgroundColor: "#fef3c7", borderColor: "#f59e0b" }]}>
                  <Text style={[styles.modalGuideWarningTitle, { color: "#92400e" }]}>⚠️ Erreur "Invalid platform app" ?</Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    Si vous voyez "Invalid platform app" :
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    • Utilisez l'app "Graph API Explorer" (par défaut) - elle fonctionne sans configuration
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    • Ou ajoutez une plateforme "Web" à votre app dans le Dashboard
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    • Voir "OBTENIR_TOKEN_SANS_DASHBOARD.md" section "Erreur Invalid platform app"
                  </Text>
                </View>
                <View style={[styles.modalGuideWarningBox, { backgroundColor: "#fef3c7", borderColor: "#f59e0b" }]}>
                  <Text style={[styles.modalGuideWarningTitle, { color: "#92400e" }]}>⚠️ Erreur "You don't have access" ?</Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    Si vous voyez "You don't have access. This feature isn't available to you yet." :
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    1. Allez sur developers.facebook.com/apps/
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    2. Sélectionnez votre application
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    3. Ajoutez le produit "Instagram Graph API"
                  </Text>
                  <Text style={[styles.modalGuideWarningText, { color: "#92400e" }]}>
                    4. Cliquez sur "Configurer" et suivez les instructions
                  </Text>
                </View>
                <View style={styles.modalGuideWarningBox}>
                  <Text style={styles.modalGuideWarningTitle}>💡 Astuce importante</Text>
                  <Text style={styles.modalGuideWarningText}>
                    Si vous avez une page Facebook connectée à Instagram, sélectionnez la PAGE dans "Utilisateur ou Page" plutôt que votre compte utilisateur. Cela évite l'erreur "Aucune page Facebook trouvée".
                  </Text>
                </View>
                <View style={styles.modalGuideWarningBox}>
                  <Text style={styles.modalGuideWarningTitle}>⚠️ Token long recommandé</Text>
                  <Text style={styles.modalGuideWarningText}>
                    Pour éviter que le token expire rapidement :
                  </Text>
                  <Text style={styles.modalGuideWarningText}>
                    • Option 1 : Utilisez directement un token long depuis Graph API Explorer (si l'app est en mode développement)
                  </Text>
                  <Text style={styles.modalGuideWarningText}>
                    • Option 2 : Fournissez App ID et App Secret ci-dessous pour échange automatique
                  </Text>
                </View>
                <View style={styles.modalGuidePermissionsBox}>
                  <Text style={styles.modalGuidePermissionsTitle}>📋 Permissions requises :</Text>
                  <View style={styles.modalGuidePermissionsList}>
                    <Text style={styles.modalGuidePermissionItem}>✓ instagram_basic</Text>
                    <Text style={styles.modalGuidePermissionItem}>✓ pages_show_list</Text>
                    <Text style={styles.modalGuidePermissionItem}>✓ pages_read_engagement</Text>
                  </View>
                  <Text style={styles.modalGuidePermissionsNote}>
                    Assurez-vous de sélectionner TOUTES ces permissions lors de la génération du token dans Graph API Explorer.
                  </Text>
                </View>
                <Text style={styles.modalGuideNote}>
                  ⚠️ Important : Votre compte Instagram doit être un compte Business/Creator et connecté à une page Facebook.
                </Text>
              </View>

              {/* App ID et App Secret pour échange automatique */}
              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>App ID (optionnel - pour token long)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={tokenAppId}
                  onChangeText={setTokenAppId}
                  placeholder="ID de votre application Facebook"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                />
                <Text style={styles.modalHelperText}>
                  Trouvable dans Paramètres {'>'} De base de votre app Facebook
                </Text>
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>App Secret (optionnel - pour token long)</Text>
                <TextInput
                  style={styles.modalInput}
                  value={tokenAppSecret}
                  onChangeText={setTokenAppSecret}
                  placeholder="Clé secrète de votre application"
                  placeholderTextColor="#999"
                  autoCapitalize="none"
                  secureTextEntry={true}
                />
                <Text style={styles.modalHelperText}>
                  Trouvable dans Paramètres {'>'} De base {'>'} Clé secrète de l'application
                </Text>
              </View>

              <View style={styles.modalInputGroup}>
                <Text style={styles.modalLabel}>Token d'accès Facebook/Instagram *</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  value={instagramTokenInput}
                  onChangeText={setInstagramTokenInput}
                  placeholder="Collez votre token ici..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3}
                  autoCapitalize="none"
                  secureTextEntry={false}
                />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => {
                    setInstagramTokenModalVisible(false);
                    setInstagramTokenInput("");
                    setTokenAppId("");
                    setTokenAppSecret("");
                  }}
                >
                  <Text style={styles.modalButtonTextCancel}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={handleConnectInstagramToken}
                  disabled={validatingToken || instagramSyncing || !instagramTokenInput.trim()}
                >
                  {validatingToken || instagramSyncing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.modalButtonTextConfirm}>Connecter</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f7fb",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sectionTitleEmoji: {
    fontSize: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#000",
    backgroundColor: "#fff",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  textAreaSmall: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  logoPreview: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: "#f3f4f6",
  },
  uploadButton: {
    backgroundColor: BRAND,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switch: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#d1d5db",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  switchActive: {
    backgroundColor: BRAND,
  },
  switchThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
  },
  switchThumbActive: {
    alignSelf: "flex-end",
  },
  saveButton: {
    backgroundColor: "#22c55e",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyText: {
    color: "#6b7280",
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    padding: 16,
  },
  hoursRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  hoursDayRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  hoursDayLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    flex: 1,
  },
  hoursClosedLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: 8,
    minWidth: 50,
  },
  hoursTimeRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  hoursTimeInput: {
    flex: 1,
  },
  hoursTimeLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 4,
  },
  hoursInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: "#000",
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  hoursInputText: {
    fontSize: 14,
    color: "#000",
    fontWeight: "500",
  },
  timePickerModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  timePickerModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
  timePickerModalHeader: {
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  timePickerModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#000",
    textAlign: "center",
  },
  timePicker: {
    width: "100%",
    height: 280,
  },
  timePickerModalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  timePickerModalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  timePickerCancelButton: {
    backgroundColor: "#ef4444",
  },
  timePickerConfirmButton: {
    backgroundColor: BRAND,
  },
  timePickerButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  instagramHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  instagramHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  instagramConnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#e1306c",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  instagramConnectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  instagramStatus: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  instagramStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  instagramStatusText: {
    fontSize: 14,
    color: "#22c55e",
    fontWeight: "600",
  },
  instagramLastSync: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  instagramSyncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  instagramLinkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  instagramLinkInfo: {
    flex: 1,
  },
  instagramLinkLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 2,
  },
  instagramLinkUsername: {
    fontSize: 14,
    fontWeight: "600",
    color: "#e1306c",
  },
  instagramOpenButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#e1306c",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  instagramOpenButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  instagramHelpText: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 8,
    fontStyle: "italic",
  },
  instagramHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  instagramHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  instagramConnectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#e1306c",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  instagramConnectButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  instagramStatus: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#f0fdf4",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#22c55e",
  },
  instagramStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  instagramStatusText: {
    fontSize: 14,
    color: "#22c55e",
    fontWeight: "600",
  },
  instagramLastSync: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  instagramSyncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  instagramSyncButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
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
    maxHeight: "90%",
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
  },
  modalScrollView: {
    maxHeight: 600,
  },
  modalGuideSection: {
    padding: 20,
    backgroundColor: "#f9fafb",
    marginBottom: 20,
  },
  modalGuideTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#000",
    marginBottom: 12,
  },
  modalGuideSteps: {
    gap: 8,
  },
  modalGuideStep: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  modalGuideLink: {
    color: BRAND,
    fontWeight: "600",
  },
  modalGuidePermissions: {
    marginLeft: 20,
    marginTop: 4,
    marginBottom: 4,
  },
  modalGuidePermission: {
    fontSize: 13,
    color: "#6b7280",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  modalGuideNote: {
    fontSize: 12,
    color: "#dc2626",
    marginTop: 12,
    fontStyle: "italic",
  },
  modalGuideWarningBox: {
    backgroundColor: "#fef3c7",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#fbbf24",
  },
  modalGuideWarningTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#92400e",
    marginBottom: 6,
  },
  modalGuideWarningText: {
    fontSize: 12,
    color: "#78350f",
    lineHeight: 18,
    marginTop: 4,
  },
  modalHelperText: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
    fontStyle: "italic",
  },
  modalGuidePermissionsBox: {
    backgroundColor: "#eff6ff",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#3b82f6",
  },
  modalGuidePermissionsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: 8,
  },
  modalGuidePermissionsList: {
    marginBottom: 8,
  },
  modalGuidePermissionItem: {
    fontSize: 12,
    color: "#1e40af",
    lineHeight: 20,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  modalGuidePermissionsNote: {
    fontSize: 11,
    color: "#1e40af",
    fontStyle: "italic",
    marginTop: 4,
  },
  modalInputGroup: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#000",
    backgroundColor: "#fff",
  },
  modalTextArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#f3f4f6",
  },
  modalButtonConfirm: {
    backgroundColor: BRAND,
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});

