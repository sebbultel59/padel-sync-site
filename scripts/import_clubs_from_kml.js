// scripts/import_clubs_from_kml.js
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
let XMLParser;
try { XMLParser = require('fast-xml-parser').XMLParser; } catch {
  console.error('Installez fast-xml-parser: npm i -D fast-xml-parser');
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Configurez SUPABASE_URL et SUPABASE_ANON_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function extractCoord(coordinates) {
  if (!coordinates) return null;
  const [lngS, latS] = String(coordinates).trim().split(',');
  const lat = parseFloat(latS); const lng = parseFloat(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function parseKML(kmlContent) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const json = parser.parse(kmlContent);
  const pms = json?.kml?.Document?.Placemark || [];
  const arr = Array.isArray(pms) ? pms : [pms];
  const clubs = [];
  for (const pm of arr) {
    if (!pm) continue;
    let name = pm.name || 'Club';
    let address = pm.address || '';
    let outdoor = 0;
    const dataArr = pm?.ExtendedData?.Data;
    const datas = Array.isArray(dataArr) ? dataArr : (dataArr ? [dataArr] : []);
    for (const d of datas) {
      if (d['@_name'] === 'Nom du club' && d.value) name = String(d.value).replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      if (d['@_name'] === 'Adresse' && d.value) address = String(d.value).trim();
      if (d['@_name'] === 'Outdoor pistes' && d.value) outdoor = parseInt(d.value, 10) || 0;
    }
    const coords = extractCoord(pm?.Point?.coordinates);
    if (!coords) continue;
    clubs.push({ name, address, lat: coords.lat, lng: coords.lng, outdoor_pistes: outdoor });
  }
  return clubs;
}

async function importClubs(clubs) {
  for (const club of clubs) {
    const { data: existing } = await supabase.from('clubs').select('id').eq('name', club.name).maybeSingle();
    if (existing?.id) {
      await supabase.from('clubs').update(club).eq('id', existing.id);
      console.log('MAJ:', club.name);
    } else {
      await supabase.from('clubs').insert(club);
      console.log('Créé:', club.name);
    }
  }
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node scripts/import_clubs_from_kml.js path/to/file.kml');
    process.exit(1);
  }
  const content = fs.readFileSync(file, 'utf-8');
  const clubs = parseKML(content);
  console.log('Clubs parsés:', clubs.length);
  await importClubs(clubs);
  console.log('Terminé.');
}

if (require.main === module) main();

module.exports = { parseKML, importClubs };


