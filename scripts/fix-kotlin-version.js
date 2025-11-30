#!/usr/bin/env node
/**
 * Script pour forcer la version Kotlin 2.1.20 dans le plugin expo-dev-launcher
 * Ce script doit être exécuté avant le build Android en production
 */

const fs = require('fs');
const path = require('path');

// Chercher le plugin dans plusieurs emplacements possibles
const possiblePaths = [
  path.join(__dirname, '..', 'node_modules', 'expo-dev-launcher', 'expo-dev-launcher-gradle-plugin', 'build.gradle.kts'),
  path.join(__dirname, '..', 'node_modules', 'expo-dev-client', 'node_modules', 'expo-dev-launcher', 'expo-dev-launcher-gradle-plugin', 'build.gradle.kts'),
];

// Chercher récursivement dans node_modules
const findPluginRecursively = (dir) => {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && file === 'expo-dev-launcher-gradle-plugin') {
        const buildGradle = path.join(fullPath, 'build.gradle.kts');
        if (fs.existsSync(buildGradle)) {
          return buildGradle;
        }
      } else if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
        const found = findPluginRecursively(fullPath);
        if (found) return found;
      }
    }
  } catch (e) {
    // Ignore errors
  }
  return null;
};

let pluginPath = null;
for (const possiblePath of possiblePaths) {
  if (fs.existsSync(possiblePath)) {
    pluginPath = possiblePath;
    console.log(`✅ Found plugin at: ${pluginPath}`);
    break;
  }
}

// Si pas trouvé, chercher récursivement
if (!pluginPath) {
  const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    pluginPath = findPluginRecursively(nodeModulesPath);
    if (pluginPath) {
      console.log(`✅ Found plugin recursively at: ${pluginPath}`);
    }
  }
}

if (pluginPath) {
  console.log('🔧 Fixing Kotlin version in expo-dev-launcher-gradle-plugin...');
  
  let content = fs.readFileSync(pluginPath, 'utf8');
  
  // Forcer la version Kotlin à 2.1.20
  content = content.replace(
    /kotlin\s*\(\s*["']jvm["']\s*\)\s*version\s*["'][^"']+["']/g,
    'kotlin("jvm") version "2.1.20"'
  );
  
  // Corriger la configuration Java pour utiliser JVM 17
  content = content.replace(
    /java\s*\{[\s\S]*?sourceCompatibility\s*=\s*JavaVersion\.VERSION_\d+[\s\S]*?targetCompatibility\s*=\s*JavaVersion\.VERSION_\d+[\s\S]*?\}/,
    `java {
  sourceCompatibility = JavaVersion.VERSION_17
  targetCompatibility = JavaVersion.VERSION_17
}`
  );
  
  // Corriger les options Kotlin pour utiliser JVM 17 et ignorer les vérifications de métadonnées
  // Remplacer tout le bloc tasks.withType<KotlinCompile>
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
  
  fs.writeFileSync(pluginPath, content);
  console.log('✅ Kotlin version fixed in expo-dev-launcher-gradle-plugin');
  
  // Forcer la recompilation en supprimant le cache de build du plugin
  const pluginDir = path.dirname(pluginPath);
  const buildDir = path.join(pluginDir, 'build');
  if (fs.existsSync(buildDir)) {
    try {
      fs.rmSync(buildDir, { recursive: true, force: true });
      console.log('✅ Cleared build cache for expo-dev-launcher-gradle-plugin');
    } catch (e) {
      console.log('⚠️  Could not clear build cache (this is OK)');
    }
  }
} else {
  console.log('ℹ️  expo-dev-launcher-gradle-plugin not found, skipping...');
}

