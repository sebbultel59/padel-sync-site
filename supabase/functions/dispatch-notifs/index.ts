function formatShortDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
}

function formatWeekdayAndTimeFr(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${weekday} ${hh}h${mm}`;
}

function renderMessage(
    kind: string,
    ctx: { actor_name?: string; starts_at?: string; ends_at?: string; group_name?: string; payload?: any }
  ) {
    switch (kind) {
      // --- joueurs du match
      case "match_pending":   return { title: "Nouveau match à confirmer", body: "Un match est en RSVP. Donne ta réponse !" };
      case "rsvp_accepted":   return { title: "Un joueur a confirmé", body: `${ctx.actor_name ?? "Un joueur"} a confirmé sa participation.` };
      case "rsvp_declined":   return { title: "Un joueur a refusé", body: `${ctx.actor_name ?? "Un joueur"} a refusé le match.` };
      case "rsvp_withdraw":   return { title: "Un joueur s'est retiré", body: `${ctx.actor_name ?? "Un joueur"} s'est retiré du match.` };
      case "match_confirmed": return { title: "🎾 Tu as été sélectionné.e pour un match 🎾", body: "Consulte tes matchs validés" };
      case "match_canceled":  return { title: "Match annulé", body: "Le match a été annulé." };
      case "match_result_recorded": return { title: "Résultat enregistré", body: ctx.payload?.message || "Le résultat du match a été enregistré." };
  
      // --- membres du groupe (NOUVEAU)
      case "group_member_join":     return { title: "Nouveau membre", body: `${ctx.actor_name ?? "Un joueur"} a rejoint le groupe.` };
      case "group_member_leave":    return { title: "Départ d'un membre", body: `${ctx.actor_name ?? "Un joueur"} a quitté le groupe.` };
      case "group_match_created":   return { title: "Un match a été créé dans ton groupe", body: "Un match a été créé dans ton groupe" };
      case "group_match_validated": return { title: "🎾 Tu as été sélectionné.e pour un match 🎾", body: "Consulte tes matchs validés" };
      case "group_join_request_approved": return { title: "Demande acceptée ✅", body: ctx.payload?.message || "Ta demande pour rejoindre le groupe a été acceptée." };
      case "group_join_request_rejected": return { title: "Demande refusée", body: ctx.payload?.message || "Ta demande pour rejoindre le groupe a été refusée." };
      case "new_week_dispos": return { title: "Nouvelle semaine : Renseigne tes dispos", body: "Nouvelle semaine : Renseigne tes dispos" };

      // --- V1 opportunités de match (Trouver)
      case "match_proposed": {
        const slot = formatWeekdayAndTimeFr(ctx.payload?.starts_at);
        const remaining = Number(ctx.payload?.remaining_slots ?? ctx.payload?.places_to_fill ?? 0);
        const plural = remaining > 1 ? 's' : '';
        return {
          title: '🔥 Nouvelle partie proposée',
          body: slot
            ? `${slot} • ${remaining} place${plural} à compléter`
            : 'Nouvelle partie à compléter disponible',
        };
      }
      case "match_almost_full": {
        const slot = formatWeekdayAndTimeFr(ctx.payload?.starts_at);
        return {
          title: '⚡ Plus qu’une place pour jouer',
          body: slot ? `Rejoins la partie de ${slot}` : 'Plus qu’une place pour jouer',
        };
      }
  
      // --- badges et trophées
      case "badge_unlocked": return { title: "Nouveau trophée débloqué 🏆", body: ctx.payload?.message || "Tu as débloqué un nouveau badge !" };
  
      // --- seuils de dispo (NOUVEAU)
      case "group_slot_hot_3":      return { title: "Ça se chauffe à 3 🔥", body: "Un créneau atteint 3 joueurs disponibles." };
  case "group_slot_ready_4": {
    const groupName = ctx.group_name ?? "ton groupe";
    const text = `Nouveaux matchs possibles dans "${groupName}"`;
    return { title: text, body: text };
  }
      case "availability_missing_all": return { title: "Nouvelle semaine : Renseigne tes dispos", body: "Nouvelle semaine : Renseigne tes dispos" };
      case "availability_reminder": {
        const weekStart = ctx.payload?.week_start;
        const weekLabel = weekStart ? `Semaine du ${formatShortDate(weekStart)}` : "";
        const title = ctx.group_name ? `Ajoute tes dispos — ${ctx.group_name}` : "Ajoute tes dispos";
        const body = weekLabel
          ? `${weekLabel}. 2–3 créneaux suffisent pour lancer les matchs.`
          : "Ajoute 2–3 créneaux pour lancer les matchs.";
        return { title, body };
      }
  
      // --- notifications de club (NOUVEAU)
      case "club_notification":     
        // Priorité: message > body > fallback
        const clubMessage = ctx.payload?.message || ctx.payload?.body || "Nouvelle notification de votre club";
        const clubTitle = ctx.payload?.title || "Message de votre club";
        console.log('[renderMessage] club_notification - title:', clubTitle, 'message:', clubMessage);
        return { 
          title: clubTitle, 
          body: clubMessage
        };
  
      default: return { title: "Padel Sync", body: "Mise à jour." };
    }
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

async function sendExpoPush(messages: any[]): Promise<boolean> {
  try {
    console.log(`[Expo] Envoi de ${messages.length} notification(s) à Expo...`);
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("[Expo] ❌ Erreur lors de l'envoi:", res.status, errorText);
      return false;
    }
    
    const result = await res.json();
    console.log(`[Expo] ✅ Réponse Expo:`, JSON.stringify(result));
    
    // Vérifier si Expo a retourné des erreurs dans la réponse
    if (result.data && Array.isArray(result.data)) {
      const errors = result.data.filter((r: any) => r.status === 'error');
      if (errors.length > 0) {
        console.error(`[Expo] ⚠️ ${errors.length} erreur(s) dans la réponse Expo:`, errors);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error("[Expo] ❌ Exception lors de l'envoi:", error);
    return false;
  }
}

const chunk = <T,>(arr: T[], n = 99) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, key);

  // Récupérer uniquement les jobs non envoyés
  // Filtrer directement dans la requête SQL pour éviter de traiter les anciens jobs
  let jobsQuery = supabase
    .from("notification_jobs")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(50);

  // Filtrer les jobs non envoyés (sent_at IS NULL) directement dans la requête
  // Limiter aussi aux jobs créés dans les dernières 24h pour éviter de traiter d'anciens jobs
  const oneDayAgo = new Date();
  oneDayAgo.setHours(oneDayAgo.getHours() - 24);
  
  jobsQuery = jobsQuery
    .is("sent_at", null)  // Seulement les jobs non envoyés
    .gte("created_at", oneDayAgo.toISOString());  // Seulement les jobs récents (24h)

  const { data: jobs } = await jobsQuery;
  
  if (!jobs?.length) {
    return new Response("no pending jobs", { status: 200 });
  }

  console.log(`[Dispatch] ${jobs.length} job(s) à traiter`);

  const userIds = Array.from(
    new Set(jobs.flatMap((j: any) => [j.actor_id, ...(j.recipients || [])].filter(Boolean)))
  );
  const matchIds = Array.from(new Set(jobs.map((j: any) => j.match_id).filter(Boolean)));
  const groupIds = Array.from(new Set(jobs.map((j: any) => j.group_id).filter(Boolean)));

  const [{ data: profiles }, { data: matches }, { data: groups }] = await Promise.all([
    supabase.from("profiles").select("id, display_name, expo_push_token, notification_preferences").in("id", userIds),
    supabase.from("matches").select("id, time_slots:time_slot_id (starts_at, ends_at)").in("id", matchIds),
    supabase.from("groups").select("id, name").in("id", groupIds),
  ]);

  const profById = new Map((profiles || []).map((p: any) => [p.id, p]));
  const matchById = new Map((matches || []).map((m: any) => [m.id, m]));
  const groupById = new Map((groups || []).map((g: any) => [g.id, g]));

  const messages: any[] = [];
  const processedJobIds: string[] = [];
  const jobsWithMessages: any[] = []; // Jobs qui ont des messages à envoyer
  const allSentTokens = new Set<string>(); // Tous les tokens uniques pour le log
  
  console.log(`[Dispatch] Début traitement de ${jobs.length} job(s)`);

  for (const job of jobs) {
    
    console.log('[Dispatch] Job reçu:', {
        id: job.id,
        kind: job.kind,
        match_id: job.match_id,
        group_id: job.group_id,
        actor_id: job.actor_id,
        recipients: job.recipients,
        payload: job.payload,
      });
    const m = matchById.get(job.match_id);
    const g = groupById.get(job.group_id);
    const actor = job.actor_id ? profById.get(job.actor_id) : null;

    // Pour les notifications de club, logger le payload pour debug
    if (job.kind === 'club_notification') {
      console.log('[Dispatch] Notification de club - payload:', JSON.stringify(job.payload));
      console.log('[Dispatch] Notification de club - message:', job.payload?.message);
      console.log('[Dispatch] Notification de club - title:', job.payload?.title);
    }

    const { title, body } = renderMessage(job.kind, {
      actor_name: actor?.display_name,
      starts_at: m?.time_slots?.starts_at,
      ends_at: m?.time_slots?.ends_at,
      group_name: g?.name,
      payload: job.payload,
    });

    // Logger le résultat pour les notifications de club
    if (job.kind === 'club_notification') {
      console.log('[Dispatch] Notification de club - titre final:', title);
      console.log('[Dispatch] Notification de club - message final:', body);
    }

    const recips: string[] = Array.isArray(job.recipients) ? job.recipients : [];
    // Dédupliquer les destinataires pour éviter les doublons
    const uniqueRecips = Array.from(new Set(recips));
    
    if (uniqueRecips.length !== recips.length) {
      console.log(`[Dispatch] ⚠️ Doublons détectés dans recipients: ${recips.length} -> ${uniqueRecips.length} uniques`);
    }
    
    // Utiliser un Set pour éviter les doublons de tokens
    const sentTokens = new Set<string>();
    
    for (const uid of uniqueRecips) {
      const p = profById.get(uid);
      if (!p?.expo_push_token?.startsWith("ExponentPushToken")) continue;
      
      // Vérifier les préférences de notification de l'utilisateur
      if (p.notification_preferences && typeof p.notification_preferences === 'object') {
        const preferenceKey = job.kind;
        // Si la préférence existe et est à false, ignorer cette notification
        if (preferenceKey in p.notification_preferences && p.notification_preferences[preferenceKey] === false) {
          console.log(`[Dispatch] ⚠️ Notification ${preferenceKey} désactivée pour user ${uid}, ignoré`);
          continue;
        }
      }
      
      // Éviter d'envoyer plusieurs fois au même token
      if (sentTokens.has(p.expo_push_token)) {
        console.log(`[Dispatch] ⚠️ Token déjà ajouté pour user ${uid}, ignoré`);
        continue;
      }
      
      sentTokens.add(p.expo_push_token);
      allSentTokens.add(p.expo_push_token); // Ajouter au Set global pour le log
      console.log(`[Dispatch] Ajout message pour user ${uid}, token: ${p.expo_push_token.substring(0, 20)}...`);
      messages.push({
        to: p.expo_push_token,
        sound: "default",
        title,
        body,
        data: { kind: job.kind, match_id: job.match_id, group_id: job.group_id },
        job_id: job.id,
      });
    }
    
    // Si des messages ont été créés pour ce job, l'ajouter à la liste
    if (sentTokens.size > 0) {
      jobsWithMessages.push(job);
    } else {
      console.log(`[Dispatch] ⚠️ Job ${job.id} n'a pas de destinataires valides, ignoré`);
    }
  }
  
  if (messages.length) {
    // IMPORTANT: Marquer les jobs comme envoyés JUSTE AVANT l'envoi pour éviter les doublons
    // mais dans un try-catch pour annuler si l'envoi échoue
    const now = new Date().toISOString();
    const jobIdsToMark = jobsWithMessages.map((j: any) => j.id);
    
    // Marquer les jobs comme envoyés AVANT l'envoi pour éviter les doublons
    const { data: updatedJobs, error: updateError } = await supabase
      .from("notification_jobs")
      .update({ sent_at: now })
      .in("id", jobIdsToMark)
      .is("sent_at", null) // Seulement si pas déjà envoyé
      .select("id");
    
    if (updateError) {
      console.log('[Dispatch] Erreur lors du marquage sent_at:', updateError);
      // Si on ne peut pas marquer, ne pas envoyer pour éviter les doublons
      return new Response(JSON.stringify({ error: 'Failed to mark jobs as sent' }), { status: 500 });
    }
    
    const updatedCount = updatedJobs?.length || 0;
    console.log(`[Dispatch] ${updatedCount} job(s) marqué(s) comme envoyés (sur ${jobIdsToMark.length} total)`);
    
    // Si certains jobs n'ont pas été mis à jour, ils ont déjà été envoyés
    if (updatedCount < jobIdsToMark.length) {
      console.log(`[Dispatch] ⚠️ ${jobIdsToMark.length - updatedCount} job(s) déjà envoyé(s), ignoré(s)`);
    }

    const updatedIdSet = new Set((updatedJobs || []).map((j: any) => j.id));
    if (updatedIdSet.size === 0) {
      return new Response("no new jobs to send", { status: 200 });
    }

    processedJobIds.push(...updatedIdSet);

    const messagesToSend = messages.filter((m: any) => updatedIdSet.has(m.job_id));
    if (!messagesToSend.length) {
      return new Response("no messages to send", { status: 200 });
    }

    // Envoyer les notifications
    let sendSuccess = true;
    try {
      console.log(`[Dispatch] Préparation envoi de ${messagesToSend.length} message(s)`);
      for (const batch of chunk(messagesToSend, 99)) {
        console.log(`[Dispatch] Envoi batch de ${batch.length} message(s)...`);
        const result = await sendExpoPush(batch);
        if (!result) {
          sendSuccess = false;
          console.log('[Dispatch] ⚠️ Erreur lors de l\'envoi à Expo');
        }
      }
      
      if (sendSuccess) {
        console.log(`[Dispatch] ✅ ${messages.length} notification(s) envoyée(s) avec succès pour ${processedJobIds.length} job(s)`);
      } else {
        console.log(`[Dispatch] ⚠️ ${messages.length} notification(s) partiellement envoyée(s) (certaines ont échoué)`);
      }
    } catch (error) {
      console.error('[Dispatch] ❌ Erreur lors de l\'envoi des notifications:', error);
      // Les jobs sont déjà marqués comme envoyés, mais l'envoi a échoué
      // On ne peut pas les "dé-marquer" car cela pourrait causer des doublons
      // On log juste l'erreur
    }
  } else if (jobsWithMessages.length > 0) {
    // Aucun message à envoyer (pas de tokens valides) mais des jobs ont des destinataires
    console.log(`[Dispatch] ⚠️ ${jobsWithMessages.length} job(s) avec destinataires mais aucun token Expo valide`);
  }

  // IMPORTANT: Ne PAS supprimer les notifications pour qu'elles apparaissent dans l'historique
  // Les notifications doivent rester dans la table pour être affichées dans l'app

  // NE PLUS SUPPRIMER LES NOTIFICATIONS - Elles doivent rester pour l'historique
  // Les notifications seront nettoyées manuellement ou via un script séparé si nécessaire
  console.log(`[Dispatch] ${processedJobIds.length} notifications traitées et conservées dans la table`);

  return new Response(`ok ${messages.length}`, { status: 200 });
});