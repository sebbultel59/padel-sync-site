// lib/profileCheck.js
import { supabase } from './supabase';

/**
 * Vérifie si le profil d'un utilisateur est complet
 * @param {string} userId - ID de l'utilisateur
 * @returns {Promise<boolean>} true si le profil est complet, false sinon
 */
export async function isProfileComplete(userId) {
  if (!userId) return false;

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('display_name, niveau, main, cote, club, phone, address_home, address_work, rayon_km, zone_id')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[profileCheck] Error fetching profile:', error);
      return false;
    }

    if (!profile) return false;

    // Vérifier tous les champs obligatoires
    const displayName = (profile.display_name || '').trim();
    const niveau = profile.niveau;
    const main = profile.main;
    const cote = profile.cote;
    const club = (profile.club || '').trim();
    const phone = (profile.phone || '').trim();
    const addressHome = profile.address_home;
    const addressWork = profile.address_work;
    const rayonKm = profile.rayon_km;
    const zoneId = profile.zone_id;

    // Logs pour déboguer
    console.log('[profileCheck] Checking profile:', {
      displayName: !!displayName,
      niveau: !!niveau,
      main: !!main,
      cote: !!cote,
      club: !!club,
      phone: !!phone,
      addressHome: !!(addressHome && addressHome.address),
      addressWork: !!(addressWork && addressWork.address), // Facultatif
      rayonKm: rayonKm !== null && rayonKm !== undefined,
      zoneId: !!zoneId,
    });

    // Vérifier que les champs VRAIMENT obligatoires sont remplis
    // On se base maintenant surtout sur les clubs / zones pour la géolocalisation.
    if (!displayName) {
      console.log('[profileCheck] ❌ displayName missing');
      return false;
    }
    if (!niveau) {
      console.log('[profileCheck] ❌ niveau missing');
      return false;
    }
    if (!main) {
      console.log('[profileCheck] ❌ main missing');
      return false;
    }
    if (!cote) {
      console.log('[profileCheck] ❌ cote missing');
      return false;
    }

    // Zone obligatoire
    if (!zoneId) {
      console.log('[profileCheck] ❌ zone_id missing');
      return false;
    }

    // Vérifier qu'au moins un club est accepté pour cet utilisateur
    const { data: clubs, error: clubsError } = await supabase
      .from('user_clubs')
      .select('user_id, club_id')
      .eq('user_id', userId)
      .eq('is_accepted', true)
      .limit(1);

    if (clubsError) {
      console.warn('[profileCheck] Error fetching user_clubs:', clubsError);
      return false;
    }

    if (!clubs || clubs.length === 0) {
      console.log('[profileCheck] ❌ no accepted clubs');
      return false;
    }

    console.log('[profileCheck] ✅ Profile is complete');
    return true;
  } catch (e) {
    console.warn('[profileCheck] Exception:', e);
    return false;
  }
}

