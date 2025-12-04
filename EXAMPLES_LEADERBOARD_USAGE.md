# Exemples d'utilisation du composant Leaderboard

## 1. ClubScreen (`app/clubs/[id]/index.js`) - Top 5 compact

```javascript
// Imports à ajouter en haut du fichier
import Leaderboard from "../../../components/Leaderboard";
import { useEffect, useState } from "react";

// Dans le composant ClubPublicScreen, ajouter :
const [currentUserId, setCurrentUserId] = useState(null);

// Dans un useEffect, récupérer l'ID utilisateur :
useEffect(() => {
  (async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user?.id) {
      setCurrentUserId(userData.user.id);
    }
  })();
}, []);

// Dans le JSX, après la section "Groupes du club" (ligne ~503) :
{clubId && currentUserId && (
  <View style={styles.section}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Ionicons name="trophy" size={20} color="#e0ff00" />
      <Text style={{ fontSize: 18, fontWeight: "700", color: "#e0ff00" }}>
        Top 5 du club
      </Text>
    </View>
    <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 12 }}>
      <Leaderboard
        scope="club"
        clubId={clubId}
        currentUserId={currentUserId}
        variant="compact"
        limit={5}
        highlightCurrentUser={true}
      />
    </View>
  </View>
)}
```

## 2. GroupScreen (`app/(tabs)/groupes.js`) - Classement compact du groupe actif

```javascript
// Imports à ajouter en haut du fichier
import Leaderboard from "../../components/Leaderboard";

// Dans le composant GroupesScreen, après la sélection du groupe actif :
// (Chercher où activeGroup est utilisé, probablement vers la ligne 2000-3000)

{activeGroup?.id && meId && (
  <View style={s.card}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <Ionicons name="trophy" size={20} color="#e0ff00" />
      <Text style={s.sectionTitle}>Classement du groupe</Text>
    </View>
    <View style={{ backgroundColor: "#fff", borderRadius: 12, padding: 12 }}>
      <Leaderboard
        scope="group"
        groupId={activeGroup.id}
        currentUserId={meId}
        variant="compact"
        highlightCurrentUser={true}
      />
    </View>
  </View>
)}
```

## 3. PlayerProfileScreen (`app/profiles/[id].js`) - Résumé des positions

```javascript
// Imports à ajouter en haut du fichier
import PlayerRankSummary from "../../components/PlayerRankSummary";
import { useUserRole } from "../../lib/roles";
import { useActiveGroup } from "../../lib/activeGroup";
import { useEffect, useState } from "react";

// Dans le composant ProfileScreen, ajouter :
const { clubId } = useUserRole();
const { activeGroup } = useActiveGroup();
const [city, setCity] = useState(null);

// Récupérer la ville du joueur
useEffect(() => {
  (async () => {
    if (!id) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('address_home, address_work')
      .eq('id', id)
      .maybeSingle();
    
    if (profile) {
      const homeCity = profile.address_home?.city;
      const workCity = profile.address_work?.city;
      let userCity = homeCity || workCity;
      
      if (!userCity) {
        const homeAddress = profile.address_home?.address;
        const workAddress = profile.address_work?.address;
        const addressToParse = homeAddress || workAddress;
        
        if (addressToParse && typeof addressToParse === 'string') {
          const parts = addressToParse.split(',').map(p => p.trim());
          if (parts.length >= 2) {
            userCity = parts[1];
          }
        }
      }
      
      if (userCity) {
        setCity(userCity);
      }
    }
  })();
}, [id]);

// Dans le JSX, après la section "Résumé" (ligne ~206) :
<View style={s.card}>
  <Text style={s.sectionTitle}>Mes classements</Text>
  <PlayerRankSummary
    playerId={id}
    clubId={clubId}
    groupId={activeGroup?.id}
    city={city}
    showGlobal={true}
    showClub={!!clubId}
    showGroup={!!activeGroup?.id}
  />
</View>
```

