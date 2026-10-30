import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analysisURL, ranksURL, guideURL} from './map-guide-test-modules.mjs';
const {normalizeLog} = await import(analysisURL);
const {tierForRank} = await import(ranksURL);
const {estimate, populationRows, personalMapRows, validateMapStats, selectMapStats} = await import(guideURL);
for (const [rank, tier] of [[1,'Bronze'],[3,'Bronze'],[4,'Silver'],[7,'Gold'],[10,'Diamond'],[13,'Mythic'],[15,'Mythic'],[16,'Legendary'],[18,'Legendary'],[19,'Masters'],[21,'Masters'],[22,'Pro'],[23,null],[6000,null],[null,null]]) assert.equal(tierForRank(rank),tier);
const tag = '#TEST123';
const raw = rank => ({battleTime:'20261026T120000.000Z',event:{id:1,map:'Shooting Star',mode:'bounty'},battle:{type:'soloRanked',mode:'bounty',result:'victory',rank:1,teams:[[{tag,brawler:{id:16000015,name:'PIPER',power:11,trophies:rank}}]]}});
assert.equal(normalizeLog([raw(16)],tag)[0].rankedRank,16);
assert.equal(normalizeLog([raw(6000)],tag)[0].rankedRank,null,'Reject trophy-like values as rank');
assert.equal(normalizeLog([raw(undefined)],tag)[0].rankedRank,null,'Placement rank must not become Ranked tier');
assert.equal(normalizeLog([{...raw(16),battle:{...raw(16).battle,type:'ranked'}}],tag).length,0,'Ladder must stay excluded');
const match = {...normalizeLog([raw(16)],tag)[0],provenance:'api'};
const rows = [
 ...Array.from({length:10},(_,i)=>({...match,id:'legendary-'+i,result:i<7?'victory':'defeat'})),
 {...match,id:'mythic',rankedRank:13,result:'defeat'},
 {...match,id:'unknown',rankedRank:null},
 {...match,id:'older-patch',time:'2026-10-14T00:00:00Z'},
 {...match,id:'next-season',time:'2026-11-19T09:00:00Z'},
 {...match,id:'different-map',map:'Other map'},
 {...match,id:'different-mode',mode:'Heist'},
 {...match,id:'draw',result:'draw'},
 {...match,id:'import',provenance:'import'},
];
const window = {start:'20261015T090000.000Z',end:'20261119T090000.000Z'};
const personal = personalMapRows(rows,'Legendary',{name:'Shooting Star',mode:'bounty'},window);
assert.equal(personal.rows.length,1);assert.equal(personal.rows[0].n,11);assert.equal(personal.rows[0].wins,8);assert.equal(personal.rows[0].draws,1);assert.equal(personal.rows[0].imported,1);
assert.equal(personal.unknownRank,1);assert.equal(personal.otherRank,1);assert.equal(personal.outsideWindow,2);
assert.equal(personalMapRows(rows,'Mythic',{name:'Shooting Star',mode:'Bounty'},window).rows[0].wins,0);
assert.equal(personalMapRows([{...match,rankedRank:null}],'Legendary',{name:'Shooting Star',mode:'Bounty'},window).rows.length,0);
assert.equal(estimate(0,0).rate,null);assert.ok(estimate(1,1).low<30);assert.equal(estimate(0,0).score,50);
const bundle=JSON.parse(readFileSync('lib/data/final-pick-model.json'));
const stats=JSON.parse(readFileSync('lib/data/map-stats.json'));
validateMapStats(stats,bundle);
assert.equal(stats.tiers.Mythic.sets,451745);assert.equal(stats.tiers.Legendary.sets,72742);
const index=stats.maps.findIndex(m=>m.name==='Shooting Star');
assert.ok(populationRows(stats,'Legendary',index).some(r=>r.supported));
assert.deepEqual(populationRows(stats,'Bronze',index),[]);
assert.ok(populationRows(stats,'Masters',index).every(r=>!r.supported));
const malformed=structuredClone(stats);malformed.tiers.Mythic.maps[0].wins[0]=999999;
assert.throws(()=>validateMapStats(malformed,bundle));
assert.equal(selectMapStats({...bundle,version:'20261028T120000Z'},stats),null,'Never reuse old aggregates for new model version');
assert.equal(selectMapStats({...bundle,regime:{...bundle.regime,rankedSeasonId:51}},stats),null);
assert.equal(selectMapStats({...bundle,regime:{...bundle.regime,balancePatchId:'new'}},stats),null);
assert.equal(selectMapStats({...bundle,provenance:{...bundle.provenance,revision:'new'}},stats),null);
assert.equal(selectMapStats({...bundle,mapStats:malformed},stats),null,'Do not hide malformed refresh data behind fallback');
assert.equal(selectMapStats({...bundle,mapStats:stats},stats),stats);
console.log('PASS: rank-index capture, rank/map/mode/patch isolation, unknown-rank exclusion, draw denominators, import provenance, population support and release-bound aggregate validation.');
