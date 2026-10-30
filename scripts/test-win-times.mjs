import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from './map-guide-test-modules.mjs';
const {validateWinTiming,evidenceState,localWindow,localWindowRange,WIN_TIERS,STRENGTH_GROUPS}=await import(compile(readFileSync('lib/win-times.ts','utf8')));
const data=JSON.parse(readFileSync('public-app/data/win-times.json','utf8'));
validateWinTiming(data);
assert.equal(data.source.sha256,JSON.parse(readFileSync('reports/initial-release/provenance.json','utf8')).sha256);
assert.equal(localWindow(0,'America/New_York','2026-10-21'),'20:00–23:00');
assert.equal(localWindow(0,'Asia/Kathmandu','2026-10-21'),'05:45–08:45');
assert.equal(localWindowRange(1,'Europe/London','2026-10-21','2026-10-27'),'04:00–07:00 / 03:00–06:00');
assert.throws(()=>localWindow(8,'UTC','2026-10-21'));
assert.throws(()=>localWindow(0,'invalid','2026-10-21'));
assert.equal(evidenceState(data,'Pro','stronger'),'insufficient');
assert.equal(evidenceState(data,'Masters','stronger'),'insufficient');
const clone=()=>structuredClone(data);
const bad=clone();bad.periods.holdout[0]=bad.periods.training[0];assert.throws(()=>validateWinTiming(bad));
// All supported results are historical and cannot meet the seven-day minimum.
for(const tier of WIN_TIERS)for(const group of STRENGTH_GROUPS){
 assert.notEqual(evidenceState(data,tier,group),'provisional');
 const g=data.tiers[tier].groups[group];
 if(!g)continue;
 assert.equal(g.windows.length,8);
 if(g.candidate!==null){assert.ok(g.windows[g.candidate].effect>0);assert.ok(g.holdout);assert.ok(g.holdout.retention<=1);}
 for(const result of [...g.windows,...(g.holdout?[g.holdout]:[])])if(result.players<20)assert.equal(result.effect,null);
}
// Status gates: never convert sparse/negative/few-day effects into advice.
const fixture=clone();const r={players:100,inside:500,outside:1200,effect:.03,interval:[.01,.07],winRate:.53,otherWinRate:.5,days:3};
fixture.tiers.Legendary={status:'exploratory',sets:{},groups:{stronger:{trainingPlayers:200,windows:Array(8).fill(r),candidate:1,holdout:{...r,retention:.8}}}};
assert.equal(evidenceState(fixture,'Legendary','stronger'),'short');
fixture.tiers.Legendary.groups.stronger.holdout.interval=[-.01,.07];assert.equal(evidenceState(fixture,'Legendary','stronger'),'uncertain');
fixture.tiers.Legendary.groups.stronger.holdout.effect=-.01;assert.equal(evidenceState(fixture,'Legendary','stronger'),'not-repeated');
fixture.tiers.Legendary.groups.stronger.holdout.players=2;assert.equal(evidenceState(fixture,'Legendary','stronger'),'thin');
// Export allowlist: no parameter vectors, identifiers or match-level records.
const forbidden=new Set(['playersById','player','tag','players','weights','records','time','brawler','skill_ns']);
function check(value,path='root'){
 if(!value||typeof value!=='object')return;
 for(const [key,v] of Object.entries(value)){
  if(forbidden.has(key))assert.ok(key==='players'&&typeof v==='number',`${path}.${key} is private`);
  check(v,`${path}.${key}`);
 }
}
check(data);
console.log('PASS: timing protocol, rank isolation, no advice from sparse results, frozen candidate, small-cohort suppression, timezone/DST and aggregate privacy.');
