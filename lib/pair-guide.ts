import {staleReason, TIERS, type Bundle, type ModelState, type Tier} from './final-pick';
import {validateMapStats, type MapStats} from './map-guide';
import catalog from './data/brawlers.json';

export type PairKind = 'answers' | 'partners' | 'risks' | 'friction';
export type PairRow = {index:number; signal:number; mapAppearances:number; trainingAppearances:number; tip:string};
export type PairGuide = {unavailable:string; hot:number[]; rows:Record<PairKind,PairRow[]>};
const roles = new Map(catalog.map(b => [b.id,b.class.name]));
const emptyRows = ():PairGuide['rows'] => ({answers:[],partners:[],risks:[],friction:[]});

// These are role-based practice ideas, deliberately separate from learned coefficients.
export function pairPractice(candidateRole:string,anchorRole:string,allied:boolean) {
  if(allied) {
    if([candidateRole,anchorRole].includes('Support')) return 'Keep the teammate who benefits from your utility in range, but use separate firing lanes. Check the actual support ability; this role does not always mean healing.';
    if([candidateRole,anchorRole].includes('Artillery')) return 'Use cover for indirect pressure while the other teammate guards an approach. Check whether either loadout destroys the walls you need.';
    if([candidateRole,anchorRole].some(r=>r==='Tank'||r==='Assassin')) return 'Wait for your partner to draw attention or spend enemy ammo before closing the gap. Agree on a follow-up rather than entering alone.';
    if(candidateRole===anchorRole) return 'Use different angles rather than stacking. A shared role can leave a shared weakness; use the third pick to cover range, dives or control.';
    return 'Split lanes and time pressure together. Check which teammate holds space and which follows up; the pair still needs a complementary third pick.';
  }
  if(candidateRole==='Artillery') return 'Look for intact cover that lets you pressure this opponent indirectly. If walls disappear or a flanker reaches you, reassess the matchup.';
  if(candidateRole==='Marksman') return 'Test the range advantage from a safe lane and preserve an escape option. Open sightlines help; cover and enemy defensive abilities can change the exchange.';
  if(candidateRole==='Assassin'||candidateRole==='Tank') return 'Test a covered approach after the opponent spends ammo or a defensive ability. A model term is not permission to dive through the other two enemies.';
  if(candidateRole==='Controller') return 'Make the opponent cross a controlled choke or objective. Do not abandon useful ground just to chase the named matchup.';
  return 'Test this matchup at your effective range with ammo in reserve. Watch the other two enemies and the objective; team-level evidence is not a duel result.';
}

/** Inspect pair terms, not the final-team probability or a causal counter table. */
export function pairGuide(bundle:Bundle,state:ModelState,stats:MapStats|null,tier:Tier,map:number,anchor:number,hotOnly=true,now=Date.now()):PairGuide {
  if(!TIERS.includes(tier)||!Number.isInteger(map)||!bundle.maps[map]||!Number.isInteger(anchor)||!bundle.brawlers[anchor]) throw new Error('Choose a valid rank, map and brawler.');
  const unavailable=staleReason(bundle,state,now);
  if(unavailable)return {unavailable,hot:[],rows:emptyRows()};
  if(!stats)return {unavailable:'Matching map statistics are unavailable for this release.',hot:[],rows:emptyRows()};
  validateMapStats(stats,bundle);
  const counts=stats.tiers[tier].maps[map];
  const hot=counts.appearances.map((n,i)=>({n,i})).filter(r=>r.n>=50).sort((a,b)=>b.n-a.n||a.i-b.i).slice(0,12).map(r=>r.i);
  const model=bundle.models[tier];
  if(model?.status!=='ready'||!model.weights)return {unavailable:`${tier} has no released pair model. Another rank is not substituted.`,hot,rows:emptyRows()};
  const supported=(i:number)=>(model.support?.[i]??0)>=100&&(model.mapSupport?.[map]?.[i]??0)>=20&&counts.appearances[i]>=50;
  if(!supported(anchor))return {unavailable:'This brawler has too little individual evidence on the selected map to inspect its learned pairs.',hot,rows:emptyRows()};
  const n=bundle.brawlers.length,base=n*(1+bundle.modes.length+bundle.maps.length),w=model.weights;
  const rows=emptyRows(),anchorRole=roles.get(bundle.brawlers[anchor].id)??'Unknown';
  for(let i=0;i<n;i++) {
    if(i===anchor||!supported(i)||(hotOnly&&!hot.includes(i)))continue;
    const offset=Math.min(i,anchor)*n+Math.max(i,anchor);
    const allied=w[base+offset],against=(i<anchor?1:-1)*w[base+n*n+offset];
    const role=roles.get(bundle.brawlers[i].id)??'Unknown';
    const make=(signal:number,kind:PairKind):PairRow=>({index:i,signal,mapAppearances:counts.appearances[i],trainingAppearances:model.mapSupport![map][i],tip:pairPractice(role,anchorRole,kind==='partners'||kind==='friction')});
    if(against>.01)rows.answers.push(make(against,'answers'));
    if(against<-.01)rows.risks.push(make(against,'risks'));
    if(allied>.01)rows.partners.push(make(allied,'partners'));
    if(allied<-.01)rows.friction.push(make(allied,'friction'));
  }
  for(const kind of Object.keys(rows) as PairKind[]) rows[kind].sort((a,b)=>Math.abs(b.signal)-Math.abs(a.signal)||b.mapAppearances-a.mapAppearances||a.index-b.index);
  return {unavailable:'',hot,rows};
}
