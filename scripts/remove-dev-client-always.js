#!/usr/bin/env node
/**
 * Script pour supprimer expo-dev-client et expo-dev-launcher APRÈS chaque npm install
 * SOLUTION ROBUSTE - S'exécute systématiquement dans postinstall
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Removing expo-dev-client modules to prevent Android build issues...');

const nodeModulesPath = path.join(__dirname, '..', 'node_modules');

// Supprimer complètement les modules dev-client
const modulesToRemove = [
  'expo-dev-client',
  'expo-dev-launcher',
  'expo-dev-menu',
  'expo-dev-menu-interface'
];

let removedCount = 0;
modulesToRemove.forEach(moduleName => {
  const modulePath = path.join(nodeModulesPath, moduleName);
  if (fs.existsSync(modulePath)) {
    try {
      fs.rmSync(modulePath, { recursive: true, force: true });
      console.log(`✅ Removed ${moduleName}`);
      removedCount++;
    } catch (e) {
      console.log(`⚠️  Could not remove ${moduleName}: ${e.message}`);
    }
  }
});

// Supprimer aussi dans expo-dev-client/node_modules si présent
const expoDevClientPath = path.join(nodeModulesPath, 'expo-dev-client');
if (fs.existsSync(expoDevClientPath)) {
  const nestedModules = ['expo-dev-launcher', 'expo-dev-menu'];
  nestedModules.forEach(moduleName => {
    const nestedPath = path.join(expoDevClientPath, 'node_modules', moduleName);
    if (fs.existsSync(nestedPath)) {
      try {
        fs.rmSync(nestedPath, { recursive: true, force: true });
        console.log(`✅ Removed nested ${moduleName}`);
        removedCount++;
      } catch (e) {
        console.log(`⚠️  Could not remove nested ${moduleName}: ${e.message}`);
      }
    }
  });
}

// Supprimer aussi les plugins Gradle s'ils existent
const expoDevLauncherPluginPath = path.join(nodeModulesPath, 'expo-dev-launcher', 'expo-dev-launcher-gradle-plugin');
if (fs.existsSync(expoDevLauncherPluginPath)) {
  try {
    fs.rmSync(expoDevLauncherPluginPath, { recursive: true, force: true });
    console.log('✅ Removed expo-dev-launcher-gradle-plugin');
    removedCount++;
  } catch (e) {
    console.log(`⚠️  Could not remove expo-dev-launcher-gradle-plugin: ${e.message}`);
  }
}

if (removedCount > 0) {
  console.log(`✅ Removed ${removedCount} dev-client module(s) to prevent Android build issues`);
} else {
  console.log('ℹ️  No dev-client modules found to remove');
}

