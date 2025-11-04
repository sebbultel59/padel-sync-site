// Script pour enrichir les clubs avec les numéros de téléphone depuis Google Places API
// Usage: node scripts/enrich_clubs_phone.js

const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const GOOGLE_PLACES_API_KEY = 'AIzaSyDOGG1uZdCrOUo5GRV0ReYM7LY7ZUFf-eM';
const GOOGLE_PLACES_API_URL = 'https://places.googleapis.com/v1';

// Helper pour faire des requêtes HTTPS POST (nécessaire pour la nouvelle API)
function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + (urlObj.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            const errorData = JSON.parse(data);
            reject(new Error(`HTTP ${res.statusCode}: ${errorData.error?.message || data}`));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (e) {
          reject(new Error(`Erreur parsing JSON: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

// Helper pour faire des requêtes HTTPS GET (pour l'ancienne API si nécessaire)
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Erreur parsing JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Configuration Supabase (même structure que import_clubs_from_kml.js)
const SUPABASE_URL = process.env.SUPABASE_URL || "https://iieiggyqcncbkjwsdcxl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWlnZ3lxY25jYmtqd3NkY3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjk3MzQsImV4cCI6MjA3Mjg0NTczNH0.tTCN1140MVgNswkq5HSXzC3fS0Uuylb-5ZP6h1vTWMI";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Configurez SUPABASE_URL et SUPABASE_ANON_KEY');
  console.error('Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/enrich_clubs_phone.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Fonction pour rechercher un lieu via Google Places API (New) Text Search
async function searchPlaceByNameAndLocation(name, address, lat, lng) {
  try {
    // 1. Essayer d'abord une recherche textuelle avec le nom et l'adresse
    let query = name;
    if (address) {
      query += ` ${address}`;
    }
    
    const searchUrl = `${GOOGLE_PLACES_API_URL}/places:searchText`;
    const requestBody = {
      textQuery: query,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 10000.0 // 10km
        }
      }
    };
    
    const data = await httpsPost(searchUrl, requestBody);
    
    if (data.places && data.places.length > 0) {
      console.log(`    ✅ Text Search trouvé: "${data.places[0].displayName?.text || 'Sans nom'}"`);
      return data.places[0].id;
    }
    
    // 2. Si pas de résultat, essayer avec juste le nom
    const nameOnlyBody = {
      textQuery: name,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 5000.0 // 5km
        }
      }
    };
    
    const nameOnlyData = await httpsPost(searchUrl, nameOnlyBody);
    
    if (nameOnlyData.places && nameOnlyData.places.length > 0) {
      console.log(`    ✅ Text Search (nom seul) trouvé: "${nameOnlyData.places[0].displayName?.text || 'Sans nom'}"`);
      return nameOnlyData.places[0].id;
    }
    
    // 3. Essayer Nearby Search
    const nearbyUrl = `${GOOGLE_PLACES_API_URL}/places:searchNearby`;
    const nearbyBody = {
      includedTypes: ['gym', 'sports_complex'],
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 1000.0 // 1km
        }
      }
    };
    
    const nearbyData = await httpsPost(nearbyUrl, nearbyBody);
    
    if (nearbyData.places && nearbyData.places.length > 0) {
      // Trouver le résultat le plus proche qui correspond au nom
      const nameLower = name.toLowerCase();
      const matches = nearbyData.places.filter(p => {
        const resultName = (p.displayName?.text || '').toLowerCase();
        return resultName.includes(nameLower) || 
               nameLower.includes(resultName) ||
               resultName.replace(/\s+/g, '').includes(nameLower.replace(/\s+/g, '')) ||
               nameLower.replace(/\s+/g, '').includes(resultName.replace(/\s+/g, ''));
      });
      
      if (matches.length > 0) {
        console.log(`    ✅ Nearby Search trouvé: "${matches[0].displayName?.text || 'Sans nom'}"`);
        return matches[0].id;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`  Erreur recherche lieu pour "${name}":`, error.message);
    if (error.message && error.message.includes('REQUEST_DENIED')) {
      throw error; // Propager l'erreur pour arrêter le script
    }
    return null;
  }
}

// Fonction pour obtenir les détails d'un lieu (incluant le téléphone)
async function getPlaceDetails(placeId) {
  try {
    const detailsUrl = `${GOOGLE_PLACES_API_URL}/places/${placeId}`;
    const options = {
      hostname: 'places.googleapis.com',
      port: 443,
      path: `/v1/places/${placeId}`,
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber'
      }
    };
    
    const data = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Erreur parsing JSON: ${e.message}`));
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
    
    if (data) {
      return {
        phone: data.nationalPhoneNumber || data.internationalPhoneNumber || null,
        name: data.displayName?.text || 'Sans nom',
        formattedAddress: data.formattedAddress || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error(`  Erreur détails lieu (place_id: ${placeId}):`, error.message);
    return null;
  }
}

// Fonction pour enrichir un club
async function enrichClub(club) {
  console.log(`\n📞 Traitement: ${club.name}`);
  
  // Si déjà un téléphone, skip
  if (club.phone) {
    console.log(`  ⏭️  Déjà un téléphone: ${club.phone}`);
    return { updated: false, reason: 'already_has_phone' };
  }
  
  // Vérifier que les coordonnées sont valides
  if (!club.lat || !club.lng || !Number.isFinite(club.lat) || !Number.isFinite(club.lng)) {
    console.log(`  ⚠️  Coordonnées invalides: lat=${club.lat}, lng=${club.lng}`);
    return { updated: false, reason: 'invalid_coordinates' };
  }
  
  // Rechercher le lieu via Google Places
  const placeId = await searchPlaceByNameAndLocation(club.name, club.address, club.lat, club.lng);
  
  if (!placeId) {
    console.log(`  ⚠️  Lieu non trouvé sur Google Places (nom: "${club.name}", coord: ${club.lat}, ${club.lng})`);
    return { updated: false, reason: 'place_not_found' };
  }
  
  console.log(`  ✅ Lieu trouvé (place_id: ${placeId})`);
  
  // Obtenir les détails (téléphone)
  const details = await getPlaceDetails(placeId);
  
  if (!details || !details.phone) {
    console.log(`  ⚠️  Pas de téléphone trouvé pour ce lieu`);
    return { updated: false, reason: 'no_phone_in_details' };
  }
  
  // Nettoyer le numéro de téléphone (enlever espaces, parenthèses, etc.)
  const cleanPhone = details.phone.replace(/[\s\(\)\-]/g, '');
  
  console.log(`  📞 Téléphone trouvé: ${details.phone} (nettoyé: ${cleanPhone})`);
  
  // Mettre à jour dans Supabase
  const { error } = await supabase
    .from('clubs')
    .update({ phone: cleanPhone })
    .eq('id', club.id);
  
  if (error) {
    console.error(`  ❌ Erreur mise à jour:`, error.message);
    return { updated: false, reason: 'update_error', error: error.message };
  }
  
  console.log(`  ✅ Mis à jour avec succès!`);
  return { updated: true, phone: cleanPhone };
}

// Fonction principale
async function main() {
  console.log('🚀 Début de l\'enrichissement des clubs avec les numéros de téléphone\n');
  
  // Charger tous les clubs sans téléphone et avec coordonnées
  const { data: clubs, error } = await supabase
    .from('clubs')
    .select('id, name, address, lat, lng, phone')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .is('phone', null); // Uniquement ceux sans téléphone
  
  if (error) {
    console.error('❌ Erreur chargement clubs:', error);
    process.exit(1);
  }
  
  if (!clubs || clubs.length === 0) {
    console.log('✅ Tous les clubs ont déjà un numéro de téléphone!');
    process.exit(0);
  }
  
  console.log(`📊 ${clubs.length} club(s) à enrichir\n`);
  
  const stats = {
    total: clubs.length,
    updated: 0,
    skipped: 0,
    errors: 0
  };
  
  // Traiter chaque club avec un délai pour respecter les quotas API
  for (let i = 0; i < clubs.length; i++) {
    const club = clubs[i];
    console.log(`[${i + 1}/${clubs.length}]`);
    
    const result = await enrichClub(club);
    
    if (result.updated) {
      stats.updated++;
    } else if (result.reason === 'already_has_phone') {
      stats.skipped++;
    } else {
      stats.skipped++;
    }
    
    // Délai entre les requêtes pour respecter les quotas (100 requêtes/seconde pour Text Search)
    // On attend 200ms entre chaque requête pour être sûr
    if (i < clubs.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Statistiques:');
  console.log(`  ✅ Mis à jour: ${stats.updated}`);
  console.log(`  ⏭️  Ignorés: ${stats.skipped}`);
  console.log(`  📊 Total: ${stats.total}`);
  console.log('='.repeat(50));
}

// Exécuter
main().catch(console.error);
