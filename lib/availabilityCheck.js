// lib/availabilityCheck.js
import { supabase } from './supabase';

/**
 * Vérifie si l'utilisateur a des disponibilités "available" pour un groupe donné
 * @param {string} userId - ID de l'utilisateur
 * @param {string} groupId - ID du groupe
 * @returns {Promise<boolean>} true si des disponibilités "available" existent, false sinon
 */
export async function hasAvailabilityForGroup(userId, groupId) {
  if (!userId || !groupId) return false;

  try {
    // Calculer la fenêtre de temps : maintenant jusqu'à 2 semaines dans le futur
    const now = new Date();
    const twoWeeksLater = new Date(now);
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);

    const pLow = now.toISOString();
    const pHigh = twoWeeksLater.toISOString();

    // Utiliser get_availability_effective RPC pour obtenir les disponibilités effectives
    // (combine availability_global et availability pour le groupe)
    const { data: availabilityData, error } = await supabase.rpc('get_availability_effective', {
      p_group: groupId,
      p_user: userId,
      p_low: pLow,
      p_high: pHigh,
    });

    if (error) {
      console.warn('[availabilityCheck] Error fetching availability:', error);
      return false;
    }

    if (!availabilityData || !Array.isArray(availabilityData)) {
      return false;
    }

    // Vérifier s'il existe au moins une entrée avec status='available'
    const hasAvailable = availabilityData.some(
      (av) => String(av.status || '').toLowerCase() === 'available'
    );

    return hasAvailable;
  } catch (e) {
    console.warn('[availabilityCheck] Exception:', e);
    return false;
  }
}

