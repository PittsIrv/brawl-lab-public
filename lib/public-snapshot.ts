import {validateBundle, type Bundle, type ModelState} from './final-pick';
import {validateMapStats, type MapStats} from './map-guide';

// Explicit allowlist: never serialize arbitrary storage fields into the public release.
export function publicSnapshot(source:Bundle, state:ModelState, stats:MapStats) {
  validateBundle(source); validateMapStats(stats,source);
  const bundle:Bundle={schema:source.schema,version:source.version,createdAt:source.createdAt,expiresAt:source.expiresAt,
    regime:{rankedSeasonId:source.regime.rankedSeasonId,balancePatchId:source.regime.balancePatchId,balancePatchSource:source.regime.balancePatchSource,verifiedAt:source.regime.verifiedAt,sourcePartition:source.regime.sourcePartition},
    brawlers:source.brawlers.map(({id,name})=>({id,name})),maps:source.maps.map(({name,mode})=>({name,mode})),modes:source.modes,
    models:Object.fromEntries(Object.entries(source.models).map(([tier,m])=>[tier,{tier:m.tier,status:m.status,counts:m.counts,weights:m.weights,support:m.support,mapSupport:m.mapSupport,metrics:m.metrics,individualBaseline:m.individualBaseline}])),
    limitations:source.limitations,tierDefinition:source.tierDefinition,splitRanges:source.splitRanges,
    provenance:{dataset:source.provenance.dataset,revision:source.provenance.revision}};
  return {bundle,state:{checkedAt:state.checkedAt,rankedSeasonId:state.rankedSeasonId,balancePatchId:state.balancePatchId,blocked:state.blocked,reason:state.blocked?'The published model is awaiting a verified update.':''},stats:{schema:stats.schema,bundleVersion:stats.bundleVersion,sourceRevision:stats.sourceRevision,rankedSeasonId:stats.rankedSeasonId,balancePatchId:stats.balancePatchId,start:stats.start,end:stats.end,dataFrom:stats.dataFrom,dataThrough:stats.dataThrough,brawlerIds:stats.brawlerIds,maps:stats.maps.map(({name,mode})=>({name,mode})),tiers:Object.fromEntries(Object.entries(stats.tiers).map(([tier,t])=>[tier,{sets:t.sets,maps:t.maps.map(({sets,appearances,wins})=>({sets,appearances,wins}))}]))}};
}
