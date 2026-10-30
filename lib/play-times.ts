export const TIME_TIERS = ['Mythic', 'Legendary', 'Masters', 'Pro'] as const;
export type TimeTier = typeof TIME_TIERS[number];
export type DayFilter = 'all' | 'weekdays' | 'weekends';
export type TimeStats = {
  schemaVersion: number;
  source: {dataset: string; revision: string; sha256: string};
  regime: {rankedSeasonId: number; balancePatchId: string};
  start: string; endExclusive: string; bucketMinutes: number; sampleFraction: number;
  tiers: string[]; sets: number; counts: number[][];
};
export type TimeCell = {sets: number; hours: number; days: Set<string>; rate: number; supported: boolean};
const cell = (): TimeCell => ({sets: 0, hours: 0, days: new Set(), rate: 0, supported: false});
export const TIME_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const timeWindow = (i: number) => `${String(i * 3).padStart(2, '0')}:00–${String((i + 1) * 3).padStart(2, '0')}:00`;

export function validateTimeStats(data: TimeStats) {
  const start = Date.parse(data.start), end = Date.parse(data.endExclusive);
  if (data.schemaVersion !== 1 || data.bucketMinutes !== 15 || data.sampleFraction !== .25 ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= start ||
      start % 86400000 !== 0 || end % 86400000 !== 0 ||
      data.counts.length !== (end - start) / 900000 || data.tiers.join() !== TIME_TIERS.join() ||
      !data.counts.every(row => row.length === 4 && row.every(n => Number.isSafeInteger(n) && n >= 0)) ||
      data.counts.reduce((sum, row) => sum + row.reduce((s, n) => s + n, 0), 0) !== data.sets) {
    throw new Error('Invalid timing aggregate');
  }
}

// IANA conversion uses the date of each observed set bucket (including DST),
// never today's fixed offset. A bucket midpoint avoids boundary ambiguity.
export function localTimeBuckets(data: TimeStats, timezone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {timeZone: timezone, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'});
  const start = Date.parse(data.start);
  return data.counts.map((counts, i) => {
    const parts = Object.fromEntries(fmt.formatToParts(start + (i + .5) * 900000).map(p => [p.type, p.value]));
    return {counts, day: TIME_DAYS.indexOf(parts.weekday), window: Math.floor(Number(parts.hour) / 3),
      date: `${parts.year}-${parts.month}-${parts.day}`};
  });
}

export function summarizeTimes(buckets: ReturnType<typeof localTimeBuckets>, tier: TimeTier, filter: DayFilter) {
  const index = TIME_TIERS.indexOf(tier);
  if (index < 0 || !['all', 'weekdays', 'weekends'].includes(filter)) throw new Error('Invalid timing selection');
  const windows = Array.from({length: 8}, cell), heatmap = Array.from({length: 7}, () => Array.from({length: 8}, cell));
  let sets = 0;
  for (const bucket of buckets) {
    if (filter === 'weekdays' && bucket.day >= 5 || filter === 'weekends' && bucket.day < 5) continue;
    const n = bucket.counts[index]; sets += n;
    for (const target of [windows[bucket.window], heatmap[bucket.day][bucket.window]]) {
      target.sets += n; target.hours += .25; target.days.add(bucket.date);
    }
  }
  for (const target of [...windows, ...heatmap.flat()]) {
    target.rate = target.hours ? target.sets / target.hours * 3 : 0;
    // Descriptive coverage gate, not statistical confidence or a win-rate test.
    target.supported = target.sets >= 100 && target.hours >= 9 && target.days.size >= 3;
  }
  const supported = windows.map((c, i) => ({...c, index: i})).filter(c => c.supported);
  const peak = supported.sort((a, b) => b.rate - a.rate || a.index - b.index)[0] ?? null;
  return {sets, windows, heatmap, peak};
}
