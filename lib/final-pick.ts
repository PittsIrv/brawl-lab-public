export const TIERS = ['Mythic','Legendary','Masters','Pro'] as const;
export type Tier = typeof TIERS[number];
export type TierModel = {tier:string;status:string;counts:Record<string,number>;weights?:number[];support?:number[];mapSupport?:number[][];metrics?:{logLoss:number;brier:number;auc:number;ece:number};individualBaseline?:{logLoss:number};fixture?:{brawlers:number[];map:number;mode:number;probability:number}};
export type Bundle = {schema:number;version:string;createdAt:string;expiresAt:string;regime:{rankedSeasonId:number;balancePatchId:string;balancePatchSource:string;verifiedAt:string;sourcePartition:string};brawlers:{id:number;name:string}[];maps:{mode:string;name:string}[];modes:string[];models:Record<string,TierModel>;limitations:string[];tierDefinition:string;splitRanges:Record<string,string[]>;provenance:{dataset:string;revision:string};[key:string]:unknown};
export type ModelState = {checkedAt:string;blocked:boolean;reason:string;rankedSeasonId:number;balancePatchId:string};
export type PickInput = {tier:Tier;map:number;allies:number[];enemies:number[];bans:number[];available?:number[]};
export function staleReason(bundle:Bundle,state:ModelState,now=Date.now()) {
 if(state.blocked)return state.reason||'Waiting for models for the new balance patch or Ranked season.';
 if(state.rankedSeasonId!==bundle.regime.rankedSeasonId||state.balancePatchId!==bundle.regime.balancePatchId)return 'The current Ranked season or balance patch differs from this model.';
 if(!Number.isFinite(Date.parse(state.checkedAt))||now-Date.parse(state.checkedAt)>36*3600000)return 'The patch and Ranked-season freshness check is overdue.';
 if(!Number.isFinite(Date.parse(bundle.expiresAt))||now>=Date.parse(bundle.expiresAt))return 'This model snapshot has expired. Waiting for a validated refresh.';
 return '';
}
export function probability(bundle:Bundle,model:TierModel,b:number[],map:number) {
 const n=bundle.brawlers.length,k=bundle.modes.length,base=n*(1+k+bundle.maps.length),mode=bundle.modes.indexOf(bundle.maps[map].mode),w=model.weights!;let score=0;
 for(let j=0;j<6;j++){const sign=j<3?1:-1;score+=sign*(w[b[j]]+w[n+mode*n+b[j]]+w[n*(1+k)+map*n+b[j]]);}
 for(const side of [0,3])for(let i=side;i<side+3;i++)for(let j=i+1;j<side+3;j++)score+=(side===0?1:-1)*w[base+Math.min(b[i],b[j])*n+Math.max(b[i],b[j])];
 for(let i=0;i<3;i++)for(let j=3;j<6;j++)score+=(b[i]<b[j]?1:-1)*w[base+n*n+Math.min(b[i],b[j])*n+Math.max(b[i],b[j])];
 return 1/(1+Math.exp(-score));
}
export function recommend(bundle:Bundle,state:ModelState,input:PickInput,now=Date.now()) {
 const stale=staleReason(bundle,state,now);if(stale)throw new Error(stale);
 const {picked,blocked}=validateDraft(bundle,input);
 const model=bundle.models[input.tier];if(model?.status!=='ready'||!model.weights)throw new Error(`${input.tier} has no validated model yet. More data is needed; another tier is not substituted.`);
 // Counts are training-only. Reject out-of-distribution context, not just unsupported candidates.
 const supported=(b:number)=>(model.support?.[b]||0)>=100&&(model.mapSupport?.[input.map]?.[b]||0)>=20;
 const sparse=picked.filter(b=>!supported(b));if(sparse.length)throw new Error(`Not enough ${input.tier} evidence for ${sparse.map(b=>bundle.brawlers[b].name).join(', ')} on this map. No reliable estimate is available for this draft.`);
 const candidates=Array.from(new Set(input.available??bundle.brawlers.map((_,i)=>i))).filter(b=>!blocked.includes(b));
 const results=candidates.filter(supported).map(b=>({brawler:bundle.brawlers[b],index:b,probability:probability(bundle,model,[...input.allies,b,...input.enemies],input.map),mapExamples:model.mapSupport![input.map][b],tierExamples:model.support![b]})).sort((a,b)=>b.probability-a.probability);
 return {results,excluded:candidates.length-results.length,version:bundle.version,tier:input.tier,rankedSeasonId:bundle.regime.rankedSeasonId,balancePatchId:bundle.regime.balancePatchId};
}
export function validateBundle(b:Bundle) {
 if(b?.schema!==1||!/^\d{8}T\d{6}Z$/.test(b.version)||!Number.isInteger(b.regime?.rankedSeasonId)||!b.regime.balancePatchId||!Array.isArray(b.brawlers)||b.brawlers.length<50||b.brawlers.length>200||!Array.isArray(b.maps)||b.maps.length>200||!Array.isArray(b.modes)||b.modes.length>20)throw new Error('Invalid model manifest.');
 if(!Number.isFinite(Date.parse(b.createdAt))||!Number.isFinite(Date.parse(b.expiresAt))||Date.parse(b.expiresAt)-Date.parse(b.createdAt)>4*86400000)throw new Error('Model validity must be bounded to four days.');
 const n=b.brawlers.length,d=n*(1+b.modes.length+b.maps.length)+2*n*n;
 for(const tier of TIERS){const m=b.models[tier];if(!m||!['ready','insufficient-data','validation-failed'].includes(m.status))throw new Error('Every rank needs an explicit model status.');if(m.status!=='ready')continue;
  if(!m.weights||m.weights.length!==d||!m.weights.every(v=>Number.isFinite(v)&&Math.abs(v)<30)||!m.support||m.support.length!==n||!m.mapSupport||m.mapSupport.length!==b.maps.length||!m.mapSupport.every(row=>row.length===n&&row.every(v=>Number.isInteger(v)&&v>=0)))throw new Error('Invalid model coefficients or support.');
  if(m.counts.train<5000||m.counts.validation<1000||m.counts.test<1000||!m.metrics||!(m.metrics.logLoss<Math.log(2))||!(m.metrics.brier<.25)||!(m.metrics.ece<.06))throw new Error('Model did not pass release gates.');
 }
}

export function validateDraft(bundle:Bundle,input:PickInput) {
 if(!TIERS.includes(input.tier))throw new Error('Choose a supported Ranked tier.');
 if(!Number.isInteger(input.map)||!bundle.maps[input.map])throw new Error('Choose a map and mode covered by the model.');
 if(!Array.isArray(input.allies)||input.allies.length!==2||!Array.isArray(input.enemies)||input.enemies.length!==3||!Array.isArray(input.bans)||input.bans.length>6)throw new Error('Enter two allies, three opponents and up to six bans.');
 const valid=(v:number)=>Number.isInteger(v)&&v>=0&&v<bundle.brawlers.length;
 const picked=[...input.allies,...input.enemies],blocked=[...picked,...input.bans];
 if(!blocked.every(valid)||new Set(picked).size!==5||input.bans.some(b=>picked.includes(b)))throw new Error('The five picks must be distinct, valid, and not banned.');
 if(input.available!==undefined&&(!Array.isArray(input.available)||input.available.length>bundle.brawlers.length||!input.available.every(valid)))throw new Error('Invalid available roster.');
 return {picked,blocked};
}
