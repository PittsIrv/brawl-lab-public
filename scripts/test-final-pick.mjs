import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('lib/final-pick.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {probability,recommend,staleReason,validateBundle}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const bundle=JSON.parse(readFileSync('lib/data/final-pick-model.json','utf8'));
const now=Date.parse(bundle.createdAt),state={checkedAt:bundle.createdAt,blocked:false,reason:'',rankedSeasonId:bundle.regime.rankedSeasonId,balancePatchId:bundle.regime.balancePatchId};
validateBundle(bundle);
for(const [tier,m] of Object.entries(bundle.models)){
 if(m.status!=='ready'){assert.throws(()=>recommend(bundle,state,{tier,map:0,allies:[0,1],enemies:[2,3,4],bans:[]},now),/no validated model/);continue;}
 const f=m.fixture,b=f.brawlers;
 assert.ok(Math.abs(probability(bundle,m,b,f.map)-f.probability)<1e-7,'Python/TS inference parity');
 assert.ok(Math.abs(probability(bundle,m,[b[2],b[0],b[1],b[4],b[5],b[3]],f.map)-f.probability)<1e-7,'Team order must not matter');
 assert.ok(Math.abs(probability(bundle,m,[...b.slice(3),...b.slice(0,3)],f.map)+f.probability-1)<1e-7,'Swapping teams reverses outcome');
 // Use the best-supported map/roster for legal enumeration tests.
 const map=m.mapSupport.map(row=>row.filter(v=>v>=100).length).indexOf(Math.max(...m.mapSupport.map(row=>row.filter(v=>v>=100).length)));
 const supported=m.mapSupport[map].map((v,i)=>({v,i})).filter(v=>v.v>=100).sort((a,b)=>b.v-a.v).map(v=>v.i);
 const input={tier,map,allies:supported.slice(0,2),enemies:supported.slice(2,5),bans:[supported[5]]};
 const result=recommend(bundle,state,input,now);assert.ok(result.results.length>0);assert.ok(result.results.every(r=>!supported.slice(0,6).includes(r.index)));
 assert.ok(result.results.every((r,i,a)=>i===0||a[i-1].probability>=r.probability));
 assert.equal(recommend(bundle,state,{...input,available:[]},now).results.length,0);
 assert.deepEqual(recommend(bundle,state,{...input,available:[supported[6]]},now).results.map(r=>r.index),[supported[6]]);
 assert.throws(()=>recommend(bundle,state,{...input,allies:[supported[0],supported[0]]},now),/distinct/);
 assert.throws(()=>recommend(bundle,state,{...input,bans:[supported[0]]},now),/not banned/);
 assert.throws(()=>recommend(bundle,state,{...input,map:-1},now),/map/);
 assert.throws(()=>recommend(bundle,state,{...input,available:[9999]},now),/roster/);
 assert.throws(()=>recommend(bundle,{...state,rankedSeasonId:999},input,now),/season/);
 assert.throws(()=>recommend(bundle,{...state,balancePatchId:'new'},input,now),/patch/);
 assert.throws(()=>recommend(bundle,{...state,blocked:true,reason:'New patch'},input,now),/New patch/);
 assert.throws(()=>recommend(bundle,state,input,now+37*3600000),/overdue/);
 assert.throws(()=>recommend({...bundle,expiresAt:bundle.createdAt},state,input,now),/expired/);
 const sparse=structuredClone(bundle);sparse.models[tier].mapSupport[map][supported[0]]=0;
 assert.throws(()=>recommend(sparse,state,input,now),/Not enough/);
}
assert.equal(staleReason(bundle,state,now),'');
const broken=structuredClone(bundle);broken.models.Mythic.weights[0]=NaN;assert.throws(()=>validateBundle(broken));
console.log('PASS: Python/TypeScript parity, team permutation/side symmetry, tier isolation, legal candidate masks, owned roster, sparse-context rejection, rank/patch/season/freshness gates, artifact validation.');
