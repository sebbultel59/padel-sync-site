const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
let SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Nettoyage au cas où une valeur parasite est concaténée à la clé
SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY.replace(/image\.png.*$/i, '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant dans l’environnement.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const groupNameHints = [
  'test 50+ membres',
  'test 50 + membres',
  'test 50 membres',
  'test membres +50',
  'test membres + 50',
];

const slots = [
  ['09:00', '10:30'],
  ['12:30', '14:00'],
  ['18:30', '20:00'],
];

const tz = '+01:00'; // CET en janvier
const startDate = '2026-01-26';
const endDate = '2026-02-01';

const pad = (n) => String(n).padStart(2, '0');
const addDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 0, 0, 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

const dateRange = (start, end) => {
  const out = [];
  let i = 0;
  let current = start;
  while (current <= end) {
    out.push(current);
    i += 1;
    current = addDays(start, i);
  }
  return out;
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const pickGroup = (groups) => {
  const normalize = (s) => (s || '').toLowerCase();
  const candidates = groups.filter((g) =>
    groupNameHints.some((hint) => normalize(g.name).includes(hint))
  );
  return candidates[0] || groups[0] || null;
};

const run = async () => {
  const { data: groups, error: groupErr } = await supabase
    .from('groups')
    .select('id, name')
    .ilike('name', '%test%');

  if (groupErr) {
    console.error('❌ Erreur chargement groupes:', groupErr.message);
    process.exit(1);
  }

  const group = pickGroup(groups || []);
  if (!group?.id) {
    console.error('❌ Groupe "Test 50+ membres" introuvable.');
    process.exit(1);
  }

  console.log(`✅ Groupe sélectionné: ${group.name} (${group.id})`);

  const { data: members, error: membersErr } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', group.id)
    .order('user_id', { ascending: true })
    .limit(15);

  if (membersErr) {
    console.error('❌ Erreur chargement membres:', membersErr.message);
    process.exit(1);
  }

  if (!members || members.length < 15) {
    console.error('❌ Pas assez de membres (besoin de 15).');
    process.exit(1);
  }

  const memberIds = members.map((m) => m.user_id);
  const dates = dateRange(startDate, endDate);

  const rows = [];
  for (const date of dates) {
    for (const [startTime, endTime] of slots) {
      const start = `${date}T${startTime}:00${tz}`;
      const end = `${date}T${endTime}:00${tz}`;
      for (const userId of memberIds) {
        rows.push({
          id: crypto.randomUUID(),
          group_id: group.id,
          user_id: userId,
          start,
          end,
          status: 'available',
        });
      }
    }
  }

  let inserted = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase
      .from('availability')
      .upsert(batch, { onConflict: 'user_id,group_id,start,end' });

    if (error) {
      console.error('❌ Erreur insertion batch:', error.message);
      process.exit(1);
    }
    inserted += batch.length;
  }

  const { count } = await supabase
    .from('availability')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', group.id)
    .gte('start', `${startDate}T00:00:00${tz}`)
    .lte('start', `${endDate}T23:59:59${tz}`);

  console.log(`✅ Dispos créées (upsert): ${inserted}`);
  console.log(`📊 Dispos sur la période: ${count || 0}`);
};

run().catch((err) => {
  console.error('❌ Erreur inattendue:', err);
  process.exit(1);
});
