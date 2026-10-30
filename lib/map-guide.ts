import {rankedOnly, type Match} from './analysis';
import {tierForRank, type RankTier} from './ranks';
import type {Bundle} from './final-pick';

export type MapCounts = {sets: number; appearances: number[]; wins: number[]};
export type MapStats = {
  schema: number; bundleVersion: string; sourceRevision: string;
  rankedSeasonId: number; balancePatchId: string;
  start: string; end: string; dataFrom: string; dataThrough: string;
  brawlerIds: number[]; maps: {name: string; mode: string}[];
  tiers: Record<string, {sets: number; maps: MapCounts[]}>;
};
export type MapGuideData = {
  version: string; stale: string; unavailable: string; checkedAt: string; freshUntil: number;
  regime: Bundle['regime']; population: MapStats | null;
  brawlers: Bundle['brawlers']; maps: Bundle['maps'];
};
export const POPULATION_MIN = 50;
export const PERSONAL_MIN = 10;
const canonical = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const apiTime = (s: string) => Date.parse(s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(.*)$/, '$1-$2-$3T$4:$5:$6$7'));

export function estimate(wins: number, n: number) {
  const p = n ? wins / n : 0, z = 1.96, den = 1 + z * z / (n || 1);
  const center = (p + z * z / (2 * (n || 1))) / den;
  const margin = z * Math.sqrt(p * (1 - p) / (n || 1) + z * z / (4 * (n || 1) ** 2)) / den;
  return {wins, losses: n - wins, n, rate: n ? 100 * p : null,
    score: 100 * (wins + 5) / (n + 10), low: n ? 100 * (center - margin) : 0, high: n ? 100 * (center + margin) : 100};
}

export function validateMapStats(stats: MapStats, bundle: Bundle) {
  if (stats?.schema !== 1 || stats.bundleVersion !== bundle.version || stats.sourceRevision !== bundle.provenance.revision ||
      stats.rankedSeasonId !== bundle.regime.rankedSeasonId || stats.balancePatchId !== bundle.regime.balancePatchId ||
      JSON.stringify(stats.brawlerIds) !== JSON.stringify(bundle.brawlers.map(b => b.id)) ||
      JSON.stringify(stats.maps) !== JSON.stringify(bundle.maps)) throw new Error('Map statistics do not match this model release.');
  const from = apiTime(stats.start), end = apiTime(stats.end), first = apiTime(stats.dataFrom), last = apiTime(stats.dataThrough);
  if (![from, end, first, last].every(Number.isFinite) || from >= end || first < from || last >= end || first > last) throw new Error('Invalid map statistics time range.');
  for (const tier of ['Mythic', 'Legendary', 'Masters', 'Pro']) {
    const t = stats.tiers?.[tier];
    if (!t || !Number.isInteger(t.sets) || t.sets < 0 || t.maps?.length !== bundle.maps.length) throw new Error('Missing rank statistics.');
    let total = 0;
    for (const row of t.maps) {
      const valid = (x: number) => Number.isSafeInteger(x) && x >= 0;
      if (!valid(row.sets) || row.appearances?.length !== bundle.brawlers.length || row.wins?.length !== bundle.brawlers.length ||
          !row.appearances.every(valid) || !row.wins.every(valid) || row.wins.some((w, i) => w > row.appearances[i]) ||
          row.appearances.some(n => n > row.sets) || row.appearances.reduce((a, b) => a + b, 0) !== row.sets * 6 ||
          row.wins.reduce((a, b) => a + b, 0) !== row.sets * 3) throw new Error('Invalid map win counts.');
      total += row.sets;
    }
    const counts = bundle.models[tier]?.counts;
    if (total !== t.sets || !counts || total !== counts.train + counts.validation + counts.test) throw new Error('Rank totals do not match this release.');
  }
}

export function selectMapStats(bundle: Bundle, fallback: MapStats): MapStats | null {
  const candidate = bundle.mapStats ?? (fallback.bundleVersion === bundle.version ? fallback : null);
  if (!candidate) return null;
  try { validateMapStats(candidate as MapStats, bundle); return candidate as MapStats; } catch { return null; }
}

export function populationRows(stats: MapStats, tier: RankTier, map: number) {
  const counts = stats.tiers[tier]?.maps[map];
  if (!counts) return [];
  return stats.brawlerIds.map((id, index) => ({id, ...estimate(counts.wins[index], counts.appearances[index]),
    appearanceRate: counts.sets ? 100 * counts.appearances[index] / counts.sets : 0,
    supported: counts.appearances[index] >= POPULATION_MIN,
  })).filter(r => r.n > 0).sort((a, b) => Number(b.supported) - Number(a.supported) || b.score - a.score || b.n - a.n || a.id - b.id);
}

export function personalMapRows(matches: Match[], tier: RankTier, map: {name: string; mode: string}, window: {start: string; end: string}) {
  const start = apiTime(window.start), end = apiTime(window.end);
  const matchingMap = rankedOnly(matches).filter(m => canonical(m.map) === canonical(map.name) && canonical(m.mode) === canonical(map.mode));
  const scoped = matchingMap.filter(m => { const t = Date.parse(m.time); return t >= start && t < end; });
  const unknownRank = scoped.filter(m => !tierForRank(m.rankedRank)).length;
  const ranked = scoped.filter(m => tierForRank(m.rankedRank) === tier);
  const groups = new Map<number, {wins: number; n: number; draws: number; imported: number}>();
  for (const m of ranked) {
    if (!m.brawlerId || !['victory', 'defeat', 'draw'].includes(m.result)) continue;
    const r = groups.get(m.brawlerId) ?? {wins: 0, n: 0, draws: 0, imported: 0};
    if (m.result === 'draw') r.draws++; else { r.n++; if (m.result === 'victory') r.wins++; }
    if (m.provenance !== 'api') r.imported++;
    groups.set(m.brawlerId, r);
  }
  return {rows: [...groups].map(([id, r]) => ({id, ...estimate(r.wins, r.n), draws: r.draws, imported: r.imported, supported: r.n >= PERSONAL_MIN}))
    .sort((a, b) => Number(b.supported) - Number(a.supported) || b.score - a.score || b.n - a.n || a.id - b.id),
    unknownRank, otherRank: scoped.length - unknownRank - ranked.length, outsideWindow: matchingMap.length - scoped.length,
    records: ranked.length};
}
