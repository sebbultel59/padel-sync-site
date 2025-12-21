#!/usr/bin/env node
/**
 * Script pour forcer la version Kotlin 2.1.0 dans les plugins Expo
 * Ce script doit être exécuté avant le build Android en production
 * Compatible avec KSP 2.1.0-1.0.29
 */

const fs = require('fs');
const path = require('path');

// Liste des plugins et modules à corriger
const pluginsToFix = [
  'expo-dev-launcher-gradle-plugin',
  'expo-updates-gradle-plugin',
  'expo-updates', // Module expo-updates lui-même
  'expo-dev-menu'
];

// Fonction pour corriger un fichier build.gradle.kts
function fixKotlinVersion(pluginPath) {
  if (!fs.existsSync(pluginPath)) {
    return false;
  }
  
  console.log(`🔧 Fixing Kotlin version in ${path.basename(path.dirname(pluginPath))}...`);
  
  let content = fs.readFileSync(pluginPath, 'utf8');
  
  const originalContent = content;
  
  // Forcer la version Kotlin à 2.1.0 (compatible avec KSP 2.1.0-1.0.29)
  // Remplacer toutes les occurrences de kotlin version, y compris dans les plugins
  content = content.replace(
    /kotlin\s*\(\s*["']jvm["']\s*\)\s*version\s*["'][^"']+["']/g,
    'kotlin("jvm") version "2.1.0"'
  );
  
  // Remplacer aussi les références à kotlinVersion dans les variables
  content = content.replace(
    /kotlinVersion\s*=\s*["'][^"']+["']/g,
    'kotlinVersion = "2.1.0"'
  );
  
  // Remplacer dans les plugins Kotlin Android
  content = content.replace(
    /id\s*\(\s*["']org\.jetbrains\.kotlin\.android["']\s*\)\s*version\s*["'][^"']+["']/g,
    'id("org.jetbrains.kotlin.android") version "2.1.0"'
  );
  
  // Remplacer les références à kotlin-gradle-plugin dans dependencies
  content = content.replace(
    /classpath\s*\(\s*["']org\.jetbrains\.kotlin:kotlin-gradle-plugin:[^"']+["']\s*\)/g,
    'classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.0")'
  );
  
  // Remplacer les références à kotlin multiplatform
  content = content.replace(
    /kotlin\s*\(\s*["']multiplatform["']\s*\)\s*version\s*["'][^"']+["']/g,
    'kotlin("multiplatform") version "2.1.0"'
  );
  
  // Remplacer les références à kotlin dans plugins block
  content = content.replace(
    /kotlin\s*\(\s*["']android["']\s*\)\s*version\s*["'][^"']+["']/g,
    'kotlin("android") version "2.1.0"'
  );
  
  // Si le contenu a changé, on sauvegarde
  if (content !== originalContent) {
    fs.writeFileSync(pluginPath, content);
    console.log(`✅ Kotlin version fixed in ${path.basename(path.dirname(pluginPath))}`);
    return true;
  } else {
    console.log(`ℹ️  No Kotlin version found to fix in ${path.basename(path.dirname(pluginPath))}`);
    return false;
  }
  
  // Corriger la configuration Java pour utiliser JVM 17
  content = content.replace(
    /java\s*\{[\s\S]*?sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+[\s\S]*?targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+[\s\S]*?\}/,
    `java {
  sourceCompatibility = JavaVersion.VERSION_17
  targetCompatibility = JavaVersion.VERSION_17
}`
  );
  
  // Corriger les options Kotlin pour utiliser JVM 17 et ignorer les vérifications de métadonnées
  const kotlinOptionsPattern = /tasks\.withType<KotlinCompile>\s*\{[\s\S]*?kotlinOptions\s*\{[\s\S]*?\}[\s\S]*?\}/;
  if (kotlinOptionsPattern.test(content)) {
    content = content.replace(
      kotlinOptionsPattern,
      `tasks.withType<KotlinCompile> {
  kotlinOptions {
    freeCompilerArgs += listOf("-Xskip-metadata-version-check")
    jvmTarget = JavaVersion.VERSION_17.toString()
  }
}`
    );
  }
  
  // Forcer la recompilation en supprimant le cache de build du plugin
  const pluginDir = path.dirname(pluginPath);
  const buildDir = path.join(pluginDir, 'build');
  if (fs.existsSync(buildDir)) {
    try {
      fs.rmSync(buildDir, { recursive: true, force: true });
      console.log(`✅ Cleared build cache for ${path.basename(pluginDir)}`);
    } catch (e) {
      console.log(`⚠️  Could not clear build cache (this is OK)`);
    }
  }
}

// Chercher récursivement les plugins dans node_modules
function findPluginBuildFiles(nodeModulesPath, pluginName) {
  const results = [];
  
  function searchDir(dir, depth = 0) {
    if (depth > 10) return; // Limiter la profondeur
    
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          if (file === pluginName || file.includes(pluginName)) {
            const buildGradle = path.join(fullPath, 'build.gradle.kts');
            if (fs.existsSync(buildGradle)) {
              results.push(buildGradle);
            }
          } else if (!file.startsWith('.') && file !== 'node_modules' && depth < 5) {
            searchDir(fullPath, depth + 1);
          }
        }
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  searchDir(nodeModulesPath);
  return results;
}

// Chercher et corriger tous les plugins
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
let fixedCount = 0;

for (const pluginName of pluginsToFix) {
  // Chercher dans les emplacements standards
  const standardPaths = [
    path.join(nodeModulesPath, 'expo-dev-launcher', 'expo-dev-launcher-gradle-plugin', 'build.gradle.kts'),
    path.join(nodeModulesPath, 'expo-updates', 'expo-updates-gradle-plugin', 'build.gradle.kts'),
    path.join(nodeModulesPath, 'expo-updates', 'android', 'build.gradle.kts'), // Module expo-updates
    path.join(nodeModulesPath, '@expo', 'expo-updates', 'expo-updates-gradle-plugin', 'build.gradle.kts'), // Alternative path
    path.join(nodeModulesPath, '@expo', 'expo-updates', 'android', 'build.gradle.kts'), // Alternative path
    path.join(nodeModulesPath, 'expo-dev-menu', 'build.gradle.kts'),
    path.join(nodeModulesPath, 'expo-dev-menu', 'android', 'build.gradle.kts'),
  ];
  
  let found = false;
  for (const pluginPath of standardPaths) {
    if (fs.existsSync(pluginPath)) {
      // Vérifier si le chemin correspond au plugin recherché
      const matchesPlugin = pluginPath.includes(pluginName) || 
                           (pluginName === 'expo-updates' && pluginPath.includes('expo-updates'));
      if (matchesPlugin) {
        if (fixKotlinVersion(pluginPath)) {
          fixedCount++;
          found = true;
        }
      }
    }
  }
  
  // Si pas trouvé, chercher récursivement
  if (!found) {
    const foundPaths = findPluginBuildFiles(nodeModulesPath, pluginName);
    for (const pluginPath of foundPaths) {
      if (fixKotlinVersion(pluginPath)) {
        fixedCount++;
        break;
      }
    }
  }
}

if (fixedCount === 0) {
  console.log('ℹ️  No plugins found to fix, skipping...');
} else {
  console.log(`\n✅ Fixed Kotlin version in ${fixedCount} plugin(s)`);
}

