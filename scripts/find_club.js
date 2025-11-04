const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://iieiggyqcncbkjwsdcxl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZWlnZ3lxY25jYmtqd3NkY3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcyNjk3MzQsImV4cCI6MjA3Mjg0NTczNH0.tTCN1140MVgNswkq5HSXzC3fS0Uuylb-5ZP6h1vTWMI";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Configurez SUPABASE_URL et SUPABASE_ANON_KEY');
  process.exit(1);
}

const s = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const q = process.argv.slice(2).join(' ').trim();
  if (!q) {
    console.error('Usage: node scripts/find_club.js <termes de recherche>');
    process.exit(1);
  }

  const patterns = [
    `name.ilike.%${q}%`,
    `address.ilike.%${q}%`
  ];

  const { data, error } = await s
    .from('clubs')
    .select('id,name,address,lat,lng,phone')
    .or(patterns.join(','))
    .order('name');

  if (error) {
    console.error('Erreur Supabase:', error);
    process.exit(1);
  }

  console.log(JSON.stringify(data, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
