#!/usr/bin/env node

/**
 * Script de vérification de la configuration OAuth
 * Vérifie que tous les éléments nécessaires sont en place
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://iieiggyqcncbkjwsdcxl.supabase.co';
const PROJECT_REF = 'iieiggyqcncbkjwsdcxl';

console.log('🔍 Vérification de la configuration OAuth...\n');

let errors = [];
let warnings = [];
let success = [];

// 1. Vérifier app.config.js
console.log('1. Vérification de app.config.js...');
try {
  const appConfigPath = path.join(__dirname, '../app.config.js');
  const appConfigContent = fs.readFileSync(appConfigPath, 'utf8');
  
  if (appConfigContent.includes('syncpadel')) {
    success.push('✅ Deep link syncpadel:// configuré dans app.config.js');
  } else {
    errors.push('❌ Deep link syncpadel:// manquant dans app.config.js');
  }
  
  if (appConfigContent.includes('padelsync')) {
    success.push('✅ Deep link padelsync:// présent dans app.config.js');
  }
} catch (e) {
  errors.push(`❌ Erreur lors de la lecture de app.config.js: ${e.message}`);
}

// 2. Vérifier signin.js
console.log('2. Vérification de app/(auth)/signin.js...');
try {
  const signinPath = path.join(__dirname, '../app/(auth)/signin.js');
  const signinContent = fs.readFileSync(signinPath, 'utf8');
  
  if (signinContent.includes('signInWithGoogle')) {
    success.push('✅ Fonction signInWithGoogle présente');
  } else {
    errors.push('❌ Fonction signInWithGoogle manquante');
  }
  
  if (signinContent.includes('signInWithFacebook')) {
    success.push('✅ Fonction signInWithFacebook présente');
  } else {
    errors.push('❌ Fonction signInWithFacebook manquante');
  }
  
  if (signinContent.includes('signInWithApple')) {
    success.push('✅ Fonction signInWithApple présente');
  } else {
    errors.push('❌ Fonction signInWithApple manquante');
  }
  
  if (signinContent.includes('syncpadel://auth/callback')) {
    success.push('✅ Deep link callback configuré dans signin.js');
  } else {
    errors.push('❌ Deep link callback manquant dans signin.js');
  }
  
  if (signinContent.includes('expo-web-browser')) {
    success.push('✅ expo-web-browser importé');
  } else {
    errors.push('❌ expo-web-browser non importé');
  }
} catch (e) {
  errors.push(`❌ Erreur lors de la lecture de signin.js: ${e.message}`);
}

// 3. Vérifier package.json
console.log('3. Vérification de package.json...');
try {
  const packagePath = path.join(__dirname, '../package.json');
  const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  if (packageContent.dependencies['expo-web-browser']) {
    success.push('✅ expo-web-browser dans les dépendances');
  } else {
    errors.push('❌ expo-web-browser manquant dans package.json');
  }
} catch (e) {
  errors.push(`❌ Erreur lors de la lecture de package.json: ${e.message}`);
}

// 4. Vérifier la documentation
console.log('4. Vérification de la documentation...');
const docsPath = path.join(__dirname, '../OAUTH_SETUP.md');
if (fs.existsSync(docsPath)) {
  success.push('✅ Documentation OAUTH_SETUP.md présente');
} else {
  warnings.push('⚠️  Documentation OAUTH_SETUP.md manquante');
}

// Afficher les résultats
console.log('\n📊 Résultats de la vérification:\n');

if (success.length > 0) {
  console.log('✅ Succès:');
  success.forEach(msg => console.log(`   ${msg}`));
  console.log('');
}

if (warnings.length > 0) {
  console.log('⚠️  Avertissements:');
  warnings.forEach(msg => console.log(`   ${msg}`));
  console.log('');
}

if (errors.length > 0) {
  console.log('❌ Erreurs:');
  errors.forEach(msg => console.log(`   ${msg}`));
  console.log('');
}

// Informations de configuration
console.log('\n📋 Informations de configuration Supabase:\n');
console.log(`   Project URL: ${SUPABASE_URL}`);
console.log(`   Project Ref: ${PROJECT_REF}`);
console.log(`   Redirect URI (Web): https://${PROJECT_REF}.supabase.co/auth/v1/callback`);
console.log(`   Redirect URI (Mobile): syncpadel://auth/callback`);
console.log('');

// Instructions
console.log('📝 Prochaines étapes:\n');
console.log('   1. Configurer les providers dans Supabase Dashboard:');
console.log('      - Authentication > Providers');
console.log('      - Activer Google, Facebook, Apple');
console.log('      - Ajouter les redirect URIs ci-dessus\n');
console.log('   2. Configurer les providers externes:');
console.log('      - Google Cloud Console: ajouter le redirect URI web');
console.log('      - Facebook Developers: ajouter le redirect URI web');
console.log('      - Apple Developer: configurer le Service ID\n');
console.log('   3. Tester l\'authentification:');
console.log('      - Lancer l\'application');
console.log('      - Tester chaque provider OAuth');
console.log('      - Vérifier les logs dans Supabase Dashboard\n');

if (errors.length === 0) {
  console.log('✅ Configuration locale OK ! Vous pouvez maintenant configurer Supabase.\n');
  process.exit(0);
} else {
  console.log('❌ Des erreurs ont été détectées. Veuillez les corriger avant de continuer.\n');
  process.exit(1);
}







