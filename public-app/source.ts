import snapshot from './data/snapshot.json';
import {staleReason,validateBundle,type Bundle,type ModelState} from '@/lib/final-pick';
import {validateMapStats,type MapGuideData,type MapStats} from '@/lib/map-guide';
import {draftAdvice} from '@/lib/draft-advice';
import type {DraftSource} from '@/components/final-pick';
export const bundle=snapshot.bundle as unknown as Bundle,state=snapshot.state as ModelState,stats=snapshot.stats as MapStats;
validateBundle(bundle);validateMapStats(stats,bundle);
export async function loadGuide():Promise<MapGuideData>{return {version:bundle.version,stale:staleReason(bundle,state),unavailable:'',checkedAt:state.checkedAt,freshUntil:Math.min(Date.parse(bundle.expiresAt),Date.parse(state.checkedAt)+36*3600000),regime:bundle.regime,population:stats,brawlers:bundle.brawlers,maps:bundle.maps};}
export const draftSource:DraftSource={async load(){return {meta:{...bundle,state,stale:staleReason(bundle,state)},guide:await loadGuide()};},async evaluate(input){return draftAdvice(bundle,state,input);}};
