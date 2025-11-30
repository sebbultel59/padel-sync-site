#!/usr/bin/env node
/**
 * Script pour corriger les erreurs de compilation dans expo-dev-menu
 * Ce script doit être exécuté avant le build Android en production
 */

const fs = require('fs');
const path = require('path');

const devMenuPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-dev-menu',
  'android',
  'src',
  'main',
  'java',
  'com',
  'facebook',
  'react',
  'devsupport',
  'DevMenuSettingsBase.kt'
);

const devMenuHostHelperPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-dev-menu',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'devmenu',
  'react',
  'DevMenuHostHelper.kt'
);

// Corriger DevMenuSettingsBase.kt
if (fs.existsSync(devMenuPath)) {
  console.log('🔧 Fixing DevMenuSettingsBase.kt...');
  let content = fs.readFileSync(devMenuPath, 'utf8');
  
  // Supprimer ou commenter la méthode qui override nothing
  content = content.replace(
    /override\s+var\s+isStartSamplingProfilerOnInit[^\n]*\n[^\n]*\n[^\n]*/g,
    '// Removed: isStartSamplingProfilerOnInit (not available in RN 0.81.5)\n    // override var isStartSamplingProfilerOnInit = false'
  );
  
  // Ajouter la méthode addMenuItem si elle n'existe pas
  if (!content.includes('override fun addMenuItem')) {
    // Trouver la fin de la classe (avant le fun interface Listener)
    const listenerPattern = /(\s+override var isHotModuleReplacementEnabled[\s\S]*?)(\s+fun interface Listener)/;
    if (listenerPattern.test(content)) {
      content = content.replace(
        listenerPattern,
        `$1

  override fun addMenuItem(title: String) {
    // No-op implementation for RN 0.81.5 compatibility
  }
$2`
      );
    } else {
      // Si le pattern ne fonctionne pas, ajouter avant le fun interface Listener
      content = content.replace(
        /(\s+)(fun interface Listener)/,
        `$1override fun addMenuItem(title: String) {
    // No-op implementation for RN 0.81.5 compatibility
  }

$1$2`
      );
    }
  }
  
  fs.writeFileSync(devMenuPath, content);
  console.log('✅ Fixed DevMenuSettingsBase.kt');
}

// Corriger DevMenuHostHelper.kt
if (fs.existsSync(devMenuHostHelperPath)) {
  console.log('🔧 Fixing DevMenuHostHelper.kt...');
  let content = fs.readFileSync(devMenuHostHelperPath, 'utf8');
  
  // Supprimer complètement l'import jscexecutor
  content = content.replace(
    /import\s+com\.facebook\.react\.jscexecutor\.JSCExecutorFactory[^\n]*\n/g,
    '// import com.facebook.react.jscexecutor.JSCExecutorFactory // Not available in RN 0.81.5\n'
  );
  
  // Remplacer l'utilisation de JSCExecutorFactory par HermesExecutorFactory
  // Si libjsc.so existe, utiliser Hermes à la place (JSC n'est plus disponible)
  content = content.replace(
    /if\s*\(SoLoader\.getLibraryPath\("libjsc\.so"\)\s*!=\s*null\)\s*\{[\s\S]*?return\s+JSCExecutorFactory\([^)]+\)[\s\S]*?\}/,
    `if (SoLoader.getLibraryPath("libjsc.so") != null) {
    // JSC not available in RN 0.81.5, using Hermes instead
    return HermesExecutorFactory().also {
      try {
        HermesExecutorFactory::class.java
          .getMethod("setEnableDebugger", Boolean::class.java)
          .invoke(it, false)
      } catch (_: Throwable) {
      }
    }
  }`
  );
  
  fs.writeFileSync(devMenuHostHelperPath, content);
  console.log('✅ Fixed DevMenuHostHelper.kt');
} else {
  console.log('ℹ️  DevMenuHostHelper.kt not found, skipping...');
}

