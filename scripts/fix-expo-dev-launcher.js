#!/usr/bin/env node
/**
 * Script pour corriger les erreurs de compilation dans expo-dev-launcher
 * Ce script doit être exécuté avant le build Android en production
 */

const fs = require('fs');
const path = require('path');

const devServerHelperPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-dev-launcher',
  'android',
  'src',
  'main',
  'java',
  'com',
  'facebook',
  'react',
  'devsupport',
  'DevLauncherDevServerHelper.kt'
);

const activityDelegatePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-dev-launcher',
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'devlauncher',
  'react',
  'activitydelegates',
  'DevLauncherReactActivityNOPDelegate.kt'
);

const nonFinalBridgePath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-dev-launcher',
  'android',
  'src',
  'main',
  'java',
  'com',
  'facebook',
  'react',
  'devsupport',
  'NonFinalBridgeDevSupportManager.java'
);

const nonFinalBridgelessPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'expo-dev-launcher',
  'android',
  'src',
  'main',
  'java',
  'com',
  'facebook',
  'react',
  'devsupport',
  'NonFinalBridgelessDevSupportManager.java'
);

// Corriger DevLauncherDevServerHelper.kt
if (fs.existsSync(devServerHelperPath)) {
  console.log('🔧 Fixing DevLauncherDevServerHelper.kt...');
  let content = fs.readFileSync(devServerHelperPath, 'utf8');
  
  // Corriger getDevServerBundleURL - String? -> String
  content = content.replace(
    /override\s+fun\s+getDevServerBundleURL\(jsModulePath:\s*String\?\):\s*String/g,
    'override fun getDevServerBundleURL(jsModulePath: String): String'
  );
  
  // Corriger l'appel dans le corps - jsModulePath est maintenant non-nullable
  content = content.replace(
    /return\s+controller\?\.manifest\?\.getBundleURL\(\)\s*\?:\s*super\.getDevServerBundleURL\(jsModulePath\s*\?:\s*"[^"]+"\)/g,
    'return controller?.manifest?.getBundleURL() ?: super.getDevServerBundleURL(jsModulePath)'
  );
  
  // Corriger getDevServerSplitBundleURL - String? -> String
  content = content.replace(
    /override\s+fun\s+getDevServerSplitBundleURL\(jsModulePath:\s*String\?\):\s*String/g,
    'override fun getDevServerSplitBundleURL(jsModulePath: String): String'
  );
  
  // Corriger l'appel dans le corps
  content = content.replace(
    /return\s+controller\?\.manifest\?\.getBundleURL\(\)\s*\?:\s*super\.getDevServerSplitBundleURL\(jsModulePath\s*\?:\s*"[^"]+"\)/g,
    'return controller?.manifest?.getBundleURL() ?: super.getDevServerSplitBundleURL(jsModulePath)'
  );
  
  // Corriger getSourceUrl - String? -> String
  content = content.replace(
    /override\s+fun\s+getSourceUrl\(mainModuleName:\s*String\?\):\s*String/g,
    'override fun getSourceUrl(mainModuleName: String): String'
  );
  
  // Corriger l'appel dans le corps
  content = content.replace(
    /return\s+controller\?\.manifest\?\.getBundleURL\(\)\s*\?:\s*super\.getSourceUrl\(mainModuleName\s*\?:\s*"[^"]+"\)/g,
    'return controller?.manifest?.getBundleURL() ?: super.getSourceUrl(mainModuleName)'
  );
  
  // Corriger getSourceMapUrl - String? -> String
  content = content.replace(
    /override\s+fun\s+getSourceMapUrl\(mainModuleName:\s*String\?\):\s*String/g,
    'override fun getSourceMapUrl(mainModuleName: String): String'
  );
  
  // Corriger l'appel dans le corps
  content = content.replace(
    /val\s+defaultValue\s*=\s*super\.getSourceMapUrl\(mainModuleName\s*\?:\s*"[^"]+"\)/g,
    'val defaultValue = super.getSourceMapUrl(mainModuleName)'
  );
  
  fs.writeFileSync(devServerHelperPath, content);
  console.log('✅ Fixed DevLauncherDevServerHelper.kt');
} else {
  console.log('ℹ️  DevLauncherDevServerHelper.kt not found, skipping...');
}

// Corriger DevLauncherReactActivityNOPDelegate.kt
if (fs.existsSync(activityDelegatePath)) {
  console.log('🔧 Fixing DevLauncherReactActivityNOPDelegate.kt...');
  let content = fs.readFileSync(activityDelegatePath, 'utf8');
  
  // Supprimer les méthodes qui override nothing - corriger les signatures
  content = content.replace(
    /override\s+fun\s+onRequestPermissionsResult\(requestCode:\s*Int,\s*permissions:\s*Array<out\s+String>\?,\s*grantResults:\s*IntArray\?\)\s*\{\}/g,
    '// Removed: onRequestPermissionsResult (signature changed in RN 0.81.5)\n  // override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>?, grantResults: IntArray?) {}'
  );
  
  content = content.replace(
    /override\s+fun\s+onConfigurationChanged\(newConfig:\s*Configuration\?\)\s*\{\}/g,
    '// Removed: onConfigurationChanged (signature changed in RN 0.81.5)\n  // override fun onConfigurationChanged(newConfig: Configuration?) {}'
  );
  
  fs.writeFileSync(activityDelegatePath, content);
  console.log('✅ Fixed DevLauncherReactActivityNOPDelegate.kt');
} else {
  console.log('ℹ️  DevLauncherReactActivityNOPDelegate.kt not found, skipping...');
}

// Corriger NonFinalBridgeDevSupportManager.java
if (fs.existsSync(nonFinalBridgePath)) {
  console.log('🔧 Fixing NonFinalBridgeDevSupportManager.java...');
  let content = fs.readFileSync(nonFinalBridgePath, 'utf8');
  
  // Supprimer l'import DevSplitBundleCallback
  content = content.replace(
    /import\s+com\.facebook\.react\.devsupport\.interfaces\.DevSplitBundleCallback;\s*\n/g,
    '// import com.facebook.react.devsupport.interfaces.DevSplitBundleCallback; // Not available in RN 0.81.5\n'
  );
  
  // Commenter la méthode loadSplitBundleFromServer - remplacer tout le bloc de la méthode
  // Pattern pour capturer depuis @Override jusqu'à la fin de la méthode (})
  const loadSplitBundlePattern = /(@Override\s+public\s+void\s+loadSplitBundleFromServer\([^)]+\)\s*\{)([\s\S]*?)(\n\s*\})/;
  if (loadSplitBundlePattern.test(content)) {
    content = content.replace(
      loadSplitBundlePattern,
      `@Override
  public void loadSplitBundleFromServer(
    final String bundlePath, final /* DevSplitBundleCallback */ Object callback) {
    // Method signature changed in RN 0.81.5 - DevSplitBundleCallback no longer exists
    // This method is deprecated and may not work correctly
    throw new UnsupportedOperationException("loadSplitBundleFromServer is not supported in RN 0.81.5");
  }`
    );
  }
  
  // Corriger les erreurs de syntaxe (supprimer }; en trop si présent)
  content = content.replace(/throw new UnsupportedOperationException\([^)]+\);\s*\};\s*\}/g, 
    'throw new UnsupportedOperationException("loadSplitBundleFromServer is not supported in RN 0.81.5");\n  }');
  
  fs.writeFileSync(nonFinalBridgePath, content);
  console.log('✅ Fixed NonFinalBridgeDevSupportManager.java');
} else {
  console.log('ℹ️  NonFinalBridgeDevSupportManager.java not found, skipping...');
}

// Corriger NonFinalBridgelessDevSupportManager.java
if (fs.existsSync(nonFinalBridgelessPath)) {
  console.log('🔧 Fixing NonFinalBridgelessDevSupportManager.java...');
  let content = fs.readFileSync(nonFinalBridgelessPath, 'utf8');
  
  // Supprimer l'import DevSplitBundleCallback
  content = content.replace(
    /import\s+com\.facebook\.react\.devsupport\.interfaces\.DevSplitBundleCallback;\s*\n/g,
    '// import com.facebook.react.devsupport.interfaces.DevSplitBundleCallback; // Not available in RN 0.81.5\n'
  );
  
  // Remplacer mReactInstanceDevHelper par getReactInstanceDevHelper()
  content = content.replace(
    /mReactInstanceDevHelper\./g,
    'getReactInstanceDevHelper().'
  );
  
  // Commenter la méthode loadSplitBundleFromServer - remplacer tout le bloc de la méthode
  // Pattern pour capturer depuis @Override jusqu'à la fin de la méthode (})
  const loadSplitBundlePattern = /(@Override\s+public\s+void\s+loadSplitBundleFromServer\([^)]+\)\s*\{)([\s\S]*?)(\n\s*\})/;
  if (loadSplitBundlePattern.test(content)) {
    content = content.replace(
      loadSplitBundlePattern,
      `@Override
  public void loadSplitBundleFromServer(
    final String bundlePath, final /* DevSplitBundleCallback */ Object callback) {
    // Method signature changed in RN 0.81.5 - DevSplitBundleCallback no longer exists
    // This method is deprecated and may not work correctly
    throw new UnsupportedOperationException("loadSplitBundleFromServer is not supported in RN 0.81.5");
  }`
    );
  }
  
  // Corriger les erreurs de syntaxe (supprimer }; en trop si présent)
  content = content.replace(/throw new UnsupportedOperationException\([^)]+\);\s*\};\s*\}/g, 
    'throw new UnsupportedOperationException("loadSplitBundleFromServer is not supported in RN 0.81.5");\n  }');
  
  fs.writeFileSync(nonFinalBridgelessPath, content);
  console.log('✅ Fixed NonFinalBridgelessDevSupportManager.java');
} else {
  console.log('ℹ️  NonFinalBridgelessDevSupportManager.java not found, skipping...');
}

