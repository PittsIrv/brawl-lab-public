// Export only the reviewed public allowlist, never the training bundle wholesale.
import {readFileSync,writeFileSync} from 'node:fs';
import {compile,guideURL} from './map-guide-test-modules.mjs';
const finalURL=compile(readFileSync('lib/final-pick.ts','utf8'));
const source=readFileSync('lib/public-snapshot.ts','utf8').replace("'./final-pick'",JSON.stringify(finalURL)).replace("'./map-guide'",JSON.stringify(guideURL));
const {publicSnapshot}=await import(compile(source));
const {staleReason,probability}=await import(finalURL);
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('Usage: node scripts/export-public-model.mjs candidate.json snapshot.json');
const bundle=JSON.parse(readFileSync(input,'utf8'));
const state={checkedAt:bundle.regime.verifiedAt,rankedSeasonId:bundle.regime.rankedSeasonId,balancePatchId:bundle.regime.balancePatchId,blocked:false,reason:''};
const stale=staleReason(bundle,state);if(stale)throw new Error(stale);
const result=publicSnapshot(bundle,state,bundle.mapStats);
for(const model of Object.values(bundle.models))if(model.status==='ready'){
  const f=model.fixture;
  if(!f||Math.abs(probability(bundle,model,f.brawlers,f.map)-f.probability)>1e-7)throw new Error('Python/browser prediction parity failed');
  if(model.optimizerIterations>=250||model.baselineIterations>=250)throw new Error('Model optimizer failed to converge');
}
writeFileSync(output,JSON.stringify(result));
console.log(`Exported public model ${bundle.version}`);
