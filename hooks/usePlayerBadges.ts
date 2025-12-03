// hooks/usePlayerBadges.ts
// Hook pour récupérer les badges d'un joueur (débloqués et disponibles)

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export type BadgeCategory = 'volume' | 'performance' | 'social' | 'club' | 'bar' | 'other';

export type PlayerBadge = {
  id: string;
  code: string;
  label: string;
  description: string;
  category: BadgeCategory;
  unlocked: boolean;
  unlockedAt?: string;
  rarityScore?: number; // Score de rareté (plus élevé = plus rare)
};

export type UsePlayerBadgesResult = {
  featuredRare: PlayerBadge[];    // badges rares débloqués
  featuredRecent: PlayerBadge[];  // badges débloqués les plus récents
  allBadges: PlayerBadge[];       // tous badges, débloqués + grisés
  unlockedCount: number;
  totalAvailable: number;
  isLoading: boolean;
  error?: string;
  refetch: () => Promise<void>;
};

/**
 * Calcule le score de rareté d'un badge basé sur le nombre d'utilisateurs qui l'ont débloqué
 * Plus le badge est rare (moins de joueurs l'ont), plus le score est élevé
 */
async function calculateRarityScore(
  supabase: any,
  badgeId: string
): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('user_badges')
      .select('*', { count: 'exact', head: true })
      .eq('badge_id', badgeId);

    if (error) {
      console.error(`[usePlayerBadges] Error calculating rarity for badge ${badgeId}:`, error);
      return 0;
    }

    // Score de rareté : moins de joueurs = score plus élevé
    // Formule : 100 - (nombre de joueurs / 10), avec un minimum de 0
    const rarityScore = Math.max(0, 100 - (count || 0) / 10);
    return Math.round(rarityScore * 100) / 100; // Arrondir à 2 décimales
  } catch (err) {
    console.error(`[usePlayerBadges] Error calculating rarity:`, err);
    return 0;
  }
}

export function usePlayerBadges(userId: string | null | undefined): UsePlayerBadgesResult {
  const [allBadges, setAllBadges] = useState<PlayerBadge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);

  const fetchBadges = async () => {
    if (!userId) {
      setIsLoading(false);
      setAllBadges([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(undefined);

      // 1. Récupérer tous les badges disponibles (actifs)
      const { data: badgeDefinitions, error: definitionsError } = await supabase
        .from('badge_definitions')
        .select('id, code, label, description, category')
        .eq('is_active', true)
        .order('category', { ascending: true })
        .order('code', { ascending: true });

      if (definitionsError) {
        throw definitionsError;
      }

      if (!badgeDefinitions || badgeDefinitions.length === 0) {
        setAllBadges([]);
        setIsLoading(false);
        return;
      }

      // 2. Récupérer les badges débloqués par ce joueur
      const { data: userBadges, error: userBadgesError } = await supabase
        .from('user_badges')
        .select('badge_id, unlocked_at')
        .eq('user_id', userId)
        .order('unlocked_at', { ascending: false });

      if (userBadgesError) {
        throw userBadgesError;
      }

      // 3. Créer un Map pour accéder rapidement aux badges débloqués
      const unlockedMap = new Map(
        (userBadges || []).map((ub: any) => [
          ub.badge_id,
          ub.unlocked_at,
        ])
      );

      // 4. Combiner les définitions avec l'état de déblocage
      const badges: PlayerBadge[] = await Promise.all(
        badgeDefinitions.map(async (def: any) => {
          const unlockedAt = unlockedMap.get(def.id);
          const unlocked = !!unlockedAt;

          // Calculer le score de rareté pour les badges débloqués
          let rarityScore: number | undefined = undefined;
          if (unlocked) {
            rarityScore = await calculateRarityScore(supabase, def.id);
          }

          return {
            id: def.id,
            code: def.code,
            label: def.label,
            description: def.description || '',
            category: def.category as BadgeCategory,
            unlocked,
            unlockedAt: unlockedAt || undefined,
            rarityScore,
          };
        })
      );

      setAllBadges(badges);
    } catch (err) {
      console.error('[usePlayerBadges] Error fetching badges:', err);
      setError(err instanceof Error ? err.message : String(err));
      setAllBadges([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBadges();
  }, [userId]);

  // Debug: logger les erreurs
  useEffect(() => {
    if (error) {
      console.error('[usePlayerBadges] Error:', error);
    }
  }, [error]);

  // Calculer les badges mis en avant (rares et récents)
  const { featuredRare, featuredRecent, unlockedCount, totalAvailable } = useMemo(() => {
    const unlocked = allBadges.filter((b) => b.unlocked);
    const unlockedCount = unlocked.length;
    const totalAvailable = allBadges.length;

    // Badges rares débloqués (top 5 par score de rareté)
    const featuredRare = unlocked
      .filter((b) => b.rarityScore !== undefined)
      .sort((a, b) => (b.rarityScore || 0) - (a.rarityScore || 0))
      .slice(0, 5);

    // Badges récents débloqués (5 plus récents)
    const featuredRecent = unlocked
      .filter((b) => b.unlockedAt)
      .sort((a, b) => {
        const dateA = new Date(a.unlockedAt || 0).getTime();
        const dateB = new Date(b.unlockedAt || 0).getTime();
        return dateB - dateA; // Plus récent en premier
      })
      .slice(0, 5);

    return {
      featuredRare,
      featuredRecent,
      unlockedCount,
      totalAvailable,
    };
  }, [allBadges]);

  return {
    featuredRare,
    featuredRecent,
    allBadges,
    unlockedCount,
    totalAvailable,
    isLoading,
    error,
    refetch: fetchBadges,
  };
}

