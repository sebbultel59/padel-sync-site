// Script de test pour vérifier le système de badges
// Usage: node test-badge-system.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Variables d\'environnement manquantes');
  console.error('Assurez-vous que EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY sont définies');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testBadgeSystem() {
  console.log('🧪 Test du système de badges\n');

  // 1. Vérifier que les tables existent
  console.log('1️⃣ Vérification des tables...');
  try {
    const { data: badgeDefinitions, error: defError } = await supabase
      .from('badge_definitions')
      .select('id, code, label, category, is_active')
      .eq('is_active', true)
      .limit(5);

    if (defError) {
      console.error('❌ Erreur lors de la vérification de badge_definitions:', defError.message);
      if (defError.message.includes('relation') || defError.message.includes('does not exist')) {
        console.error('   → La migration n\'a peut-être pas été appliquée');
        console.error('   → Exécutez: supabase db reset ou appliquez la migration manuellement');
      }
      return;
    }

    console.log(`✅ Table badge_definitions existe (${badgeDefinitions?.length || 0} badges actifs trouvés)`);
    
    if (badgeDefinitions && badgeDefinitions.length > 0) {
      console.log('   Exemples de badges:');
      badgeDefinitions.slice(0, 3).forEach(badge => {
        console.log(`   - ${badge.code}: ${badge.label} (${badge.category})`);
      });
    }

    const { data: userBadges, error: ubError } = await supabase
      .from('user_badges')
      .select('user_id, badge_id')
      .limit(1);

    if (ubError) {
      console.error('❌ Erreur lors de la vérification de user_badges:', ubError.message);
      return;
    }

    console.log('✅ Table user_badges existe\n');
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return;
  }

  // 2. Vérifier les Edge Functions (via la config)
  console.log('2️⃣ Vérification des Edge Functions...');
  const fs = require('fs');
  const path = require('path');
  
  const evaluateBadgesPath = path.join(__dirname, 'supabase/functions/evaluate-badges/index.ts');
  const recordMatchResultPath = path.join(__dirname, 'supabase/functions/record-match-result/index.ts');
  
  if (fs.existsSync(evaluateBadgesPath)) {
    console.log('✅ evaluate-badges existe');
  } else {
    console.log('❌ evaluate-badges n\'existe pas');
  }
  
  if (fs.existsSync(recordMatchResultPath)) {
    console.log('✅ record-match-result existe');
    
    // Vérifier si la fonction appelle evaluate-badges
    const content = fs.readFileSync(recordMatchResultPath, 'utf8');
    if (content.includes('evaluate-badges')) {
      console.log('✅ record-match-result appelle evaluate-badges');
    } else {
      console.log('⚠️  record-match-result ne semble pas appeler evaluate-badges');
    }
  } else {
    console.log('❌ record-match-result n\'existe pas');
  }
  console.log('');

  // 3. Statistiques des badges
  console.log('3️⃣ Statistiques des badges...');
  try {
    const { count: totalBadges, error: countError } = await supabase
      .from('badge_definitions')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    if (!countError) {
      console.log(`✅ Total de badges actifs: ${totalBadges}`);
    }

    const { count: totalUnlocked, error: unlockedError } = await supabase
      .from('user_badges')
      .select('*', { count: 'exact', head: true });

    if (!unlockedError) {
      console.log(`✅ Total de badges débloqués: ${totalUnlocked}`);
    }

    // Badges les plus débloqués
    const { data: popularBadges, error: popularError } = await supabase
      .from('user_badges')
      .select('badge_id')
      .limit(1000);

    if (!popularError && popularBadges) {
      const badgeCounts = {};
      popularBadges.forEach(ub => {
        badgeCounts[ub.badge_id] = (badgeCounts[ub.badge_id] || 0) + 1;
      });

      const sorted = Object.entries(badgeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (sorted.length > 0) {
        console.log('\n   Top badges débloqués:');
        for (const [badgeId, count] of sorted) {
          const { data: badge } = await supabase
            .from('badge_definitions')
            .select('code, label')
            .eq('id', badgeId)
            .single();
          if (badge) {
            console.log(`   - ${badge.label}: ${count} fois`);
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Erreur lors des statistiques:', error.message);
  }

  console.log('\n✅ Tests terminés !');
  console.log('\n📝 Prochaines étapes:');
  console.log('   1. Déployez les Edge Functions: supabase functions deploy');
  console.log('   2. Testez en enregistrant un match classé ou tournoi');
  console.log('   3. Vérifiez que les badges se débloquent dans le profil');
}

testBadgeSystem().catch(console.error);

