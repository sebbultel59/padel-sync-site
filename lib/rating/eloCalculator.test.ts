/**
 * Tests unitaires pour le calculateur Elo
 * 
 * Pour exécuter : npm test ou jest
 */

import {
  calculateRatingUpdates,
  calculateXpGained,
  calculateMatchStatsUpdates,
  type MatchResultInput,
} from './eloCalculator';

describe('Elo Calculator', () => {
  describe('calculateRatingUpdates', () => {
    it('devrait calculer les ratings pour un match 2v2', () => {
      const matchResult: MatchResultInput = {
        team1: {
          players: [
            { userId: 'user1', rating: 50 },
            { userId: 'user2', rating: 55 },
          ],
        },
        team2: {
          players: [
            { userId: 'user3', rating: 60 },
            { userId: 'user4', rating: 65 },
          ],
        },
        winnerTeam: 1, // L'équipe 1 (sous-dog) gagne
      };

      const updates = calculateRatingUpdates(matchResult);

      expect(updates).toHaveLength(4);
      
      // Vérifier que tous les joueurs ont des updates
      expect(updates.find((u) => u.userId === 'user1')).toBeDefined();
      expect(updates.find((u) => u.userId === 'user2')).toBeDefined();
      expect(updates.find((u) => u.userId === 'user3')).toBeDefined();
      expect(updates.find((u) => u.userId === 'user4')).toBeDefined();

      // L'équipe 1 a gagné (sous-dog), donc leurs ratings devraient augmenter
      const team1Updates = updates.filter((u) => ['user1', 'user2'].includes(u.userId));
      team1Updates.forEach((update) => {
        expect(update.win).toBe(true);
        expect(update.ratingAfter).toBeGreaterThan(update.ratingBefore);
        expect(update.delta).toBeGreaterThan(0);
      });

      // L'équipe 2 a perdu (favorite), donc leurs ratings devraient diminuer
      const team2Updates = updates.filter((u) => ['user3', 'user4'].includes(u.userId));
      team2Updates.forEach((update) => {
        expect(update.win).toBe(false);
        expect(update.ratingAfter).toBeLessThan(update.ratingBefore);
        expect(update.delta).toBeLessThan(0);
      });

      // Vérifier que les ratings restent dans les bornes 0-100
      updates.forEach((update) => {
        expect(update.ratingAfter).toBeGreaterThanOrEqual(0);
        expect(update.ratingAfter).toBeLessThanOrEqual(100);
      });
    });

    it('devrait calculer les ratings pour un match 1v1', () => {
      const matchResult: MatchResultInput = {
        team1: {
          players: [{ userId: 'user1', rating: 50 }],
        },
        team2: {
          players: [{ userId: 'user2', rating: 60 }],
        },
        winnerTeam: 2, // L'équipe 2 (favorite) gagne
      };

      const updates = calculateRatingUpdates(matchResult);

      expect(updates).toHaveLength(2);

      const user1Update = updates.find((u) => u.userId === 'user1');
      const user2Update = updates.find((u) => u.userId === 'user2');

      expect(user1Update?.win).toBe(false);
      expect(user2Update?.win).toBe(true);

      // L'équipe 2 était favorite et a gagné, donc petit gain
      expect(user2Update!.ratingAfter).toBeGreaterThan(user2Update!.ratingBefore);
      expect(user2Update!.delta).toBeGreaterThan(0);
      expect(user2Update!.delta).toBeLessThan(5); // Petit gain car favorite

      // L'équipe 1 était sous-dog et a perdu, donc petite perte
      expect(user1Update!.ratingAfter).toBeLessThan(user1Update!.ratingBefore);
      expect(user1Update!.delta).toBeLessThan(0);
      expect(user1Update!.delta).toBeGreaterThan(-5); // Petite perte car sous-dog
    });

    it('devrait respecter les bornes 0-100', () => {
      const matchResult: MatchResultInput = {
        team1: {
          players: [{ userId: 'user1', rating: 5 }], // Rating très bas
        },
        team2: {
          players: [{ userId: 'user2', rating: 95 }], // Rating très haut
        },
        winnerTeam: 2, // La favorite gagne
      };

      const updates = calculateRatingUpdates(matchResult);

      updates.forEach((update) => {
        expect(update.ratingAfter).toBeGreaterThanOrEqual(0);
        expect(update.ratingAfter).toBeLessThanOrEqual(100);
      });
    });

    it('devrait gérer un match équilibré (ratings similaires)', () => {
      const matchResult: MatchResultInput = {
        team1: {
          players: [
            { userId: 'user1', rating: 50 },
            { userId: 'user2', rating: 50 },
          ],
        },
        team2: {
          players: [
            { userId: 'user3', rating: 50 },
            { userId: 'user4', rating: 50 },
          ],
        },
        winnerTeam: 1,
      };

      const updates = calculateRatingUpdates(matchResult);

      // Avec des ratings égaux, expected = 0.5
      // Si l'équipe 1 gagne : delta = K * (1 - 0.5) = K * 0.5 = 6 (avec K=12)
      const team1Update = updates.find((u) => u.userId === 'user1');
      expect(team1Update?.delta).toBeCloseTo(6, 1); // Environ 6 points

      const team2Update = updates.find((u) => u.userId === 'user3');
      expect(team2Update?.delta).toBeCloseTo(-6, 1); // Environ -6 points
    });

    it('devrait lancer une erreur si une équipe est vide', () => {
      const matchResult: MatchResultInput = {
        team1: {
          players: [],
        },
        team2: {
          players: [{ userId: 'user2', rating: 50 }],
        },
        winnerTeam: 2,
      };

      expect(() => calculateRatingUpdates(matchResult)).toThrow(
        'Chaque équipe doit avoir au moins un joueur'
      );
    });
  });

  describe('calculateXpGained', () => {
    it('devrait retourner 10 XP pour une victoire', () => {
      expect(calculateXpGained(true)).toBe(10);
    });

    it('devrait retourner 4 XP pour une défaite', () => {
      expect(calculateXpGained(false)).toBe(4);
    });
  });

  describe('calculateMatchStatsUpdates', () => {
    it('devrait calculer les stats correctement', () => {
      const ratingUpdates = [
        {
          userId: 'user1',
          ratingBefore: 50,
          ratingAfter: 56,
          delta: 6,
          win: true,
        },
        {
          userId: 'user2',
          ratingBefore: 60,
          ratingAfter: 54,
          delta: -6,
          win: false,
        },
      ];

      const statsUpdates = calculateMatchStatsUpdates(ratingUpdates);

      expect(statsUpdates).toHaveLength(2);

      const user1Stats = statsUpdates.find((s) => s.userId === 'user1');
      expect(user1Stats).toEqual({
        userId: 'user1',
        matchesPlayed: 1,
        wins: 1,
        losses: 0,
        xpGained: 10,
      });

      const user2Stats = statsUpdates.find((s) => s.userId === 'user2');
      expect(user2Stats).toEqual({
        userId: 'user2',
        matchesPlayed: 1,
        wins: 0,
        losses: 1,
        xpGained: 4,
      });
    });
  });
});

