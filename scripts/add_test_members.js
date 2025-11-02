// scripts/add_test_members.js
// Script pour ajouter des membres de test à un groupe existant

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Configuration Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || "https://iieiggyqcncbkjwsdcxl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWlnZ3lxY25jYmtqd3NkY3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjk3MzQsImV4cCI6MjA3Mjg0NTczNH0.tTCN1140MVgNswkq5HSXzC3fS0Uuylb-5ZP6h1vTWMI";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Configurez SUPABASE_URL et SUPABASE_ANON_KEY (ou SUPABASE_SERVICE_KEY)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Générer un UUID simple (pour les profils de test)
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Générer un email aléatoire
function generateEmail(index) {
  const timestamp = Date.now();
  return `test-membre-${index}-${timestamp}@padel-sync-test.local`;
}

// Créer un profil de test
async function createTestProfile(index) {
  const email = generateEmail(index);
  const names = [
    'Alexandre', 'Benjamin', 'Camille', 'David', 'Émilie', 'François', 'Gabriel', 'Hélène',
    'Ivan', 'Julie', 'Kevin', 'Laura', 'Marc', 'Nathalie', 'Olivier', 'Pauline',
    'Quentin', 'Rachel', 'Simon', 'Thomas', 'Ulysse', 'Valérie', 'William', 'Yasmine',
    'Zoé', 'Antoine', 'Baptiste', 'Céline', 'Damien', 'Élodie', 'Fabien', 'Guillaume',
    'Hugo', 'Isabelle', 'Jérôme', 'Karine', 'Luc', 'Marion', 'Nicolas', 'Ophélie',
    'Pierre', 'Quitterie', 'Romain', 'Sophie', 'Thibault', 'Ugo', 'Victor', 'Wendy',
    'Xavier', 'Yann', 'Zacharie'
  ];
  const surnames = [
    'Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand',
    'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia', 'David',
    'Bertrand', 'Roux', 'Vincent', 'Fournier', 'Morel', 'Girard', 'André', 'Lefevre',
    'Mercier', 'Dupont', 'Lambert', 'Bonnet', 'François', 'Martinez', 'Legrand', 'Garnier',
    'Faure', 'Rousseau', 'Blanc', 'Guerin', 'Muller', 'Henry', 'Roussel', 'Nicolas',
    'Perrin', 'Morin', 'Mathieu', 'Clement', 'Gauthier', 'Dumont', 'Lopez', 'Fontaine',
    'Chevalier', 'Robin', 'Masson'
  ];
  
  const nameIndex = (index - 1) % names.length;
  const surnameIndex = Math.floor((index - 1) / names.length) % surnames.length;
  const displayName = `${names[nameIndex]} ${surnames[surnameIndex]}`;
  
  // Niveaux possibles: 'debutant', 'intermediaire', 'avance', 'expert'
  const levels = ['debutant', 'intermediaire', 'avance', 'expert'];
  const niveau = levels[index % levels.length];
  
  const profileId = generateUUID();
  
  // Créer le profil dans la table profiles
  // Note: Normalement, les profils sont créés automatiquement via un trigger
  // quand un utilisateur s'inscrit. Ici, on crée directement dans la table pour les tests.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: profileId,
      email: email,
      display_name: displayName,
      name: displayName,
      niveau: niveau,
    })
    .select()
    .single();
  
  if (profileError) {
    // Si le profil existe déjà (par email), on le récupère
    if (profileError.code === '23505') { // violation unique constraint
      const { data: existing } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      
      if (existing) {
        console.log(`  ✅ Profil existant: ${displayName} (${email})`);
        return existing;
      }
    }
    throw profileError;
  }
  
  console.log(`  ✅ Profil créé: ${displayName} (${email}) - Niveau: ${niveau}`);
  return profile;
}

// Ajouter un membre à un groupe
async function addMemberToGroup(groupId, userId, role = 'member') {
  const { data, error } = await supabase
    .from('group_members')
    .insert({
      group_id: groupId,
      user_id: userId,
      role: role
    })
    .select()
    .single();
  
  if (error) {
    // Si le membre existe déjà, c'est OK
    if (error.code === '23505') { // violation unique constraint
      console.log(`    ⚠️  Membre déjà dans le groupe: ${userId}`);
      return null;
    }
    throw error;
  }
  
  return data;
}

// Lister les groupes existants
async function listGroups() {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, visibility, created_at')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) throw error;
  return data || [];
}

// Obtenir les membres actuels d'un groupe
async function getGroupMembers(groupId) {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);
  
  if (error) throw error;
  return data?.map(m => m.user_id) || [];
}

// Créer un groupe de test
async function createTestGroup(name = 'Groupe de test - 50+ membres') {
  console.log(`🔨 Création d'un groupe de test: "${name}"...\n`);
  
  // Essayer d'abord avec la RPC si elle existe
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_create_group', {
      p_name: name,
      p_visibility: 'private',
      p_join_policy: 'invite',
    });
    
    if (!rpcErr && rpcData) {
      const created = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (created && created.id) {
        console.log(`✅ Groupe créé via RPC: ${created.id}\n`);
        return created;
      }
    }
  } catch (e) {
    console.log(`⚠️  RPC non disponible, utilisation d'un fallback...\n`);
  }
  
  // Fallback: insertion directe (nécessite service key ou permissions appropriées)
  // Note: Cela nécessite probablement une service key car la clé anonyme peut ne pas avoir les permissions
  const { data, error } = await supabase
    .from('groups')
    .insert({
      name: name,
      visibility: 'private',
      join_policy: 'invite',
    })
    .select()
    .single();
  
  if (error) {
    // Si l'insertion directe échoue, essayer de récupérer le groupe le plus récent avec ce nom
    const { data: existing } = await supabase
      .from('groups')
      .select('id, name')
      .eq('name', name)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (existing) {
      console.log(`✅ Groupe trouvé: ${existing.id}\n`);
      return existing;
    }
    
    throw error;
  }
  
  console.log(`✅ Groupe créé: ${data.id}\n`);
  
  // Essayer d'ajouter un membre admin (nécessite un profil existant)
  // Pour l'instant, on laisse cela vide - l'utilisateur pourra ajouter un admin via l'app
  
  return data;
}

// Fonction principale
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/add_test_members.js <groupId> [options]

Options:
  --count <number>    Nombre de membres à ajouter (défaut: 50)
  --list-groups       Lister les groupes existants
  --use-existing      Utiliser des profils existants au lieu de créer des nouveaux
  --create-group      Créer un groupe de test si aucun n'existe (nécessite service key)

Exemples:
  # Lister les groupes
  node scripts/add_test_members.js --list-groups

  # Créer un groupe de test et ajouter 50 membres
  node scripts/add_test_members.js --create-group --count 50

  # Ajouter 50 membres à un groupe existant (créer des profils de test)
  node scripts/add_test_members.js <groupId> --count 50

  # Ajouter 100 membres en utilisant des profils existants
  node scripts/add_test_members.js <groupId> --count 100 --use-existing
`);
    process.exit(0);
  }
  
  // Option: créer un groupe de test
  if (args.includes('--create-group')) {
    const countIndex = args.indexOf('--count');
    const count = countIndex >= 0 && args[countIndex + 1] 
      ? parseInt(args[countIndex + 1], 10) 
      : 50;
    const useExisting = args.includes('--use-existing');
    
    try {
      const group = await createTestGroup();
      console.log(`✅ Groupe créé avec succès!`);
      console.log(`   ID: ${group.id}`);
      console.log(`   Nom: ${group.name}\n`);
      
      // Maintenant ajouter les membres
      console.log(`🚀 Ajout de ${count} membres de test au groupe...\n`);
      
      // Obtenir les membres actuels
      const existingMembers = await getGroupMembers(group.id);
      
      let profiles = [];
      let shouldUseExisting = useExisting;
      
      if (shouldUseExisting) {
        // Utiliser des profils existants
        console.log('📋 Récupération des profils existants...');
        
        const { data: allProfiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, email')
          .limit(count * 2);
        
        if (profilesError) throw profilesError;
        
        const existingSet = new Set(existingMembers);
        const filteredProfiles = (allProfiles || [])
          .filter(p => !existingSet.has(p.id))
          .slice(0, count);
        
        if (filteredProfiles.length === 0) {
          console.error('❌ Aucun profil existant trouvé. Création de profils de test...\n');
          shouldUseExisting = false; // Fallback vers création de profils
        } else {
          profiles = filteredProfiles;
          console.log(`  ✅ ${profiles.length} profils existants trouvés\n`);
        }
      }
      
      if (!shouldUseExisting) {
        // Créer des profils de test
        console.log('👤 Création de profils de test...');
        for (let i = 1; i <= count; i++) {
          try {
            const profile = await createTestProfile(i);
            profiles.push(profile);
            
            if (i % 10 === 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (e) {
            console.error(`  ❌ Erreur pour le profil ${i}:`, e.message);
          }
        }
        console.log(`\n✅ ${profiles.length} profils créés\n`);
      }
      
      // Ajouter les membres au groupe
      console.log('➕ Ajout des membres au groupe...');
      let added = 0;
      let skipped = 0;
      
      for (let i = 0; i < profiles.length; i++) {
        const profile = profiles[i];
        try {
          const result = await addMemberToGroup(group.id, profile.id);
          if (result) {
            added++;
            if (added % 10 === 0) {
              console.log(`  Progression: ${added}/${profiles.length} ajoutés...`);
            }
          } else {
            skipped++;
          }
          
          if ((i + 1) % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (e) {
          console.error(`  ❌ Erreur pour ${profile.display_name || profile.email}:`, e.message);
          skipped++;
        }
      }
      
      const finalMembers = await getGroupMembers(group.id);
      
      console.log(`\n✅ Terminé!`);
      console.log(`   Groupe ID: ${group.id}`);
      console.log(`   Membres ajoutés: ${added}`);
      console.log(`   Membres ignorés: ${skipped}`);
      console.log(`   Total de membres dans le groupe: ${finalMembers.length}`);
      console.log(`\n💡 Vous pouvez maintenant utiliser ce groupe ID dans l'application!`);
      
    } catch (e) {
      console.error('❌ Erreur lors de la création du groupe:', e.message);
      if (e.stack) console.error(e.stack);
      console.error('\n💡 Astuce: Vous pouvez avoir besoin d\'utiliser SUPABASE_SERVICE_KEY au lieu de SUPABASE_ANON_KEY');
      console.error('   pour avoir les permissions nécessaires à la création de groupes.');
      process.exit(1);
    }
    process.exit(0);
  }
  
  // Option: lister les groupes
  if (args.includes('--list-groups')) {
    console.log('📋 Groupes existants:\n');
    try {
      const groups = await listGroups();
      if (groups.length === 0) {
        console.log('  Aucun groupe trouvé.');
        console.log('\n💡 Astuce: Utilisez --create-group pour créer un groupe de test');
        console.log('   Exemple: node scripts/add_test_members.js --create-group --count 50');
      } else {
        groups.forEach((g, i) => {
          const date = new Date(g.created_at).toLocaleDateString('fr-FR');
          console.log(`  ${i + 1}. ${g.name}`);
          console.log(`     ID: ${g.id}`);
          console.log(`     Visibilité: ${g.visibility || 'private'}`);
          console.log(`     Créé le: ${date}`);
          console.log('');
        });
      }
    } catch (e) {
      console.error('❌ Erreur:', e.message);
      const errorMsg = String(e.message || '').toLowerCase();
      if (errorMsg.includes('permission') || errorMsg.includes('rls') || errorMsg.includes('policy')) {
        console.error('\n💡 Astuce: Vous pouvez avoir besoin d\'utiliser SUPABASE_SERVICE_KEY');
        console.error('   pour contourner les politiques de sécurité (RLS).');
        console.error('   Exemple: SUPABASE_SERVICE_KEY=... node scripts/add_test_members.js --list-groups');
      }
      process.exit(1);
    }
    process.exit(0);
  }
  
  // Extraire les arguments
  const groupId = args[0];
  const countIndex = args.indexOf('--count');
  const count = countIndex >= 0 && args[countIndex + 1] 
    ? parseInt(args[countIndex + 1], 10) 
    : 50;
  const useExisting = args.includes('--use-existing');
  
  if (!groupId || groupId.startsWith('--')) {
    console.error('❌ Veuillez fournir un ID de groupe');
    console.error('   Utilisez --list-groups pour voir les groupes disponibles');
    process.exit(1);
  }
  
  if (isNaN(count) || count < 1) {
    console.error('❌ Le nombre de membres doit être un entier positif');
    process.exit(1);
  }
  
  console.log(`🚀 Ajout de ${count} membres de test au groupe ${groupId}\n`);
  
  try {
    // Vérifier que le groupe existe
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, name')
      .eq('id', groupId)
      .maybeSingle();
    
    if (groupError) throw groupError;
    if (!group) {
      console.error(`❌ Groupe non trouvé: ${groupId}`);
      console.error('   Utilisez --list-groups pour voir les groupes disponibles');
      process.exit(1);
    }
    
    console.log(`✅ Groupe trouvé: ${group.name}\n`);
    
    // Obtenir les membres actuels
    const existingMembers = await getGroupMembers(groupId);
    console.log(`📊 Membres actuels: ${existingMembers.length}\n`);
    
    let profiles = [];
    
    if (useExisting) {
      // Utiliser des profils existants
      console.log('📋 Récupération des profils existants...');
      
      // Récupérer plus de profils que nécessaire pour avoir assez après filtrage
      const { data: allProfiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .limit(count * 2); // Prendre plus que nécessaire
      
      if (profilesError) throw profilesError;
      
      // Filtrer pour exclure les membres déjà dans le groupe
      const existingSet = new Set(existingMembers);
      const filteredProfiles = (allProfiles || [])
        .filter(p => !existingSet.has(p.id))
        .slice(0, count); // Prendre seulement le nombre demandé
      
      if (filteredProfiles.length === 0) {
        console.error('❌ Aucun profil existant trouvé qui ne soit pas déjà dans le groupe.');
        console.error('   Créez d\'abord des profils ou utilisez sans --use-existing');
        process.exit(1);
      }
      
      profiles = filteredProfiles;
      console.log(`  ✅ ${profiles.length} profils existants trouvés (après filtrage)\n`);
    } else {
      // Créer des profils de test
      console.log('👤 Création de profils de test...');
      for (let i = 1; i <= count; i++) {
        try {
          const profile = await createTestProfile(i);
          profiles.push(profile);
          
          // Délai pour éviter de surcharger la base
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (e) {
          console.error(`  ❌ Erreur pour le profil ${i}:`, e.message);
        }
      }
      console.log(`\n✅ ${profiles.length} profils créés\n`);
    }
    
    // Ajouter les membres au groupe
    console.log('➕ Ajout des membres au groupe...');
    let added = 0;
    let skipped = 0;
    
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      try {
        const result = await addMemberToGroup(groupId, profile.id);
        if (result) {
          added++;
          if (added % 10 === 0) {
            console.log(`  Progression: ${added}/${profiles.length} ajoutés...`);
          }
        } else {
          skipped++;
        }
        
        // Délai pour éviter de surcharger la base
        if ((i + 1) % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (e) {
        console.error(`  ❌ Erreur pour ${profile.display_name || profile.email}:`, e.message);
        skipped++;
      }
    }
    
    // Vérification finale
    const finalMembers = await getGroupMembers(groupId);
    
    console.log(`\n✅ Terminé!`);
    console.log(`   Membres ajoutés: ${added}`);
    console.log(`   Membres ignorés (déjà présents): ${skipped}`);
    console.log(`   Total de membres dans le groupe: ${finalMembers.length}`);
    
  } catch (e) {
    console.error('❌ Erreur:', e.message);
    if (e.stack) console.error(e.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createTestProfile, addMemberToGroup, listGroups };

