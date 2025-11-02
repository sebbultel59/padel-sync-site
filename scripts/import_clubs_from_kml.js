// scripts/import_clubs_from_kml.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');
let XMLParser;
try { XMLParser = require('fast-xml-parser').XMLParser; } catch {
  console.error('Installez fast-xml-parser: npm i -D fast-xml-parser');
  process.exit(1);
}
let AdmZip;
try { AdmZip = require('adm-zip'); } catch {
  AdmZip = null;
  console.warn('adm-zip non installé, les fichiers KMZ ne pourront pas être traités');
}

// Charger les variables d'environnement
// Vous pouvez les définir de deux façons :
// 1. Variables d'environnement : export SUPABASE_URL=... && export SUPABASE_ANON_KEY=...
// 2. Ligne de commande : SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/import_clubs_from_kml.js fichier.kmz
// 
// Valeurs par défaut depuis config/env.js (à adapter si nécessaire):
// SUPABASE_URL = "https://iieiggyqcncbkjwsdcxl.supabase.co"
// SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

const SUPABASE_URL = process.env.SUPABASE_URL || "https://iieiggyqcncbkjwsdcxl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWlnZ3lxY25jYmtqd3NkY3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjk3MzQsImV4cCI6MjA3Mjg0NTczNH0.tTCN1140MVgNswkq5HSXzC3fS0Uuylb-5ZP6h1vTWMI";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Configurez SUPABASE_URL et SUPABASE_ANON_KEY');
  console.error('Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/import_clubs_from_kml.js fichier.kml|kmz');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function extractCoord(coordinates) {
  if (!coordinates) return null;
  // Les coordonnées KML sont généralement au format "lng,lat" ou "lng,lat,altitude"
  const parts = String(coordinates).trim().split(',').map(s => s.trim());
  const lng = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Vérifier que les coordonnées sont dans des limites raisonnables (France métropolitaine + DOM-TOM approximatifs)
  // Élargir un peu les limites pour inclure les DOM-TOM et les erreurs de géocodage mineures
  if (lat < 40 || lat > 52 || lng < -7 || lng > 12) {
    console.warn(`Coordonnées hors limites France: lat=${lat}, lng=${lng}`);
    return null;
  }
  return { lat, lng };
}

// Nettoyer et préparer des variantes d'adresse
function prepareAddressVariants(address) {
  if (!address || !address.trim()) return [];
  
  const cleaned = address.trim();
  const variants = new Set([cleaned]);
  
  // Sans "France" à la fin
  const withoutFrance = cleaned.replace(/,\s*France\s*$/i, '').trim();
  if (withoutFrance !== cleaned) variants.add(withoutFrance);
  
  // Extraire code postal et ville
  const cpMatch = cleaned.match(/(\d{5})\s+([^,]+?)(?:\s*,\s*|$)/);
  if (cpMatch) {
    variants.add(`${cpMatch[1]} ${cpMatch[2]}`);
    variants.add(cpMatch[2]); // Juste la ville
  }
  
  // Si l'adresse contient des virgules, essayer chaque partie
  if (cleaned.includes(',')) {
    const parts = cleaned.split(',').map(p => p.trim()).filter(p => p.length > 3);
    // Prendre la dernière partie (généralement ville)
    if (parts.length > 0) variants.add(parts[parts.length - 1]);
    // Prendre code postal + ville si présent
    const lastPart = parts[parts.length - 1];
    const cpInLast = lastPart.match(/(\d{5})\s+(.+)/);
    if (cpInLast) {
      variants.add(cpInLast[2]);
      variants.add(cpInLast[1] + ' ' + cpInLast[2]);
    }
  }
  
  // Essayer juste le nom de la ville (sans la rue)
  const cityMatch = cleaned.match(/,\s*(\d{5}\s+[^,]+)/);
  if (cityMatch) {
    variants.add(cityMatch[1]);
  }
  
  // Nettoyer les caractères spéciaux
  variants.add(cleaned.replace(/[<>]/g, ''));
  
  return Array.from(variants).filter(v => v && v.length > 3);
}

// Géocoder une adresse en coordonnées GPS (utilise Nominatim, service gratuit)
// Essaie plusieurs variantes de l'adresse pour maximiser les chances de succès
async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;
  
  const variants = prepareAddressVariants(address);
  
  // Essayer chaque variante jusqu'à trouver un résultat
  for (const variant of variants) {
    const coords = await geocodeSingleAddress(variant);
    if (coords) {
      return coords;
    }
    // Délai entre chaque tentative (1 seconde minimum)
    await new Promise(resolve => setTimeout(resolve, 1100));
  }
  
  return null;
}

// Géocoder une seule adresse avec plusieurs stratégies
function geocodeSingleAddress(address) {
  return new Promise((resolve) => {
    let resolved = false;
    
    // Fonction pour vérifier et retourner les coordonnées
    const checkAndResolve = (lat, lng) => {
      if (!resolved && Number.isFinite(lat) && Number.isFinite(lng)) {
        // Vérifier que c'est bien en France (mais très tolérant pour inclure DOM-TOM et erreurs mineures)
        if (lat >= 38 && lat <= 54 && lng >= -10 && lng <= 15) {
          resolved = true;
          resolve({ lat, lng });
          return true;
        }
      }
      return false;
    };
    
    try {
      // Essayer avec limit=5 pour avoir plus de résultats
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=5&countrycodes=fr&accept-language=fr`;
      const urlObj = new URL(url);
      
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'PadelSync-ClubImporter/1.0' // Nominatim exige un User-Agent
        }
      };
      
      https.get(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (resolved) return;
          
          try {
            const jsonData = JSON.parse(data);
            if (jsonData && jsonData.length > 0) {
              // Essayer tous les résultats jusqu'à trouver un valide
              for (const result of jsonData) {
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);
                if (checkAndResolve(lat, lng)) {
                  return;
                }
              }
            }
          } catch (e) {
            // Ignorer les erreurs de parsing
          }
          if (!resolved) resolve(null);
        });
      }).on('error', (e) => {
        if (!resolved) resolve(null);
      });
      
      // Timeout de 15 secondes
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, 15000);
    } catch (e) {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }
  });
}

async function parseKML(kmlContent, geocode = true) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const json = parser.parse(kmlContent);
  
  // Extraire tous les Placemark, qu'ils soient directement dans Document ou dans Folder(s)
  const pms = [];
  
  // Placemark directement dans Document
  const docPlacemarks = json?.kml?.Document?.Placemark;
  if (docPlacemarks) {
    const arr = Array.isArray(docPlacemarks) ? docPlacemarks : [docPlacemarks];
    pms.push(...arr);
  }
  
  // Placemark dans Folder(s)
  const folders = json?.kml?.Document?.Folder;
  if (folders) {
    const folderArr = Array.isArray(folders) ? folders : [folders];
    for (const folder of folderArr) {
      if (folder?.Placemark) {
        const folderPlacemarks = Array.isArray(folder.Placemark) ? folder.Placemark : [folder.Placemark];
        pms.push(...folderPlacemarks);
      }
    }
  }
  
  const clubs = [];
  let geocoded = 0;
  let skipped = 0;
  let withDirectCoords = 0;
  const total = pms.length;
  
  for (let i = 0; i < pms.length; i++) {
    const pm = pms[i];
    if (!pm) continue;
    
    // Afficher la progression tous les 50 clubs
    if ((i + 1) % 50 === 0 || i === 0) {
      console.log(`Traitement: ${i + 1}/${total} (${Math.round((i + 1) / total * 100)}%)`);
    }
    
    let name = pm.name || 'Club';
    let address = pm.address || '';
    let outdoor = 0;
    
    // Extraire les données depuis ExtendedData
    const dataArr = pm?.ExtendedData?.Data;
    const datas = Array.isArray(dataArr) ? dataArr : (dataArr ? [dataArr] : []);
    for (const d of datas) {
      if (d['@_name'] === 'Nom du club' && d.value) {
        name = String(d.value).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      }
      if (d['@_name'] === 'Adresse' && d.value) {
        address = String(d.value).trim();
      }
      // Gérer "Indoors pistes" et "Outdoor pistes"
      if (d['@_name'] === 'Outdoor pistes' && d.value) {
        outdoor = parseInt(d.value, 10) || 0;
      }
      if (d['@_name'] === 'Indoors pistes' && d.value && !outdoor) {
        // Si pas de outdoor, on garde 0 pour outdoor_pistes
      }
    }
    
    // Essayer d'extraire les coordonnées depuis Point
    let coords = extractCoord(pm?.Point?.coordinates);
    
    if (coords) {
      withDirectCoords++;
    }
    
    // Si pas de coordonnées mais une adresse, géocoder avec plusieurs tentatives
    if (!coords && address && geocode) {
      // Essayer aussi avec l'adresse depuis ExtendedData si différente
      let addressToGeocode = address;
      const addressData = datas.find(d => d['@_name'] === 'Adresse');
      if (addressData && addressData.value && String(addressData.value).trim() !== address.trim()) {
        // Essayer les deux adresses
        coords = await geocodeAddress(address);
        if (!coords) {
          await new Promise(r => setTimeout(r, 1100));
          coords = await geocodeAddress(String(addressData.value).trim());
        }
      } else {
        coords = await geocodeAddress(address);
      }
      
      if (coords) geocoded++;
      // Afficher la progression du géocodage
      if (geocoded > 0 && geocoded % 10 === 0) {
        console.log(`  Géocodage: ${geocoded} adresses géocodées...`);
      }
    }
    
    // Si toujours pas de coordonnées, on skip ce club mais on le note
    if (!coords) {
      skipped++;
      // Logger les clubs sans coordonnées pour analyse (optionnel)
      if (skipped <= 10 || skipped % 50 === 0) {
        console.warn(`  ⚠️  Skippé: "${name}" - Adresse: "${address.substring(0, 50)}..."`);
      }
      continue;
    }
    
    // Nettoyer le nom (peut être un nombre dans certains cas)
    if (typeof name === 'number') {
      // Si le nom est un nombre, essayer de trouver le vrai nom dans ExtendedData
      const clubNameData = datas.find(d => d['@_name'] === 'Nom du club');
      if (clubNameData && clubNameData.value) {
        name = String(clubNameData.value).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      } else {
        name = `Club ${name}`;
      }
    }
    
    clubs.push({ name, address, lat: coords.lat, lng: coords.lng, outdoor_pistes: outdoor });
  }
  
  console.log(`\n📊 Résumé:`);
  console.log(`  Clubs avec coordonnées directes: ${withDirectCoords}`);
  console.log(`  Clubs géocodés: ${geocoded}`);
  console.log(`  Clubs sans coordonnées: ${skipped}`);
  console.log(`  Total de clubs importables: ${clubs.length}`);
  
  return clubs;
}

async function importClubs(clubs) {
  let created = 0;
  let updated = 0;
  let errors = 0;
  
  for (const club of clubs) {
    try {
      const { data: existing, error: selectError } = await supabase
        .from('clubs')
        .select('id')
        .eq('name', club.name)
        .maybeSingle();
      
      if (selectError) throw selectError;
      
      if (existing?.id) {
        const { error: updateError } = await supabase
          .from('clubs')
          .update(club)
          .eq('id', existing.id);
        
        if (updateError) throw updateError;
        updated++;
        if (updated % 50 === 0) {
          console.log(`  Import: ${updated} mis à jour, ${created} créés...`);
        }
      } else {
        const { error: insertError } = await supabase
          .from('clubs')
          .insert(club);
        
        if (insertError) throw insertError;
        created++;
        if (created % 50 === 0) {
          console.log(`  Import: ${created} créés, ${updated} mis à jour...`);
        }
      }
    } catch (e) {
      errors++;
      console.warn(`  Erreur pour "${club.name}":`, e.message);
    }
  }
  
  console.log(`\n✅ Import terminé: ${created} créés, ${updated} mis à jour, ${errors} erreurs`);
}

function readKMLContent(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.kmz') {
    if (!AdmZip) {
      console.error('Pour importer des fichiers KMZ, installez adm-zip: npm i -D adm-zip');
      process.exit(1);
    }
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    // Chercher le fichier .kml dans l'archive
    const kmlEntry = entries.find(e => e.entryName.toLowerCase().endsWith('.kml'));
    if (!kmlEntry) {
      throw new Error('Aucun fichier KML trouvé dans le fichier KMZ');
    }
    return kmlEntry.getData().toString('utf-8');
  } else {
    // Fichier KML normal
    return fs.readFileSync(filePath, 'utf-8');
  }
}

async function main() {
  const file = process.argv[2];
  const skipGeocode = process.argv.includes('--no-geocode'); // Option pour désactiver le géocodage (plus rapide)
  
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node scripts/import_clubs_from_kml.js path/to/file.kml|kmz [--no-geocode]');
    console.error('  --no-geocode: Ne pas géocoder les adresses sans coordonnées (plus rapide mais moins de clubs)');
    process.exit(1);
  }
  
  try {
    const content = readKMLContent(file);
    console.log('Parsing du fichier KML...');
    const clubs = await parseKML(content, !skipGeocode);
    console.log(`\nClubs parsés avec coordonnées: ${clubs.length}`);
    
    if (clubs.length > 0) {
      console.log('\nImport dans Supabase...');
      await importClubs(clubs);
      console.log('\n✅ Terminé.');
    } else {
      console.log('\n⚠️  Aucun club avec coordonnées trouvé.');
      if (!skipGeocode) {
        console.log('Essayez de vérifier le format du fichier KML.');
      }
    }
  } catch (e) {
    console.error('Erreur:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { parseKML, importClubs };


