// Script pour lister tous les clubs sans numéro de téléphone
// Usage: node scripts/list_clubs_without_phone.js

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Configuration Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "https://iieiggyqcncbkjwsdcxl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWlnZ3lxY25jYmtqd3NkY3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjk3MzQsImV4cCI6MjA3Mjg0NTczNH0.tTCN1140MVgNswkq5HSXzC3fS0Uuylb-5ZP6h1vTWMI";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Configurez SUPABASE_URL et SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('🔍 Récupération des clubs sans numéro de téléphone...\n');
  
  // Charger tous les clubs sans téléphone
  const { data: clubs, error } = await supabase
    .from('clubs')
    .select('id, name, address, lat, lng, phone')
    .or('phone.is.null,phone.eq.')
    .order('name');
  
  if (error) {
    console.error('❌ Erreur chargement clubs:', error);
    process.exit(1);
  }
  
  if (!clubs || clubs.length === 0) {
    console.log('✅ Tous les clubs ont un numéro de téléphone!');
    process.exit(0);
  }
  
  console.log(`📊 ${clubs.length} club(s) sans numéro de téléphone\n`);
  
  // Générer le contenu CSV
  let csvContent = 'ID,Nom,Adresse,Latitude,Longitude\n';
  let txtContent = 'LISTE DES CLUBS SANS NUMÉRO DE TÉLÉPHONE\n';
  txtContent += '='.repeat(80) + '\n\n';
  
  clubs.forEach((club, index) => {
    const id = club.id || '';
    const name = (club.name || '').replace(/,/g, ';'); // Remplacer les virgules pour le CSV
    const address = (club.address || '').replace(/,/g, ';');
    const lat = club.lat || '';
    const lng = club.lng || '';
    
    // CSV
    csvContent += `${id},"${name}","${address}",${lat},${lng}\n`;
    
    // TXT formaté
    txtContent += `${index + 1}. ${name}\n`;
    if (address) txtContent += `   Adresse: ${address}\n`;
    if (lat && lng) txtContent += `   Coordonnées: ${lat}, ${lng}\n`;
    txtContent += `   ID: ${id}\n\n`;
  });
  
  // Écrire les fichiers
  const csvFileName = 'clubs_sans_telephone.csv';
  const txtFileName = 'clubs_sans_telephone.txt';
  
  fs.writeFileSync(csvFileName, csvContent, 'utf8');
  fs.writeFileSync(txtFileName, txtContent, 'utf8');
  
  console.log(`✅ Fichiers générés:`);
  console.log(`   📄 ${csvFileName} (format CSV pour Excel/LibreOffice)`);
  console.log(`   📄 ${txtFileName} (format texte lisible)`);
  console.log(`\n📊 Total: ${clubs.length} club(s) sans numéro de téléphone`);
}

main().catch(console.error);

