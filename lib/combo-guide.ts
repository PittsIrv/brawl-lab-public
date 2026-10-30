import {staleReason, TIERS, type Bundle, type ModelState, type Tier} from './final-pick';
import {estimate} from './map-guide';

export type ComboEvidence = {a:number;b:number;n:number;wins:number;train:number;maps:[number,number,number,number][]};
export type ComboStats = {schema:number;bundleVersion:string;sourceRevision:string;rankedSeasonId:number;balancePatchId:string;brawlerIds:number[];maps:Bundle['maps'];tiers:Record<string,ComboEvidence[]>};
export function validateComboStats(data:ComboStats,bundle:Bundle) {
  if(data.schema!==1||data.bundleVersion!==bundle.version||data.sourceRevision!==bundle.provenance.revision||
    data.rankedSeasonId!==bundle.regime.rankedSeasonId||data.balancePatchId!==bundle.regime.balancePatchId||
    JSON.stringify(data.brawlerIds)!==JSON.stringify(bundle.brawlers.map(b=>b.id))||JSON.stringify(data.maps)!==JSON.stringify(bundle.maps))throw new Error('Combo evidence does not match this model release.');
  const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
  for(const tier of TIERS){
    if(!Array.isArray(data.tiers[tier]))throw new Error('Missing rank combo evidence.');
    const seen=new Set<string>();
    for(const row of data.tiers[tier]){
      const key=`${row.a}:${row.b}`,maps=new Set<number>();
      if(seen.has(key)||!integer(row.a)||!integer(row.b)||row.a>=row.b||row.b>=bundle.brawlers.length||
        !integer(row.n)||!integer(row.wins)||!integer(row.train)||row.wins>row.n||row.train>row.n||row.n<100||row.train<50||
        row.n>Object.values(bundle.models[tier].counts).reduce((a,b)=>a+b,0))throw new Error('Invalid combo counts.');
      seen.add(key);
      for(const [map,n,wins,train] of row.maps){
        if(maps.has(map)||!integer(map)||!bundle.maps[map]||![n,wins,train].every(integer)||wins>n||train>n||n<30||train<10)throw new Error('Invalid map combo counts.');
        maps.add(map);
      }
      if(row.maps.reduce((s,m)=>s+m[1],0)>row.n||row.maps.reduce((s,m)=>s+m[2],0)>row.wins||row.maps.reduce((s,m)=>s+m[3],0)>row.train)throw new Error('Map combo totals exceed overall counts.');
    }
  }
}

export function comboGuide(bundle:Bundle,state:ModelState,data:ComboStats,tier:Tier,map:number|null,now=Date.now()) {
  if(!TIERS.includes(tier)||(map!==null&&(!Number.isInteger(map)||!bundle.maps[map])))throw new Error('Choose a valid rank and map.');
  const stale=staleReason(bundle,state,now);
  if(stale)return {unavailable:stale,rows:[]};
  validateComboStats(data,bundle);
  const model=bundle.models[tier];
  if(model.status!=='ready'||!model.weights)return {unavailable:`${tier} has no released chemistry model. Another rank is not substituted.`,rows:[]};
  const n=bundle.brawlers.length,base=n*(1+bundle.modes.length+bundle.maps.length);
  const rows=data.tiers[tier].flatMap(row=>{
    const signal=model.weights![base+row.a*n+row.b];
    if(signal<=.01||Math.min(model.support?.[row.a]??0,model.support?.[row.b]??0)<100)return [];
    const counts=map===null?null:row.maps.find(m=>m[0]===map);
    if(map!==null&&(!counts||Math.min(model.mapSupport?.[map]?.[row.a]??0,model.mapSupport?.[map]?.[row.b]??0)<20))return [];
    const result=estimate(counts?counts[2]:row.wins,counts?counts[1]:row.n);
    // Map view needs both positive global chemistry and supported map results.
    if(map!==null&&result.low<=50)return [];
    return [{...row,...result,signal,trainingPairs:counts?counts[3]:row.train}];
  });
  rows.sort((a,b)=>map===null?b.signal-a.signal||b.n-a.n||a.a-b.a||a.b-b.b:b.low-a.low||b.signal-a.signal||b.n-a.n||a.a-b.a||a.b-b.b);
  return {unavailable:'',rows};
}
