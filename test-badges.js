// Script de test pour vérifier les badges dans Supabase
// Usage: node test-badges.js

const { createClient } = require('@supabase/supabase-js');

// Récupérer les variables d'environnement
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://iieiggyqcncbkjwsdcxl.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testBadges() {
  console.log('🔍 Test des badges...\n');

  // 1. Vérifier que la table badge_definitions existe
  console.log('1. Vérification de badge_definitions...');
  const { data: badges, error: badgesError } = await supabase
    .from('badge_definitions')
    .select('*')
    .eq('is_active', true)
    .limit(5);

  if (badgesError) {
    console.error('❌ Erreur badge_definitions:', badgesError);
    return;
  }

  console.log(`✅ ${badges?.length || 0} badges actifs trouvés`);
  if (badges && badges.length > 0) {
    console.log('   Exemples:', badges.map(b => b.code).join(', '));
  }

  // 2. Vérifier que la table user_badges existe
  console.log('\n2. Vérification de user_badges...');
  const { data: userBadges, error: userBadgesError } = await supabase
    .from('user_badges')
    .select('*')
    .limit(5);

  if (userBadgesError) {
    console.error('❌ Erreur user_badges:', userBadgesError);
    return;
  }

  console.log(`✅ ${userBadges?.length || 0} badges utilisateur trouvés`);

  // 3. Vérifier les RLS policies
  console.log('\n3. Test de lecture avec un user_id fictif...');
  const testUserId = '00000000-0000-0000-0000-000000000000';
  const { data: testBadges, error: testError } = await supabase
    .from('user_badges')
    .select('*')
    .eq('user_id', testUserId);

  if (testError) {
    console.error('❌ Erreur RLS:', testError);
  } else {
    console.log('✅ RLS fonctionne (lecture autorisée)');
  }

  console.log('\n✅ Tests terminés!');
}

testBadges().catch(console.error);


