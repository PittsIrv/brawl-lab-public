import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile,guideURL} from './map-guide-test-modules.mjs';
const finalURL=compile(readFileSync('lib/final-pick.ts','utf8'));
const catalog=JSON.parse(readFileSync('lib/data/brawlers.json','utf8'));
const {pairGuide}=await import(compile(readFileSync('lib/pair-guide.ts','utf8')
 .replace("'./final-pick'",JSON.stringify(finalURL)).replace("'./map-guide'",JSON.stringify(guideURL))
 .replace("import catalog from './data/brawlers.json';",`const catalog=${JSON.stringify(catalog)};`)));
const {probability}=await import(finalURL);
const {bundle,state,stats}=JSON.parse(readFileSync('public-app/data/snapshot.json','utf8'));
const now=Date.parse(state.checkedAt),tier='Legendary',map=bundle.maps.findIndex(m=>m.name==='Shooting Star'),piper=bundle.brawlers.findIndex(b=>b.name==='Piper');
const result=pairGuide(bundle,state,stats,tier,map,piper,false,now);
assert.equal(result.unavailable,'');assert.ok(result.hot.length>0);
for(const [kind,rows] of Object.entries(result.rows)){
 assert.ok(rows.length>0);
 assert.ok(rows.every(r=>r.index!==piper&&r.mapAppearances>=50&&r.trainingAppearances>=20&&r.tip));
 assert.ok(rows.every(r=>['answers','partners'].includes(kind)?r.signal>.01:r.signal<-.01));
 assert.ok(rows.every((r,i)=>i===0||Math.abs(rows[i-1].signal)>=Math.abs(r.signal)));
}
const hot=pairGuide(bundle,state,stats,tier,map,piper,true,now);
assert.ok(Object.values(hot.rows).flat().every(r=>hot.hot.includes(r.index)));
// Counter direction must agree with the evaluator, reverse on side swap, and
// allied-pair signs must remain symmetric. All unrelated terms are zeroed.
const other=result.rows.answers[0].index,n=bundle.brawlers.length,base=n*(1+bundle.modes.length+bundle.maps.length),offset=Math.min(piper,other)*n+Math.max(piper,other);
const fixture=structuredClone(bundle),m=fixture.models.Legendary;m.weights.fill(0);
m.weights[base+n*n+offset]=.4;m.weights[base+offset]=-.3;
const lo=Math.min(piper,other),hi=Math.max(piper,other);
assert.equal(pairGuide(fixture,state,stats,tier,map,hi,false,now).rows.answers.find(r=>r.index===lo).signal,.4);
assert.equal(pairGuide(fixture,state,stats,tier,map,lo,false,now).rows.risks.find(r=>r.index===hi).signal,-.4);
for(const [anchor,candidate] of [[lo,hi],[hi,lo]])assert.equal(pairGuide(fixture,state,stats,tier,map,anchor,false,now).rows.friction.find(r=>r.index===candidate).signal,-.3);
const rest=bundle.brawlers.map((_,i)=>i).filter(i=>i!==lo&&i!==hi).slice(0,4);
const forward=probability(fixture,m,[lo,...rest.slice(0,2),hi,...rest.slice(2)],map);
assert.ok(Math.abs(Math.log(forward/(1-forward))-.4)<1e-10);
assert.ok(Math.abs(probability(fixture,m,[hi,...rest.slice(2),lo,...rest.slice(0,2)],map)-(1-forward))<1e-10);
const missing=pairGuide(bundle,state,stats,'Masters',map,piper,false,now);assert.match(missing.unavailable,/no released/);assert.equal(Object.values(missing.rows).flat().length,0);
for(const changed of [{...state,blocked:true},{...state,rankedSeasonId:-1},{...state,checkedAt:'invalid'}])assert.equal(Object.values(pairGuide(bundle,changed,stats,tier,map,piper,false,now).rows).flat().length,0);
const expired=pairGuide(bundle,state,stats,tier,map,piper,false,Date.parse(bundle.expiresAt)+1);assert.ok(expired.unavailable);assert.equal(expired.hot.length,0);
assert.equal(pairGuide(bundle,state,null,tier,map,piper,false,now).hot.length,0);
const thin=structuredClone(bundle);thin.models.Legendary.mapSupport[map][piper]=0;assert.match(pairGuide(thin,state,stats,tier,map,piper,false,now).unavailable,/too little/);
assert.throws(()=>pairGuide(bundle,state,stats,tier,-1,piper,false,now),/valid/);
assert.throws(()=>pairGuide(bundle,state,{...stats,bundleVersion:'wrong'},tier,map,piper,false,now),/match/);
console.log('PASS: pair direction matches evaluator, ally symmetry, signs and sorting, hot filters, support gates, stale/blocked/missing-tier behavior, matching release required.');
