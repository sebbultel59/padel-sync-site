// scripts/create-club-logos-bucket.js
// Script pour créer le bucket club-logos dans Supabase Storage
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

// Charger dotenv si disponible
try {
  require('dotenv').config();
} catch (e) {
  // dotenv non disponible, continuer sans
}

// Essayer de charger depuis config/env.js (pour compatibilité avec le projet)
let SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
let SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Si pas trouvé, essayer de lire depuis config/env.js
if (!SUPABASE_URL) {
  try {
    const envPath = path.join(__dirname, '../config/env.js');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const urlMatch = envContent.match(/SUPABASE_URL\s*=\s*["']([^"']+)["']/);
    if (urlMatch) {
      SUPABASE_URL = urlMatch[1];
      console.log('✅ URL trouvée dans config/env.js');
    }
  } catch (e) {
    // Ignorer si le fichier n'existe pas
  }
}

if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL doit être défini');
  console.error('   Options:');
  console.error('   1. Créer un fichier .env avec: SUPABASE_URL=https://votre-projet.supabase.co');
  console.error('   2. Ou définir la variable: export SUPABASE_URL=https://votre-projet.supabase.co');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY doit être défini');
  console.error('');
  console.error('   Pour obtenir la SERVICE_ROLE_KEY:');
  console.error('   1. Allez sur https://supabase.com/dashboard');
  console.error('   2. Sélectionnez votre projet');
  console.error('   3. Allez dans Settings → API');
  console.error('   4. Copiez la "service_role" key (⚠️  NE JAMAIS la partager publiquement!)');
  console.error('');
  console.error('   Ensuite, créez un fichier .env à la racine du projet avec:');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key_ici');
  console.error('');
  console.error('   Ou définissez la variable:');
  console.error('   export SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key_ici');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function createBucket() {
  try {
    console.log('🔄 Création du bucket club-logos...\n');

    // Vérifier si le bucket existe déjà
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Erreur lors de la vérification des buckets:', listError);
      process.exit(1);
    }

    const existingBucket = buckets?.find(b => b.name === 'club-logos');
    
    if (existingBucket) {
      console.log('✅ Le bucket club-logos existe déjà\n');
      console.log('   ID:', existingBucket.id);
      console.log('   Public:', existingBucket.public);
      console.log('   Created:', existingBucket.created_at);
      return;
    }

    // Créer le bucket
    const { data, error } = await supabase.storage.createBucket('club-logos', {
      public: true, // Bucket public pour que les logos soient accessibles
      fileSizeLimit: 5242880, // 5 MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    });

    if (error) {
      console.error('❌ Erreur lors de la création du bucket:', error);
      process.exit(1);
    }

    console.log('✅ Bucket club-logos créé avec succès!\n');
    console.log('   ID:', data.id);
    console.log('   Public: true');
    console.log('   File size limit: 5 MB');
    console.log('   Allowed MIME types: image/jpeg, image/png, image/webp, image/gif\n');
    
    console.log('📝 Note: Vous pouvez maintenant uploader des logos depuis l\'application.');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
    process.exit(1);
  }
}

createBucket();

