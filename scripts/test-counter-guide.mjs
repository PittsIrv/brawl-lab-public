import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile,guideURL} from './map-guide-test-modules.mjs';
const finalURL=compile(readFileSync('lib/final-pick.ts','utf8'));
const comboURL=compile(readFileSync('lib/combo-guide.ts','utf8').replace("'./final-pick'",JSON.stringify(finalURL)).replace("'./map-guide'",JSON.stringify(guideURL)));
const {counterGuide,validateCounterStats}=await import(compile(readFileSync('lib/counter-guide.ts','utf8').replace("'./final-pick'",JSON.stringify(finalURL)).replace("'./map-guide'",JSON.stringify(guideURL)).replace("'./combo-guide'",JSON.stringify(comboURL))));
const {probability}=await import(finalURL);
const {bundle,state,stats}=JSON.parse(readFileSync('public-app/data/snapshot.json','utf8'));
const data=JSON.parse(readFileSync('public-app/data/counter-stats.json','utf8'));
const now=Date.parse(state.checkedAt),tier='Legendary',map=bundle.maps.findIndex(m=>m.name==='Shooting Star');
validateCounterStats(data,bundle);
const general=counterGuide(bundle,state,data,stats,tier,null,false,now),specific=counterGuide(bundle,state,data,stats,tier,map,false,now);
assert.ok(general.rows.length>6);assert.ok(specific.rows.length>0);
assert.ok(general.rows.every((r,i)=>r.n>=100&&r.trainingPairs>=50&&r.signal>.01&&(!i||general.rows[i-1].signal>=r.signal)));
assert.ok(specific.rows.every((r,i)=>r.n>=30&&r.trainingPairs>=10&&r.low>50&&(!i||specific.rows[i-1].low>=r.low)));
assert.equal(new Set(general.rows.map(r=>[r.candidate,r.target].sort((a,b)=>a-b).join(':'))).size,general.rows.length);
const n=bundle.brawlers.length,base=n*(1+bundle.modes.length+bundle.maps.length)+n*n;
// Every row must use the evaluator's direction and count wins from that side.
for(const [scope,rows] of [[null,general.rows],[map,specific.rows]])for(const row of rows){
 const a=Math.min(row.candidate,row.target),b=Math.max(row.candidate,row.target),raw=data.tiers[tier].find(r=>r.a===a&&r.b===b);
 const counts=scope===null?[0,raw.n,raw.wins,raw.train]:raw.maps.find(m=>m[0]===scope);
 assert.equal(row.wins,row.candidate===a?counts[2]:counts[1]-counts[2]);
 assert.equal(row.signal,(row.candidate===a?1:-1)*bundle.models[tier].weights[base+a*n+b]);
}
// Explicitly force both coefficient signs, including canonical-win reversal.
const raw=data.tiers[tier][0],fixture=structuredClone(bundle),model=fixture.models[tier];model.weights.fill(0);
for(const sign of [1,-1]){
 model.weights[base+raw.a*n+raw.b]=sign*.4;
 const rows=counterGuide(fixture,state,data,stats,tier,null,false,now).rows;assert.equal(rows.length,1);
 const row=rows[0];assert.equal(row.candidate,sign>0?raw.a:raw.b);assert.equal(row.wins,sign>0?raw.wins:raw.n-raw.wins);
 const rest=bundle.brawlers.map((_,i)=>i).filter(i=>i!==raw.a&&i!==raw.b).slice(0,4);
 const p=probability(fixture,model,[row.candidate,...rest.slice(0,2),row.target,...rest.slice(2)],map);
 assert.ok(Math.abs(Math.log(p/(1-p))-.4)<1e-10);
}
for(const scope of [null,map]){
 const hot=counterGuide(bundle,state,data,stats,tier,scope,true,now);assert.ok(hot.rows.length>0);assert.ok(hot.rows.every(r=>hot.hot.includes(r.target)));
}
for(const rank of ['Masters','Pro'])assert.equal(counterGuide(bundle,state,data,stats,rank,null,false,now).rows.length,0);
for(const changed of [{...state,blocked:true},{...state,rankedSeasonId:-1},{...state,checkedAt:'bad'}])assert.equal(counterGuide(bundle,changed,data,stats,tier,null,false,now).rows.length,0);
assert.equal(counterGuide(bundle,state,data,stats,tier,null,false,Date.parse(bundle.expiresAt)+1).rows.length,0);
const thin=structuredClone(bundle);thin.models[tier].mapSupport[map].fill(0);assert.equal(counterGuide(thin,state,data,stats,tier,map,false,now).rows.length,0);
assert.throws(()=>counterGuide(bundle,state,data,stats,tier,-1,false,now));
assert.throws(()=>validateCounterStats({...data,kind:'allied'},bundle));
assert.throws(()=>validateCounterStats({...data,bundleVersion:'other'},bundle));
const invalid=structuredClone(data);invalid.tiers[tier][0].wins=invalid.tiers[tier][0].n+1;assert.throws(()=>validateCounterStats(invalid,bundle));
const checkKeys=value=>{if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){assert.ok(!/player|tag|token|secret/i.test(key));checkKeys(child);}};checkKeys(data);
console.log('PASS: counter direction and counts, evaluator agreement for both signs, popularity targets, map/rank/release isolation and stale gates.');
console.log(JSON.stringify({general:general.rows.slice(0,3).map(r=>({pick:bundle.brawlers[r.candidate].name,against:bundle.brawlers[r.target].name,n:r.n})),map:specific.rows.length}));
