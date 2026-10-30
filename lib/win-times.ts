export const WIN_TIERS = ['Mythic', 'Legendary', 'Masters', 'Pro'] as const;
export const STRENGTH_GROUPS = ['stronger', 'middle', 'developing'] as const;
export type WinTier = typeof WIN_TIERS[number];
export type StrengthGroup = typeof STRENGTH_GROUPS[number];
export type WindowResult = {players:number;inside:number;outside:number;effect:number|null;interval:[number,number]|null;winRate:number|null;otherWinRate:number|null;days:number};
export type WinGroup = {trainingPlayers:number;windows:WindowResult[];candidate:number|null;holdout:(WindowResult & {retention:number})|null};
export type WinTiming = {
  schema:number; sampleFraction:number; source:{dataset:string;revision:string;sha256:string};regime:{rankedSeasonId:number;balancePatchId:string};
  periods:Record<'training'|'validation'|'discovery'|'holdout',[string,string]>;
  protocol:{minHistory:number;minPlayers:number;minInside:number;minOutside:number;minimumHoldoutDays:number;regularization:number;utcWindowHours:number};
  tiers:Record<WinTier,{status:'insufficient-data'|'validation-failed'|'exploratory';sets:Record<string,number>;groups:Partial<Record<StrengthGroup,WinGroup>>;validation?:{skillLogLoss:number;draftOnlyLogLoss:number;brier:number};pool?:{appearances:number;known:number;developing:number}[]}>;
};
const count=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const probability=(n:number|null)=>n===null||Number.isFinite(n)&&n>=0&&n<=1;
export function validateWinTiming(data:WinTiming){
  if(data.schema!==1||data.sampleFraction!==1||data.protocol.utcWindowHours!==3||data.protocol.minimumHoldoutDays<7)throw new Error('Invalid win-time protocol');
  let last=-Infinity;
  for(const key of ['training','validation','discovery','holdout'] as const){
    const [start,end]=data.periods[key].map(Date.parse);
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<last||end<=start)throw new Error('Overlapping win-time periods');
    last=end;
  }
  for(const tier of WIN_TIERS){
    const result=data.tiers[tier];
    if(!result||!['insufficient-data','validation-failed','exploratory'].includes(result.status))throw new Error('Invalid rank evidence');
    for(const group of Object.values(result.groups)){
      if(!group||!count(group.trainingPlayers)||group.windows.length!==8||group.candidate!==null&&(!Number.isInteger(group.candidate)||group.candidate<0||group.candidate>7))throw new Error('Invalid time windows');
      if((group.candidate===null)!==(group.holdout===null))throw new Error('Missing locked-window test');
      for(const w of [...group.windows,...(group.holdout?[group.holdout]:[])]){
        if(![w.players,w.inside,w.outside,w.days].every(count)||!probability(w.winRate)||!probability(w.otherWinRate)||
          (w.effect!==null&&(!Number.isFinite(w.effect)||Math.abs(w.effect)>2))||
          (w.interval!==null&&(w.interval.length!==2||!w.interval.every(Number.isFinite)||w.effect===null||w.interval[0]>w.effect||w.interval[1]<w.effect)))throw new Error('Invalid outcome aggregate');
      }
      if(group.holdout&&!probability(group.holdout.retention))throw new Error('Invalid cohort retention');
    }
    if(result.pool&&(result.pool.length!==8||!result.pool.every(p=>[p.appearances,p.known,p.developing].every(count)&&p.developing<=p.known&&p.known<=p.appearances)))throw new Error('Invalid pool coverage');
  }
}
export function evidenceState(data:WinTiming,tier:WinTier,group:StrengthGroup){
  const rank=data.tiers[tier],g=rank.groups[group],h=g?.holdout;
  if(rank.status!=='exploratory'||!g||g.candidate===null||!h)return 'insufficient' as const;
  if(h.players<data.protocol.minPlayers||h.inside<200||h.retention<.7)return 'thin' as const;
  if(h.effect===null||h.effect<=0)return 'not-repeated' as const;
  if(!h.interval||h.interval[0]<=0)return 'uncertain' as const;
  if(h.days<data.protocol.minimumHoldoutDays)return 'short' as const;
  // Historical association only. Region, party and personal validation remain absent.
  return 'provisional' as const;
}
export function localWindow(index:number,timezone:string,date:string){
  if(!Number.isInteger(index)||index<0||index>7)throw new Error('Invalid window');
  const start=Date.parse(date+'T00:00:00Z')+index*10800000;
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  return `${fmt.format(start)}–${fmt.format(start+10800000)}`;
}
export function localWindowRange(index:number,timezone:string,start:string,end:string){
  const labels=new Set<string>();
  for(let at=Date.parse(start+'T00:00:00Z');at<Date.parse(end+'T00:00:00Z');at+=86400000){
    labels.add(localWindow(index,timezone,new Date(at).toISOString().slice(0,10)));
  }
  return [...labels].join(' / ');
}
export const pp=(n:number|null)=>n===null?'—':`${n>=0?'+':''}${(n*100).toFixed(1)} pp`;
