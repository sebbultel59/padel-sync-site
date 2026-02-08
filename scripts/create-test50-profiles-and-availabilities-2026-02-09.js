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

const GROUP_HINT = 'groupe de test - 50+ membres';
const ZONE_HINT = 'dunkerque';
const CLUB_NAMES = [
  '4Padel Dunkerque',
  'Hercule & Hops',
  'Le miras padel',
  'Raquettes Club Saint Omer',
];

const START_DATE = '2026-02-09';
const END_DATE = '2026-02-15';
const TZ = '+01:00';
const SLOT = ['18:00', '21:00'];

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

const randomPick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const run = async () => {
  // 1) Group
  const { data: groups, error: groupErr } = await supabase
    .from('groups')
    .select('id, name')
    .ilike('name', `%${GROUP_HINT}%`);
  if (groupErr) throw groupErr;
  const group = (groups || [])[0];
  if (!group?.id) {
    console.error('❌ Groupe introuvable:', GROUP_HINT);
    process.exit(1);
  }
  console.log(`✅ Groupe: ${group.name} (${group.id})`);

  // 2) Zone
  const { data: zones, error: zoneErr } = await supabase
    .from('zones')
    .select('id, name')
    .ilike('name', `%${ZONE_HINT}%`);
  if (zoneErr) throw zoneErr;
  const zone = (zones || []).find((z) =>
    (z.name || '').toLowerCase().includes('dunkerque') &&
    (z.name || '').toLowerCase().includes('calais') &&
    (z.name || '').toLowerCase().includes('boulogne')
  ) || zones?.[0];
  if (!zone?.id) {
    console.error('❌ Zone introuvable pour:', ZONE_HINT);
    process.exit(1);
  }
  console.log(`✅ Zone: ${zone.name} (${zone.id})`);

  // 3) Clubs
  const { data: clubsData, error: clubsErr } = await supabase
    .from('clubs')
    .select('id, name')
    .in('name', CLUB_NAMES);
  if (clubsErr) throw clubsErr;
  const clubsByName = new Map((clubsData || []).map((c) => [c.name, c]));
  const missing = CLUB_NAMES.filter((n) => !clubsByName.has(n));
  if (missing.length) {
    console.error('❌ Clubs manquants:', missing.join(', '));
    process.exit(1);
  }
  const clubs = CLUB_NAMES.map((n) => clubsByName.get(n));
  console.log(`✅ Clubs OK: ${clubs.map((c) => c.name).join(', ')}`);

  // 4) Create users
  const createdUsers = [];
  for (let i = 1; i <= 20; i += 1) {
    const email = `test50_${String(i).padStart(2, '0')}@padelsync.test`;
    const password = 'Test1234!';
    const name = `Test50 ${String(i).padStart(2, '0')}`;

    const { data: userRes, error: userErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirmed: true,
      user_metadata: { name },
    });
    if (userErr) {
      console.error('❌ Erreur createUser:', email, userErr.message);
      process.exit(1);
    }
    const userId = userRes?.user?.id;
    if (!userId) {
      console.error('❌ User ID manquant:', email);
      process.exit(1);
    }
    createdUsers.push({ id: userId, email, name });
  }
  console.log(`✅ Users créés: ${createdUsers.length}`);

  // 5) Update profiles + group_members + user_clubs
  for (const user of createdUsers) {
    const preferredClub = randomPick(clubs);
    const profileUpdate = {
      display_name: user.name,
      name: user.name,
      tz: 'Europe/Paris',
      level: Math.floor(Math.random() * 7) + 1,
      niveau: String(Math.floor(Math.random() * 8) + 1),
      main: Math.random() > 0.5 ? 'droite' : 'gauche',
      cote: ['droite', 'gauche', 'les_deux'][Math.floor(Math.random() * 3)],
      handedness: Math.random() > 0.5 ? 'right' : 'left',
      side_pref: ['left', 'right', 'either'][Math.floor(Math.random() * 3)],
      play_pref: ['morning', 'evening', 'any'][Math.floor(Math.random() * 3)],
      zone_id: zone.id,
      role: 'player',
    };

    const { error: profileErr } = await supabase
      .from('profiles')
      .update(profileUpdate)
      .eq('id', user.id);
    if (profileErr) {
      console.error('❌ Erreur update profile:', user.email, profileErr.message);
      process.exit(1);
    }

    const { error: gmErr } = await supabase
      .from('group_members')
      .upsert(
        { group_id: group.id, user_id: user.id, role: 'member' },
        { onConflict: 'group_id,user_id' }
      );
    if (gmErr) {
      console.error('❌ Erreur group_members:', user.email, gmErr.message);
      process.exit(1);
    }

    const userClubsRows = clubs.map((c) => ({
      user_id: user.id,
      club_id: c.id,
      is_accepted: true,
      is_preferred: c.id === preferredClub.id,
    }));
    const { error: ucErr } = await supabase
      .from('user_clubs')
      .upsert(userClubsRows, { onConflict: 'user_id,club_id' });
    if (ucErr) {
      console.error('❌ Erreur user_clubs:', user.email, ucErr.message);
      process.exit(1);
    }
  }
  console.log('✅ Profiles, group_members, user_clubs mis à jour');

  // 6) Availabilities
  const dates = dateRange(START_DATE, END_DATE);
  const rows = [];
  for (const date of dates) {
    const start = `${date}T${SLOT[0]}:00${TZ}`;
    const end = `${date}T${SLOT[1]}:00${TZ}`;
    for (const user of createdUsers) {
      rows.push({
        group_id: group.id,
        user_id: user.id,
        start,
        end,
        status: 'available',
      });
    }
  }

  let inserted = 0;
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase
      .from('availability')
      .upsert(batch, { onConflict: 'user_id,group_id,start,end' });
    if (error) {
      console.error('❌ Erreur insertion availability:', error.message);
      process.exit(1);
    }
    inserted += batch.length;
  }

  console.log(`✅ Dispos créées (upsert): ${inserted}`);
  console.log('🎉 Terminé');
};

run().catch((err) => {
  console.error('❌ Erreur inattendue:', err);
  process.exit(1);
});
