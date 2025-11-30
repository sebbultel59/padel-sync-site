#!/usr/bin/env node
/**
 * Script pour désactiver expo-dev-client en production
 * Modifie app.config.js pour exclure le plugin en production
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

console.log('🔧 Production build detected - disabling expo-dev-client...');

const appConfigPath = path.join(__dirname, '..', 'app.config.js');

if (fs.existsSync(appConfigPath)) {
  let content = fs.readFileSync(appConfigPath, 'utf8');
  
  // Vérifier si expo-dev-client est dans les plugins
  if (content.includes('expo-dev-client')) {
    // Retirer expo-dev-client des plugins
    content = content.replace(
      /(["']expo-dev-client["']\s*,?\s*)/g,
      '// expo-dev-client removed for production\n      '
    );
    fs.writeFileSync(appConfigPath, content);
    console.log('✅ Removed expo-dev-client from app.config.js');
  }
}

// Modifier aussi package.json pour exclure expo-dev-client temporairement
const packageJsonPath = path.join(__dirname, '..', 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  // Sauvegarder la version originale
  if (pkg.devDependencies && pkg.devDependencies['expo-dev-client']) {
    const originalVersion = pkg.devDependencies['expo-dev-client'];
    pkg._originalExpoDevClient = originalVersion;
    delete pkg.devDependencies['expo-dev-client'];
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('✅ Temporarily removed expo-dev-client from package.json');
  }
}

console.log('✅ Dev-client disabled for production');

