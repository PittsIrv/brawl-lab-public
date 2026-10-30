import {populationRows, type MapGuideData} from './map-guide';
import type {RankTier} from './ranks';

/** Descriptive threat ranking, not an estimate of the effect of banning. */
export function mapBanShortlist(data: MapGuideData, tier: RankTier, map: number, now: number, keepAvailable: readonly number[] = []) {
  if (data.stale || data.unavailable || !data.population || !Number.isFinite(data.freshUntil) || now >= data.freshUntil) return [];
  const excluded = new Set(keepAvailable);
  return populationRows(data.population, tier, map)
    .filter(row => row.supported && row.low > 50 && !excluded.has(row.id))
    .map(row => ({...row, priority: (row.appearanceRate / 100) * (row.low / 100 - 0.5)}))
    .sort((a, b) => b.priority - a.priority || b.n - a.n || a.id - b.id)
    .slice(0, 3);
}
