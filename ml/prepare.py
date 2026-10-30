"""Audit a pinned Ranked parquet and prepare reproducible, outcome-safe model inputs.
Raw tags never enter the draft model or exported website artifacts. Optional
private timing inputs retain anonymous, linkable participant codes for history.
"""
import argparse,json,hashlib,re,collections
from pathlib import Path
import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from time_stats import write_time_stats

p=argparse.ArgumentParser();p.add_argument('--data-dir',required=True);p.add_argument('--regime',default='ml/regime.json');p.add_argument('--catalog',default='lib/data/brawlers.json');p.add_argument('--win-time-history',action='store_true',help='Write private longitudinal inputs beside the raw data; never publish this NPZ');args=p.parse_args();root=Path(args.data_dir);regime=json.load(open(args.regime))
cat=json.load(open(args.catalog));canon=lambda s:re.sub('[^A-Z0-9]','',str(s).upper());lookup={canon(b['name']):b for b in cat}
roster=sorted(cat,key=lambda b:b['id']);by_name={canon(b['name']):i for i,b in enumerate(roster)}
columns=['battle_time','mode','map','record']+[f't{t}_b{i}_{f}' for t in [1,2] for i in range(3) for f in ['name','tag','power','elo']]
counts=collections.Counter();chunks=[];all_maps=set();records=collections.Counter();unknown=collections.Counter();bounds=[]
# A valid completed set must terminate at the FIRST second win, including possible draws.
def winner(record):
 wins=[0,0]
 for token in str(record).split('-'):
  if max(wins)>=2:return -1
  if token not in ['T1','T2','D']:return -1
  if token!='D':wins[int(token[1])-1]+=1
 return (0 if wins[0]==2 else 1) if max(wins)==2 else -1
for bi,batch in enumerate(pq.ParquetFile(root/regime['localFile']).iter_batches(batch_size=100000,columns=columns)):
 d=batch.to_pandas();counts['raw']+=len(d);records.update(d.record.value_counts().to_dict());bounds.extend([d.battle_time.min(),d.battle_time.max()])
 y=d.record.map(winner).to_numpy();valid=y>=0;counts['incomplete_or_invalid_set']+=int((~valid).sum())
 names=np.column_stack([d[f't{t}_b{i}_name'].map(canon).to_numpy() for t in [1,2] for i in range(3)])
 b=np.column_stack([np.array([by_name.get(v,-1) for v in names[:,i]],dtype=np.int16) for i in range(6)])
 known=(b>=0).all(1);counts['unknown_roster']+=int((valid&~known).sum());unknown.update(names[b<0].tolist());valid&=known
 unique=(np.diff(np.sort(b,axis=1),axis=1)!=0).all(1);counts['repeated_brawler']+=int((valid&~unique).sum());valid&=unique
 powers=np.column_stack([d[f't{t}_b{i}_power'].to_numpy() for t in [1,2] for i in range(3)])
 max_power=(powers==11).all(1);counts['not_all_power11']+=int((valid&~max_power).sum());valid&=max_power
 tags=np.column_stack([d[f't{t}_b{i}_tag'].fillna('').to_numpy().astype(str) for t in [1,2] for i in range(3)])
 valid_tags=(tags!='').all(1)&(np.sort(tags,axis=1)[:,1:]!=np.sort(tags,axis=1)[:,:-1]).all(1);counts['missing_or_duplicate_players']+=int((valid&~valid_tags).sum());valid&=valid_tags
 ranks=np.column_stack([d[f't{t}_b{i}_elo'].to_numpy() for t in [1,2] for i in range(3)])
 ranked=np.isfinite(ranks).all(1)&(ranks>=13).all(1)&(ranks<=22).all(1);counts['outside_mythic_plus']+=int((valid&~ranked).sum());valid&=ranked
 tier=np.where(np.median(ranks,axis=1)<16,0,np.where(np.median(ranks,axis=1)<19,1,np.where(np.median(ranks,axis=1)<22,2,3)))
 times=d.battle_time.to_numpy().astype(str);valid_time=np.array([bool(re.fullmatch(r'\d{8}T\d{6}\.\d{3}Z',s)) for s in times]);valid&=valid_time&(times>=regime['start'])&(times<regime['end'])
 counts['eligible_before_dedup']+=int(valid.sum())
 d=d.loc[valid];b=b[valid];tier=tier[valid];tags=tags[valid];times=times[valid];y=(y[valid]==0).astype(np.int8)
 # Canonical participant identity and timestamp identify the same match across player perspectives.
 identity=pd.DataFrame(np.sort(tags,axis=1));identity['time']=times;identity['map']=d['map'].to_numpy();identity['mode']=d['mode'].to_numpy()
 hashes=pd.util.hash_pandas_object(identity,index=False).to_numpy(dtype=np.uint64)
 # Label-independent fixed 25% sample for a bounded, reproducible first model.
 take=np.ones(len(hashes),dtype=bool) if args.win_time_history else (hashes%100)<25
 out=pd.DataFrame({'time':times[take],'map':d['map'].to_numpy()[take],'mode':d['mode'].to_numpy()[take],'y':y[take],'key':hashes[take],'tier':tier[take]})
 for i in range(6):out[f'b{i}']=b[take,i]
 if args.win_time_history:
  for i in range(6):
   out[f'p{i}']=tags[take,i]
   out[f'r{i}']=ranks[valid][take,i]
 chunks.append(out)
 if bi%5==0:print('Audited',counts['raw'],'rows; eligible',counts['eligible_before_dedup'],flush=True)
d=pd.concat(chunks,ignore_index=True);before=int(((d.key%100)<25).sum())
# Conflicting outcomes for an identical identity are excluded, not arbitrarily selected.
# Team orientation can differ, so identify winner by its canonical three brawler IDs.
d['winning_team']=['-'.join(map(str,sorted(row[:3] if y else row[3:]))) for row,y in zip(d[[f'b{i}' for i in range(6)]].to_numpy(),d.y)]
conflicts=d.groupby('key').winning_team.nunique();bad=set(conflicts[conflicts>1].index);d=d[~d.key.isin(bad)].drop_duplicates('key').sort_values(['time','key']);counts['sampled_conflicting_identities']=sum(k%100<25 for k in bad);counts['sampled_duplicates_removed']=before-int(((d.key%100)<25).sum());d=d.drop(columns='winning_team')
if args.win_time_history:
 # Participant codes permit private repeated-player analysis without saving tags.
 # Codes remain linkable records, so this entire file is PRIVATE, never a public artifact.
 ps=d[[f'p{i}' for i in range(6)]].to_numpy()
 player_codes,_=pd.factorize(ps.ravel(),sort=True)
 map_codes,_=pd.factorize(pd.MultiIndex.from_arrays([d['mode'],d['map']]),sort=True)
 np.savez_compressed(root/'win-time-private.npz',players=player_codes.reshape(ps.shape),
  b=d[[f'b{i}' for i in range(6)]].to_numpy(dtype=np.int16),ranks=d[[f'r{i}' for i in range(6)]].to_numpy(dtype=np.int8),
  time=pd.to_datetime(d.time,format='%Y%m%dT%H%M%S.%fZ',utc=True).to_numpy(dtype='datetime64[s]').astype(np.int64),
  tier=d.tier.to_numpy(dtype=np.int8),y=d.y.to_numpy(dtype=np.int8),map=map_codes.astype(np.int16))
 with (root/'win-time-private.npz').open('rb') as history_file:
  history_hash=hashlib.file_digest(history_file,'sha256').hexdigest()
 (root/'win-time-private.meta.json').write_text(json.dumps({'schema':1,'sampleFraction':1,'rows':len(d),'inputSha256':json.loads((root/'provenance.json').read_text())['sha256'],'historySha256':history_hash}))
# Retain full histories privately for longitudinal work, then reproduce the
# original label-independent 25% draft/activity sample without changing release inputs.
d=d[(d.key%100)<25]
# Timing must precede split gaps and model caps, which distort activity counts.
write_time_stats(d, regime, root)
# Absolute UTC chronological boundaries, with gaps to separate adjacent battles/sets.
splits={'train':d.time<regime['trainEnd'],'validation':(d.time>=regime['validationStart'])&(d.time<regime['validationEnd']),'test':d.time>=regime['testStart']}
map_keys=sorted(set(zip(d['mode'],d['map'])));map_ids={k:i for i,k in enumerate(map_keys)};mode_names=sorted(d['mode'].unique());mode_ids={k:i for i,k in enumerate(mode_names)}
# Vocabulary names carry no outcome information. Support thresholds use training counts only.
arrays={};ranges={};split_counts={}
for split,mask in splits.items():
 s=d.loc[mask];cap=400000 if split=='train' else 100000
 if len(s)>cap:s=s.nsmallest(cap,'key').sort_values(['time','key'])
 arrays[split+'_tier']=s.tier.to_numpy(dtype=np.int8)
 arrays[split+'_b']=s[[f'b{i}' for i in range(6)]].to_numpy(dtype=np.int16)
 arrays[split+'_map']=np.array([map_ids[k] for k in zip(s['mode'],s['map'])],dtype=np.int16)
 arrays[split+'_mode']=s['mode'].map(mode_ids).to_numpy(dtype=np.int16);arrays[split+'_y']=s.y.to_numpy(dtype=np.int8)
 arrays[split+'_key']=s.key.to_numpy(dtype=np.uint64)
 ranges[split]=[s.time.min(),s.time.max()];split_counts[split]=len(s)
assert all(set(arrays[a+'_key']).isdisjoint(set(arrays[b+'_key'])) for a,b in [('train','validation'),('train','test'),('validation','test')])
np.savez_compressed(root/'prepared.npz',**arrays)
audit={'regime':regime,'counts':dict(counts),'unknown_names':dict(unknown),'raw_time_range':[min(bounds),max(bounds)],'record_patterns':dict(records),'split_counts':split_counts,'split_ranges':ranges,'sample_fraction':0.25,'maps':[{'mode':a,'name':b} for a,b in map_keys],'modes':mode_names,'brawlers':[{'id':b['id'],'name':b['name']} for b in roster],'filters':['Valid completed first-to-two set','Six distinct brawlers and players','All six power level 11','Known catalog brawlers','No player identifiers, MVP, duration, outcome-derived stats, or source skill_ns as features'],'evaluation_limit':'Chronological match split, not player-disjoint. Repeated players can occur across partitions. Missing bans and pick order; unobserved substitutions are not labeled.'}
(root/'audit.json').write_text(json.dumps(audit,indent=2));print(json.dumps({k:v for k,v in audit.items() if k in ['counts','unknown_names','split_counts','split_ranges','raw_time_range']},indent=2),flush=True)
