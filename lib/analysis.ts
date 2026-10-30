export const rankedIndex=(v:unknown):number|null=>typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=22?v:null;
export type LineupMember = {id:number;name:string;power:number|null};
export type Match = {id:string; time:string; brawler:string; brawlerId:number; map:string; mapId?:number; mode:string; queue:string; result:string; trophies:number|null; star:boolean; power:number|null; rank:number|null; rankedRank?:number|null; provenance?:string; allies?:LineupMember[]; enemies?:LineupMember[]; duration?:number; rawType?:string};
export const normalizeTag=(s:string)=>'#'+s.trim().toUpperCase().replace(/^#/,'');
export const modeName=(s:string)=>s.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase());
export function normalizeLog(items:any[],tag:string):Match[]{
 if(!Array.isArray(items))throw new Error('The JSON needs an items array from the official battle log.');
 const wanted=normalizeTag(tag);
 return items.flatMap((item:any)=>{
  const b=item?.battle, e=item?.event;
  if(!b||!e||typeof item.battleTime!=='string'||!isRankedType(b.type))return [];
  const players=[...(Array.isArray(b.players)?b.players:[]),...(Array.isArray(b.teams)?b.teams.flat():[])];
  const player=players.find((p:any)=>p?.tag&&normalizeTag(p.tag)===wanted);
  if(!player)return [];
  const br=player.brawler;
  const teamRows=Array.isArray(b.teams)?b.teams:[];
  const mine=teamRows.findIndex((team:any[])=>team.some(p=>p?.tag&&normalizeTag(p.tag)===wanted));
  const members=(rows:any[])=>rows.filter(p=>p?.brawler).map(p=>({id:Number(p.brawler.id),name:String(p.brawler.name),power:typeof p.brawler.power==='number'?p.brawler.power:null}));
  const allies=mine>=0?members(teamRows[mine]):[];
  const enemies=mine>=0?members(teamRows.filter((_:any,i:number)=>i!==mine).flat()):[];
  const mode=String(b.mode||e.mode||'unknown');
  const raw=item.battleTime;
  const iso=raw.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(.*)$/,'$1-$2-$3T$4:$5:$6$7');
  if(!Number.isFinite(Date.parse(iso)))return [];
  const queue='Ranked';
  const result=['victory','defeat','draw'].includes(b.result)?b.result:'placement';
  // Multi-brawler Duels do not identify a single responsible brawler.
  const multi=mode==='duels'||!br;
  return [{rankedRank:rankedIndex(br?.trophies),allies,enemies,duration:typeof b.duration==='number'?b.duration:undefined,rawType:String(b.type||'unknown'),id:[raw,e.id,mode,b.type].join('|'),time:iso,brawler:multi?'Unattributed':String(br.name),brawlerId:multi?0:Number(br.id),map:String(e.map||'Unknown map'),mapId:Number(e.id)||undefined,mode:modeName(mode),queue,result,trophies:typeof b.trophyChange==='number'?b.trophyChange:null,star:b.starPlayer?.tag===wanted,power:typeof br?.power==='number'?br.power:null,rank:typeof b.rank==='number'?b.rank:null}];
 });
}
export function mergeMatches(old:Match[],fresh:Match[]){return [...new Map(rankedOnly([...old,...fresh]).map(m=>[m.id,m])).values()].sort((a,b)=>b.time.localeCompare(a.time));}
export function stats(rows:Match[]){const wins=rows.filter(x=>x.result==='victory').length,losses=rows.filter(x=>x.result==='defeat').length,draws=rows.filter(x=>x.result==='draw').length,n=wins+losses;const p=n?wins/n:0,z=1.96,den=1+z*z/(n||1),center=(p+z*z/(2*(n||1)))/den,margin=z*Math.sqrt(p*(1-p)/(n||1)+z*z/(4*(n||1)**2))/den;return{wins,losses,draws,n,total:rows.length,rate:n?wins/n*100:null,low:n?(center-margin)*100:0,high:n?(center+margin)*100:100,score:(wins+5)/(n+10)*100,trophies:rows.reduce((s,x)=>s+(x.trophies??0),0),hasTrophies:rows.some(x=>x.trophies!==null)};}
export function groupStats(rows:Match[],key:(m:Match)=>string){return Object.entries(Object.groupBy(rows,key)).map(([name,group])=>({name,rows:group!,...stats(group!)})).sort((a,b)=>b.score-a.score||b.n-a.n);}
export function makeDemo():Match[]{const picks=[['PIPER',16000015,'Shooting Star','Bounty',.72],['BELLE',16000049,'Out in the Open','Knockout',.64],['SANDY',16000028,'Double Swoosh','Gem Grab',.66],['COLT',16000001,'Safe Zone','Heist',.48],['MORTIS',16000011,'Backyard Bowl','Brawl Ball',.34],['JESSIE',16000007,'Ring of Fire','Hot Zone',.62]];return Array.from({length:126},(_,i)=>{const p=picks[i%6];return{id:'demo-'+i,time:new Date(Date.now()-i*73*60000).toISOString(),brawler:String(p[0]),brawlerId:Number(p[1]),map:String(p[2]),mode:String(p[3]),queue:'Ranked',result:((Math.floor(i/6)*8+3)%21)/21<Number(p[4])?'victory':'defeat',trophies:null,star:i%7===0,power:11,rank:null,rankedRank:16};});}

export function sameMap(match:Match,map:{id:number;name:string}){return match.mapId ? match.mapId===map.id : match.map.toLowerCase()===map.name.toLowerCase();}

export const isRankedType=(type:unknown)=>type==='soloRanked'||type==='teamRanked';
export function rankedOnly(rows:Match[]):Match[]{return rows.filter(m=>m.queue==='Ranked'&&(!m.rawType||isRankedType(m.rawType)));}
