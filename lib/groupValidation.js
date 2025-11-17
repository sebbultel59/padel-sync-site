// lib/groupValidation.js
import { supabase } from './supabase';

/**
 * Vérifie que le groupe existe et que l'utilisateur est membre du groupe
 * @param {string} userId - ID de l'utilisateur
 * @param {string} groupId - ID du groupe
 * @returns {Promise<boolean>} true si le groupe existe et l'utilisateur est membre, false sinon
 */
export async function validateActiveGroup(userId, groupId) {
  if (!userId || !groupId) return false;

  try {
    // 1) Vérifier que le groupe existe
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('id', groupId)
      .maybeSingle();

    if (groupError) {
      console.warn('[groupValidation] Error checking group existence:', groupError);
      return false;
    }

    if (!group) {
      console.log('[groupValidation] Group does not exist:', groupId);
      return false;
    }

    // 2) Vérifier que l'utilisateur est membre du groupe
    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();

    if (membershipError) {
      console.warn('[groupValidation] Error checking membership:', membershipError);
      return false;
    }

    if (!membership) {
      console.log('[groupValidation] User is not a member of group:', { userId, groupId });
      return false;
    }

    return true;
  } catch (e) {
    console.warn('[groupValidation] Exception:', e);
    return false;
  }
}

