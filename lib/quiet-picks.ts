import {populationRows,type MapGuideData} from './map-guide';
import type {RankTier} from './ranks';

/** Less popular, well-sampled map performers; no draft-conditional probability. */
export function quietPicks(data:MapGuideData,tier:RankTier,map:number,now=Date.now(),available?:ReadonlySet<number>) {
  if(data.stale||data.unavailable||!data.population||!Number.isFinite(data.freshUntil)||now>=data.freshUntil)return [];
  const rows=populationRows(data.population,tier,map);
  // Same top-12 definition as the matchup workspace. Determine popularity
  // before ownership filtering, so owned popular picks never become "quiet".
  const hot=new Set([...rows].filter(r=>r.n>=50).sort((a,b)=>b.n-a.n||a.id-b.id).slice(0,12).map(r=>r.id));
  return rows.filter(r=>r.n>=100&&r.low>50&&r.appearanceRate<10&&!hot.has(r.id)&&(!available||available.has(r.id)))
    .sort((a,b)=>b.low-a.low||b.n-a.n||a.id-b.id).slice(0,3);
}
