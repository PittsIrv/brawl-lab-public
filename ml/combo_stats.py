"""Export anonymous same-team evidence for positive released pair terms.

Counts describe the retained deduplicated train/validation/test sets. They do
not refit the model or change test metrics. Match the exact source and map
aggregates before associating counts with a released coefficient vector.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from map_stats import build_map_stats, TIERS


def pair_counts(data, tier_index, n, m):
    counts = np.zeros((m, n, n), dtype=np.int64)
    wins = np.zeros_like(counts)
    training = np.zeros_like(counts)
    for split in ['train', 'validation', 'test']:
        take = data[split+'_tier'] == tier_index
        b, maps, y = data[split+'_b'][take], data[split+'_map'][take], data[split+'_y'][take]
        for side in [0, 3]:
            for i, j in [(0, 1), (0, 2), (1, 2)]:
                lo, hi = np.minimum(b[:, side+i], b[:, side+j]), np.maximum(b[:, side+i], b[:, side+j])
                np.add.at(counts, (maps, lo, hi), 1)
                np.add.at(wins, (maps, lo, hi), y if side == 0 else 1-y)
                if split == 'train': np.add.at(training, (maps, lo, hi), 1)
    assert counts.sum() == sum(int((data[s+'_tier'] == tier_index).sum()) for s in ['train','validation','test'])*6
    assert wins.sum()*2 == counts.sum()
    return counts, wins, training


def build_combo_stats(data, audit, provenance, snapshot):
    bundle = snapshot['bundle']
    assert build_map_stats(data, audit, provenance, bundle['version']) == snapshot['stats'], 'Prepared sets must exactly match released map statistics'
    n, m = len(bundle['brawlers']), len(bundle['maps'])
    base = n*(1+len(bundle['modes'])+m)
    tiers = {}
    for ti, tier in enumerate(TIERS):
        model = bundle['models'][tier]
        rows = []
        if model['status'] == 'ready':
            counts, wins, train = pair_counts(data, ti, n, m)
            total, won, trained = counts.sum(axis=0), wins.sum(axis=0), train.sum(axis=0)
            for a in range(n):
                for b in range(a+1, n):
                    if min(model['support'][a],model['support'][b]) < 100 or model['weights'][base+a*n+b] <= .01 or total[a,b] < 100 or trained[a,b] < 50: continue
                    rows.append({'a':a,'b':b,'n':int(total[a,b]),'wins':int(won[a,b]),'train':int(trained[a,b]),
                        'maps':[[i,int(counts[i,a,b]),int(wins[i,a,b]),int(train[i,a,b])] for i in range(m) if counts[i,a,b] >= 30 and train[i,a,b] >= 10]})
        tiers[tier] = rows
    return {'schema':1,'bundleVersion':bundle['version'],'sourceRevision':provenance['revision'],
        'rankedSeasonId':bundle['regime']['rankedSeasonId'],'balancePatchId':bundle['regime']['balancePatchId'],
        'brawlerIds':[b['id'] for b in bundle['brawlers']],'maps':bundle['maps'],'tiers':tiers}


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--data-dir',required=True);p.add_argument('--snapshot',required=True);p.add_argument('--output',required=True);a=p.parse_args();root=Path(a.data_dir)
    result=build_combo_stats(np.load(root/'prepared.npz'),json.loads((root/'audit.json').read_text()),json.loads((root/'provenance.json').read_text()),json.loads(Path(a.snapshot).read_text()))
    Path(a.output).write_text(json.dumps(result,separators=(',',':')))
    print('Exported supported positive pairs:',{k:len(v) for k,v in result['tiers'].items()})
