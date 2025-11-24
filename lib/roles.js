// lib/roles.js
// Hooks et utilitaires pour gérer les rôles des utilisateurs
import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Hook pour récupérer le rôle de l'utilisateur actuel
 * @returns {Object} { role: string | null, loading: boolean, clubId: string | null }
 */
export function useUserRole() {
  const [role, setRole] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        
        if (!uid) {
          setRole(null);
          setClubId(null);
          setLoading(false);
          return;
        }

        // Essayer de récupérer le rôle, mais gérer le cas où la colonne n'existe pas encore
        let profile = null;
        let error = null;
        
        try {
          const result = await supabase
            .from('profiles')
            .select('role, club_id')
            .eq('id', uid)
            .maybeSingle();
          
          profile = result.data;
          error = result.error;
        } catch (e) {
          // Si la colonne n'existe pas, l'erreur sera dans error
          error = e;
        }

        if (error) {
          // Si l'erreur indique que la colonne n'existe pas, utiliser 'player' par défaut
          if (error.message && (
            error.message.includes('column') && error.message.includes('does not exist') ||
            error.message.includes('permission denied') ||
            error.code === '42703' // PostgreSQL: undefined column
          )) {
            console.warn('[useUserRole] Colonne role/club_id non trouvée, utilisation de la valeur par défaut. Exécutez la migration ensure_roles_column_exists.sql');
            setRole('player');
            setClubId(null);
          } else {
            console.warn('[useUserRole] Error fetching role:', error.message);
            setRole(null);
            setClubId(null);
          }
        } else {
          setRole(profile?.role || 'player');
          setClubId(profile?.club_id || null);
        }
      } catch (e) {
        console.warn('[useUserRole] Exception:', e?.message || e);
        setRole(null);
        setClubId(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { role, clubId, loading };
}

/**
 * Hook pour vérifier si l'utilisateur est super_admin
 * @returns {boolean} true si l'utilisateur est super_admin
 */
export function useIsSuperAdmin() {
  const { role, loading } = useUserRole();
  // Retourner false pendant le chargement pour éviter les faux positifs
  if (loading) return false;
  return role === 'super_admin';
}

/**
 * Hook pour vérifier si l'utilisateur est admin (global)
 * @returns {boolean} true si l'utilisateur est admin
 */
export function useIsAdmin() {
  const { role } = useUserRole();
  return role === 'admin';
}

/**
 * Hook pour vérifier si l'utilisateur est club_manager
 * @param {string|null} clubId - ID du club à vérifier (optionnel, si null vérifie juste si c'est un club_manager)
 * @returns {boolean} true si l'utilisateur est club_manager (et du club spécifié si clubId fourni)
 */
export function useIsClubManager(clubId = null) {
  const { role, clubId: userClubId } = useUserRole();
  
  if (role !== 'club_manager') {
    return false;
  }
  
  // Si un clubId est fourni, vérifier qu'il correspond
  if (clubId !== null) {
    return userClubId === clubId;
  }
  
  // Sinon, juste vérifier que c'est un club_manager
  return true;
}

/**
 * Hook pour vérifier si l'utilisateur est admin d'un groupe spécifique
 * @param {string} groupId - ID du groupe
 * @returns {Object} { isAdmin: boolean, loading: boolean }
 */
export function useIsGroupAdmin(groupId) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const { role } = useUserRole();

  useEffect(() => {
    if (!groupId) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        
        if (!uid) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // Super admin peut tout gérer
        if (role === 'super_admin') {
          setIsAdmin(true);
          setLoading(false);
          return;
        }

        // Vérifier si l'utilisateur est admin du groupe
        const { data: membership, error } = await supabase
          .from('group_members')
          .select('role')
          .eq('group_id', groupId)
          .eq('user_id', uid)
          .maybeSingle();

        if (error) {
          console.warn('[useIsGroupAdmin] Error:', error.message);
          setIsAdmin(false);
        } else {
          setIsAdmin(membership?.role === 'admin' || membership?.role === 'owner');
        }
      } catch (e) {
        console.warn('[useIsGroupAdmin] Exception:', e?.message || e);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId, role]);

  return { isAdmin, loading };
}

/**
 * Hook pour vérifier si l'utilisateur peut gérer un groupe
 * (admin du groupe OU club_manager du club du groupe OU super_admin)
 * @param {string} groupId - ID du groupe
 * @returns {Object} { canManage: boolean, loading: boolean }
 */
export function useCanManageGroup(groupId) {
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const { role, clubId: userClubId } = useUserRole();

  useEffect(() => {
    if (!groupId) {
      setCanManage(false);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        
        if (!uid) {
          setCanManage(false);
          setLoading(false);
          return;
        }

        // Super admin peut tout gérer
        if (role === 'super_admin') {
          setCanManage(true);
          setLoading(false);
          return;
        }

        // Récupérer les informations du groupe
        const { data: group, error: groupError } = await supabase
          .from('groups')
          .select('club_id')
          .eq('id', groupId)
          .maybeSingle();

        if (groupError) {
          console.warn('[useCanManageGroup] Error fetching group:', groupError.message);
          setCanManage(false);
          setLoading(false);
          return;
        }

        // Vérifier si l'utilisateur est club_manager du club du groupe
        if (group?.club_id && role === 'club_manager' && userClubId === group.club_id) {
          setCanManage(true);
          setLoading(false);
          return;
        }

        // Vérifier si l'utilisateur est admin du groupe
        const { data: membership, error: memberError } = await supabase
          .from('group_members')
          .select('role')
          .eq('group_id', groupId)
          .eq('user_id', uid)
          .maybeSingle();

        if (memberError) {
          console.warn('[useCanManageGroup] Error fetching membership:', memberError.message);
          setCanManage(false);
        } else {
          setCanManage(membership?.role === 'admin' || membership?.role === 'owner');
        }
      } catch (e) {
        console.warn('[useCanManageGroup] Exception:', e?.message || e);
        setCanManage(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId, role, userClubId]);

  return { canManage, loading };
}

/**
 * Fonction utilitaire pour vérifier un rôle de manière synchrone (si on a déjà les données)
 * @param {string} userRole - Le rôle de l'utilisateur
 * @param {string} requiredRole - Le rôle requis
 * @returns {boolean}
 */
export function hasRole(userRole, requiredRole) {
  if (!userRole) return false;
  
  // Hiérarchie des rôles (super_admin > admin > club_manager > player)
  const roleHierarchy = {
    'player': 0,
    'club_manager': 1,
    'admin': 2,
    'super_admin': 3
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
}

