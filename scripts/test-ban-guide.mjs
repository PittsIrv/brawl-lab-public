import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile, guideURL} from './map-guide-test-modules.mjs';
const {mapBanShortlist} = await import(compile(readFileSync('lib/ban-guide.ts', 'utf8').replace("'./map-guide'", JSON.stringify(guideURL))));
const {estimate} = await import(guideURL);
const data = {
  stale: '', unavailable: '', freshUntil: 1000,
  population: {brawlerIds: [1, 2, 3, 4, 5, 6], tiers: {
    Legendary: {maps: [{sets: 1000, appearances: [500, 50, 49, 500, 100, 200], wins: [300, 40, 49, 250, 70, 130]}]},
    Mythic: {maps: [{sets: 1000, appearances: [500, 50, 49, 500, 100, 200], wins: [200, 10, 49, 250, 70, 130]}]},
    Masters: {maps: [{sets: 10, appearances: [10, 10, 10, 10, 10, 10], wins: [9, 8, 7, 2, 2, 2]}]},
  }},
};
const rows = mapBanShortlist(data, 'Legendary', 0, 999);
assert.equal(rows.length, 3);
assert.equal(rows[0].id, 1, 'common threat ranks ahead of a rare higher raw win rate');
assert.ok(rows.every(r => ![3, 4].includes(r.id)), 'exclude tiny samples and unsupported above-50 results');
assert.equal(rows[0].priority, .5 * (estimate(300, 500).low / 100 - .5));
const kept = mapBanShortlist(data, 'Legendary', 0, 999, [1]);
assert.ok(kept.every(r => r.id !== 1));
assert.equal(kept.length, 3, 'next supported candidate fills the slot');
assert.deepEqual(mapBanShortlist(data, 'Legendary', 0, 999, [1, 2, 5, 6]), []);
assert.ok(mapBanShortlist(data, 'Mythic', 0, 999).every(r => r.id !== 1), 'rank results are isolated');
for (const tier of ['Masters', 'Pro', 'Diamond']) assert.deepEqual(mapBanShortlist(data, tier, 0, 999), []);
assert.deepEqual(mapBanShortlist(data, 'Legendary', 1, 999), [], 'no other-map fallback');
assert.deepEqual(mapBanShortlist(data, 'Legendary', 0, 1000), [], 'expiry is exclusive');
for (const override of [{stale: 'patch changed'}, {unavailable: 'mismatched release'}, {population: null}, {freshUntil: NaN}]) {
  assert.deepEqual(mapBanShortlist({...data, ...override}, 'Legendary', 0, 999), []);
}
assert.deepEqual(mapBanShortlist({...data, profile: {brawlers: []}}, 'Legendary', 0, 999), rows, 'own roster does not mask opponents');
console.log('Ban guide: rank/map isolation, evidence thresholds, frequency weighting, exclusions and stale gates passed.');
