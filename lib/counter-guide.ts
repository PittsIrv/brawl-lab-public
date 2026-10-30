import {staleReason, TIERS, type Bundle, type ModelState, type Tier} from './final-pick';
import {estimate, validateMapStats, type MapStats} from './map-guide';
import {validateComboStats, type ComboStats} from './combo-guide';

// Canonical a < b; wins count the team containing a, regardless of model sign.
export type CounterStats = ComboStats & {kind:'opposing'};
export function validateCounterStats(data:CounterStats,bundle:Bundle) {
  if(data.kind!=='opposing')throw new Error('Expected opposing-team evidence.');
  validateComboStats(data,bundle);
}

export function counterGuide(bundle:Bundle,state:ModelState,data:CounterStats,stats:MapStats,tier:Tier,map:number|null,hotOnly=true,now=Date.now()) {
  if(!TIERS.includes(tier)||(map!==null&&(!Number.isInteger(map)||!bundle.maps[map])))throw new Error('Choose a valid rank and map.');
  const stale=staleReason(bundle,state,now);
  if(stale)return {unavailable:stale,rows:[],hot:[]};
  validateCounterStats(data,bundle);validateMapStats(stats,bundle);
  const model=bundle.models[tier];
  if(model.status!=='ready'||!model.weights)return {unavailable:`${tier} has no released counter model. Another rank is not substituted.`,rows:[],hot:[]};
  const maps=map===null?stats.tiers[tier].maps:[stats.tiers[tier].maps[map]];
  const appearances=bundle.brawlers.map((_,i)=>maps.reduce((sum,m)=>sum+m.appearances[i],0));
  const hot=appearances.map((n,i)=>({n,i})).filter(r=>r.n>=50).sort((a,b)=>b.n-a.n||a.i-b.i).slice(0,12).map(r=>r.i);
  const n=bundle.brawlers.length,base=n*(1+bundle.modes.length+bundle.maps.length)+n*n;
  const rows=data.tiers[tier].flatMap(row=>{
    const coefficient=model.weights![base+row.a*n+row.b];
    if(!Number.isFinite(coefficient)||Math.abs(coefficient)<=.01||Math.min(model.support?.[row.a]??0,model.support?.[row.b]??0)<100)return [];
    const candidate=coefficient>0?row.a:row.b,target=coefficient>0?row.b:row.a;
    if(hotOnly&&!hot.includes(target))return [];
    const counts=map===null?null:row.maps.find(m=>m[0]===map);
    if(map!==null&&(!counts||Math.min(model.mapSupport?.[map]?.[candidate]??0,model.mapSupport?.[map]?.[target]??0)<20))return [];
    const total=counts?counts[1]:row.n,canonicalWins=counts?counts[2]:row.wins;
    const result=estimate(candidate===row.a?canonicalWins:total-canonicalWins,total);
    if(map!==null&&result.low<=50)return [];
    return [{candidate,target,...result,signal:Math.abs(coefficient),trainingPairs:counts?counts[3]:row.train}];
  });
  rows.sort((a,b)=>map===null?b.signal-a.signal||b.n-a.n||a.candidate-b.candidate||a.target-b.target:b.low-a.low||b.signal-a.signal||b.n-a.n||a.candidate-b.candidate||a.target-b.target);
  return {unavailable:'',rows,hot};
}
