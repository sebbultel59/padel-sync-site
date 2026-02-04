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
      .select('display_name, niveau, main, cote, club, phone, address_home, address_work, rayon_km')
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
    });

    // Vérifier que tous les champs sont remplis
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
    // Club favori est facultatif
    // Téléphone est facultatif
    if (!addressHome || !addressHome.address) {
      console.log('[profileCheck] ❌ addressHome missing');
      return false;
    }
    // Adresse travail est facultative
    if (rayonKm === null || rayonKm === undefined) {
      console.log('[profileCheck] ❌ rayonKm missing');
      return false;
    }

    console.log('[profileCheck] ✅ Profile is complete');
    return true;
  } catch (e) {
    console.warn('[profileCheck] Exception:', e);
    return false;
  }
}

