#!/usr/bin/env node
/**
 * Script pour exclure expo-dev-client et expo-dev-menu des builds de production
 * Ce script doit être exécuté avant le build Android en production
 */

const fs = require('fs');
const path = require('path');

// Vérifier si on est en mode production
const isProduction = process.env.EAS_BUILD_PROFILE === 'production' || 
                     process.env.EAS_BUILD_WORKINGDIR?.includes('production') ||
                     process.argv.includes('--production');

if (!isProduction) {
  console.log('ℹ️  Not a production build, skipping dev-client exclusion...');
  process.exit(0);
}

console.log('🔧 Production build detected - excluding expo-dev-client modules...');

// Chemin vers le build.gradle de l'app
const appBuildGradlePath = path.join(__dirname, '..', 'android', 'app', 'build.gradle');

if (fs.existsSync(appBuildGradlePath)) {
  let content = fs.readFileSync(appBuildGradlePath, 'utf8');
  
  // Ajouter une configuration pour exclure expo-dev-client et expo-dev-menu en production
  if (!content.includes('// Exclude dev-client in production')) {
    // Trouver la section android et ajouter la configuration
    const androidConfigPattern = /(android\s*\{[\s\S]*?)(buildTypes\s*\{)/;
    if (androidConfigPattern.test(content)) {
      content = content.replace(
        androidConfigPattern,
        `$1// Exclude dev-client in production
    configurations.all {
        exclude group: 'expo.modules', module: 'expo-dev-client'
        exclude group: 'expo.modules', module: 'expo-dev-launcher'
        exclude group: 'expo.modules', module: 'expo-dev-menu'
        exclude group: 'expo.modules', module: 'expo-dev-menu-interface'
    }
    
$2`
      );
      fs.writeFileSync(appBuildGradlePath, content);
      console.log('✅ Added exclusions for dev-client modules in build.gradle');
    }
  }
}

// Exclure aussi dans settings.gradle si possible
const settingsGradlePath = path.join(__dirname, '..', 'android', 'settings.gradle');
if (fs.existsSync(settingsGradlePath)) {
  let content = fs.readFileSync(settingsGradlePath, 'utf8');
  
  // Commenter ou exclure les références à expo-dev-launcher
  // Note: Cette approche peut ne pas fonctionner car les modules sont chargés via autolinking
  console.log('ℹ️  Settings.gradle modifications skipped (handled by autolinking)');
}

console.log('✅ Dev-client exclusion configured');

