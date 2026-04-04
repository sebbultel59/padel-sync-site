const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Option 1: cibler par email
const TARGET_EMAIL = process.env.TARGET_EMAIL;
// Option 2: cibler directement par id (UUID)
const TARGET_USER_ID = process.env.TARGET_USER_ID;

// Nouveau mot de passe
const NEW_PASSWORD = process.env.NEW_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants");
}

if (!NEW_PASSWORD) {
  throw new Error("Env: NEW_PASSWORD manquant");
}

if (String(NEW_PASSWORD).length > 72) {
  throw new Error(
    `NEW_PASSWORD trop long (${String(NEW_PASSWORD).length}). Max Supabase: 72 caractères.`
  );
}

if (!TARGET_USER_ID && !TARGET_EMAIL) {
  throw new Error("Env: TARGET_EMAIL ou TARGET_USER_ID requis");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function resolveUserId() {
  if (TARGET_USER_ID) return TARGET_USER_ID;

  const cleanedEmail = String(TARGET_EMAIL || "").trim().toLowerCase();
  if (!cleanedEmail) throw new Error("TARGET_EMAIL vide");

  // listUsers renvoie la 1ère page. Si tu as beaucoup d'utilisateurs, on pourra paginer.
  const { data: usersRes, error: listErr } = await supabase.auth.admin.listUsers({
    search: cleanedEmail,
  });
  if (listErr) throw listErr;

  const matches = (usersRes?.users || []).filter(
    (u) => String(u.email || "").toLowerCase() === cleanedEmail
  );

  if (!matches.length || !matches[0]?.id) {
    const sample = (usersRes?.users || [])
      .slice(0, 5)
      .map((u) => u.email)
      .filter(Boolean);
    throw new Error(
      `Utilisateur introuvable (par email exact). TARGET_EMAIL=${TARGET_EMAIL}. ` +
      `Emails trouvés (extrait): ${sample.join(", ") || "(aucun)"}`
    );
  }

  // On prend le premier match exact (en pratique il devrait n'y avoir qu'un seul utilisateur par email).
  return matches[0].id;
}

async function run() {
  const userId = await resolveUserId();

  // Log de sécurité: afficher l'utilisateur exact ciblé (email + id)
  const { data: userData, error: userDataErr } = await supabase.auth.admin.getUserById(userId);
  if (userDataErr) throw userDataErr;
  const user = userData?.user ?? userData;
  console.log("Cible admin:", { id: user?.id, email: user?.email });

  const { error: updErr } = await supabase.auth.admin.updateUserById(userId, {
    password: NEW_PASSWORD,
  });
  if (updErr) throw updErr;

  console.log("OK: mot de passe mis à jour pour", TARGET_EMAIL || userId);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

