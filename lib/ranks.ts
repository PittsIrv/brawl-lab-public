import {rankedIndex} from './analysis';
export const RANK_TIERS = ['Bronze', 'Silver', 'Gold', 'Diamond', 'Mythic', 'Legendary', 'Masters', 'Pro'] as const;
export type RankTier = typeof RANK_TIERS[number];

// Ranked battle-log brawler.trophies is a rank index, not ladder trophies.
// Only call this for confirmed soloRanked/teamRanked records.

export function tierForRank(value: unknown): RankTier | null {
  const rank = rankedIndex(value);
  return rank === null ? null : RANK_TIERS[Math.min(7, Math.floor((rank - 1) / 3))];
}
