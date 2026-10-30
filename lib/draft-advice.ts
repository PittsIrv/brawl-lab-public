import {recommend, probability, staleReason, validateDraft, type Bundle, type ModelState, type PickInput} from './final-pick';
import {fit, objectives, roleAdvice} from './coaching';
import catalog from './data/brawlers.json';

export type AdviceBasis = 'validated-model' | 'approximate-model' | 'role-heuristic';
export type AdviceRow = {index:number; brawler:{id:number;name:string}; probability:number|null; mapExamples:number; tierExamples:number; reasons:string[]; caution:string; tip:string};
export type DraftAdvice = {basis:AdviceBasis; notice:string; results:AdviceRow[]; excluded:number; version:string};
const lookup = new Map(catalog.map(b => [b.id,b]));
const pretty = (s:string) => s.toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const modeName = (s:string) => s.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,c=>c.toUpperCase());

export function draftAdvice(bundle:Bundle,state:ModelState,input:PickInput,now=Date.now()):DraftAdvice {
  const {picked,blocked}=validateDraft(bundle,input);
  const legal=[...new Set(input.available??bundle.brawlers.map((_,i)=>i))].filter(i=>!blocked.includes(i));
  const model=bundle.models[input.tier], stale=staleReason(bundle,state,now);
  let basis:AdviceBasis='role-heuristic', notice=stale || `${input.tier} has no released model. These general role suggestions are not rank-specific estimates.`;
  let scored:{index:number; probability:number|null; score:number}[]=[];
  if(!stale && model?.status==='ready' && model.weights) {
    const supports=(i:number)=>(model.support?.[i]??0)>=100&&(model.mapSupport?.[input.map]?.[i]??0)>=20;
    if(picked.every(supports)) {
      const strict=recommend(bundle,state,input,now);
      if(strict.results.length) {basis='validated-model';notice='Estimated set-win probabilities from this rank’s model. Close estimates are similar; these are not measured gains from changing your pick.';scored=strict.results.map(r=>({index:r.index,probability:r.probability,score:r.probability}));}
    }
    if(!scored.length) {
      scored=legal.filter(i=>(model.support?.[i]??0)>=20).map(i=>({index:i,probability:null,score:probability(bundle,model,[...input.allies,i,...input.enemies],input.map)}));
      if(scored.length) {basis='approximate-model';notice='Approximate ranking: this rank’s learned strength, mode, ally and opponent patterns are used despite thin map/draft evidence. Win percentages are hidden because calibration is not established for this context.';}
    }
  }
  const role=(i:number)=>lookup.get(bundle.brawlers[i].id)?.class.name??'Unknown';
  const mode=modeName(bundle.maps[input.map].mode), allyRoles=input.allies.map(role);
  if(!scored.length && legal.length) {
    scored=legal.map(i=>({index:i,probability:null,score:fit(role(i),mode,'Unknown / mixed').score+(allyRoles.includes(role(i))?0:1)}));
    basis='role-heuristic';
    if(!stale && model?.status==='ready') notice='No remaining candidate has enough training support for a learned ranking. These are general mode/role starting points; they do not predict this draft’s outcome.';
  }
  scored.sort((a,b)=>b.score-a.score||bundle.brawlers[a.index].name.localeCompare(bundle.brawlers[b.index].name));
  const results=scored.map(row=>{
    const i=row.index, c=lookup.get(bundle.brawlers[i].id), reasons:string[]=[];
    let caution='Check range, available gadgets and your comfort before locking in. Role labels alone do not establish a counter.';
    if(basis!=='role-heuristic') {
      const n=bundle.brawlers.length,k=bundle.modes.length,base=n*(1+k+bundle.maps.length),w=model.weights!;
      const modeIndex=bundle.modes.indexOf(bundle.maps[input.map].mode);
      const signals=[{value:w[i]+w[n+modeIndex*n+i]+w[n*(1+k)+input.map*n+i],text:`Learned individual, mode and map effects favor ${pretty(bundle.brawlers[i].name)} in this tier.`},
        ...input.allies.map(a=>({value:w[base+Math.min(a,i)*n+Math.max(a,i)],text:`Positive learned pairing signal with ${pretty(bundle.brawlers[a].name)}.`})),
        ...input.enemies.map(e=>({value:(i<e?1:-1)*w[base+n*n+Math.min(i,e)*n+Math.max(i,e)],text:`Positive learned matchup signal against ${pretty(bundle.brawlers[e].name)}.`}))];
      reasons.push(...signals.filter(s=>s.value>0.01).sort((a,b)=>b.value-a.value).slice(0,2).map(s=>s.text));
      if(!reasons.length) reasons.push('The combined learned effects rank this option above the alternatives; no strong positive individual signal was found.');
      const risk=signals.filter(s=>s.value<-.01).sort((a,b)=>a.value-b.value)[0];
      if(risk) caution=risk.text.replace('Positive learned','Negative learned').replace('effects favor','effects weigh against')+' This is an association in the sample, not a proven counter.';
      if(basis==='approximate-model') reasons.push('Thin-context estimate: effects learned elsewhere in this tier may not transfer to this exact draft.');
    } else {
      reasons.push(...fit(role(i),mode,'Unknown / mixed').reasons);
      reasons.push(allyRoles.includes(role(i))?'Your team already has this role; check whether you need a different job.':`${role(i)} adds a different role to the two allies you entered.`);
      if(allyRoles.filter(r=>r===role(i)).length===2)caution='All three teammates would share a broad role. Check coverage, range and defensive options before committing.';
    }
    return {index:i,brawler:bundle.brawlers[i],probability:row.probability,mapExamples:model?.mapSupport?.[input.map]?.[i]??0,tierExamples:model?.support?.[i]??0,reasons,caution,tip:roleAdvice[c?.class.name??'']??objectives[mode]??'Play for the objective and keep an escape route.'};
  });
  return {basis,notice,results,excluded:legal.length-results.length,version:bundle.version};
}
