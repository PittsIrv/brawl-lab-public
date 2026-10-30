"""Historical win-window experiment. Private histories in; aggregate report out.

Protocol is fixed before reading holdout outcomes. No hour enters skill training.
Neither player parameters nor individual histories are written to the website.
"""
import argparse, hashlib, json, warnings
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix, hstack
from scipy.special import expit
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, brier_score_loss
from sklearn.exceptions import ConvergenceWarning

TIERS = ['Mythic', 'Legendary', 'Masters', 'Pro']
GROUPS = ['developing', 'middle', 'stronger']
MIN_HISTORY = 20
MIN_PLAYERS = 50
MIN_INSIDE = 2
MIN_OUTSIDE = 5

def stamp(s):
    return int(pd.Timestamp(s, tz='UTC').timestamp())


def features(b, ranks, maps, players, known, n_brawlers, n_maps):
    """Antisymmetric team differences: brawler, brawler-map, rank and player."""
    rows, cols, vals = [], [], []
    n = len(b)
    for j in range(6):
        sign = 1 if j < 3 else -1
        for col in [b[:, j], n_brawlers + maps * n_brawlers + b[:, j],
                    n_brawlers * (1 + n_maps) + ranks[:, j] - 13]:
            rows.append(np.arange(n)); cols.append(col); vals.append(np.full(n, sign))
    width = n_brawlers * (1 + n_maps) + 10
    context = coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n, width)).tocsr()
    code = known[players]
    mask = code >= 0
    r = np.broadcast_to(np.arange(n)[:, None], code.shape)[mask]
    v = np.broadcast_to(np.array([1,1,1,-1,-1,-1]), code.shape)[mask]
    skill = coo_matrix((v, (r, code[mask])), shape=(n, int(known.max()) + 1)).tocsr()
    return context, hstack([context, skill], format='csr')


def player_comparison(frame, window, allowed=None):
    """Equal-weight within-player contrast, not pooled winners vs losers.

    Outcomes do not determine eligibility. Only players observed both inside and
    outside the window are compared; validation uses the frozen discovery cohort.
    """
    d = frame if allowed is None else frame[frame.player.isin(allowed)]
    inside = d.window == window
    def aggregate(part):
        return part.groupby('player').agg(n=('y','size'), wins=('y','sum'), residual=('residual','mean'))
    a, b = aggregate(d[inside]), aggregate(d[~inside])
    pair = a.add_suffix('_in').join(b.add_suffix('_out'), how='inner')
    pair = pair[(pair.n_in >= MIN_INSIDE) & (pair.n_out >= MIN_OUTSIDE)]
    if pair.empty:
        return {'players':0,'inside':0,'outside':0,'effect':None,'interval':None,'winRate':None,'otherWinRate':None,'days':0}, set()
    delta = pair.residual_in - pair.residual_out
    # Approximate player-cluster uncertainty. Shared teams/sessions and short day
    # coverage remain unmodeled; this is deliberately not a causal interval.
    se = float(delta.std(ddof=1) / np.sqrt(len(delta))) if len(delta)>1 else 1.
    effect = float(delta.mean())
    ids = set(pair.index)
    days = int(d[inside & d.player.isin(ids)].day.nunique())
    return {'players':len(pair),'inside':int(pair.n_in.sum()),'outside':int(pair.n_out.sum()),
            'effect':effect,'interval':[effect-1.96*se,effect+1.96*se],
            'winRate':float((pair.wins_in / pair.n_in).mean()),
            'otherWinRate':float((pair.wins_out / pair.n_out).mean()),'days':days}, ids


def select_candidate(windows):
    eligible = [i for i,w in enumerate(windows) if w['players']>=MIN_PLAYERS and w['inside']>=200 and w['days']>=3 and w['effect'] is not None and w['effect']>0]
    return max(eligible, key=lambda i: (windows[i]['effect'], -i)) if eligible else None


def public_result(result):
    # Avoid publishing noisy outcome summaries for very small linked cohorts.
    return {**result, **({k:None for k in ['effect','interval','winRate','otherWinRate']} if result['players']<20 else {})}


def participant_frame(players, y, context_logits, times, memberships, group):
    outcome = np.column_stack([y]*3 + [1-y]*3).ravel()
    expected = expit(context_logits)
    predicted = np.column_stack([expected]*3 + [1-expected]*3).ravel()
    p = players.ravel()
    mask = memberships[p] == group
    repeated_time = np.repeat(times, 6)[mask]
    return pd.DataFrame({'player':p[mask], 'y':outcome[mask], 'residual':(outcome-predicted)[mask],
                         'window':(repeated_time % 86400)//10800, 'day':repeated_time//86400})


def run(root, output):
    provenance = json.loads((root/'provenance.json').read_text())
    regime = json.loads((root/'audit.json').read_text())['regime']
    with (root/regime['localFile']).open('rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != provenance['sha256']:
            raise ValueError('Raw data differs from pinned provenance')
    meta=json.loads((root/'win-time-private.meta.json').read_text())
    with (root/'win-time-private.npz').open('rb') as history:
        if meta['inputSha256']!=provenance['sha256'] or meta['sampleFraction']!=1 or hashlib.file_digest(history,'sha256').hexdigest()!=meta['historySha256']:
            raise ValueError('Private history does not match this full-data release')
    a = np.load(root/'win-time-private.npz')
    # Fixed UTC boundaries. Deliberately do not reuse the final-pick model, which
    # has seen later matches and would leak future outcomes into player strength.
    edges = [stamp(s) for s in ['2026-10-16','2026-10-20','2026-10-21','2026-10-24','2026-10-27']]
    if not (regime['start'] <= '20261016T000000.000Z' and regime['end'] >= '20261027T000000.000Z'):
        raise ValueError('Protocol dates must be entirely inside one verified regime')
    report = {'schema':1, 'sampleFraction':1, 'source':{k:provenance[k] for k in ['dataset','revision','sha256']},
              'regime':{k:regime[k] for k in ['rankedSeasonId','balancePatchId']},
              'periods':{'training':['2026-10-16','2026-10-20'], 'validation':['2026-10-20','2026-10-21'],
                         'discovery':['2026-10-21','2026-10-24'], 'holdout':['2026-10-24','2026-10-27']},
              'protocol':{'minHistory':MIN_HISTORY,'minPlayers':MIN_PLAYERS,'minInside':MIN_INSIDE,'minOutside':MIN_OUTSIDE,
                          'minimumHoldoutDays':7,'regularization':.1,'utcWindowHours':3}, 'tiers':{}}
    for tier,name in enumerate(TIERS):
        ix = np.flatnonzero((a['tier']==tier) & (a['time']>=edges[0]) & (a['time']<edges[-1]))
        d = {k:a[k][ix] for k in a.files}
        masks = [(d['time']>=lo)&(d['time']<hi) for lo,hi in zip(edges[:-1],edges[1:])]
        counts = [int(m.sum()) for m in masks]
        result = {'status':'insufficient-data','sets':dict(zip(report['periods'],counts)), 'groups':{}}
        report['tiers'][name] = result
        print(name, result['sets'], flush=True)
        if min(counts)<1000 or counts[0]<5000:
            continue
        players=d['players']; size=int(a['players'].max())+1
        prior_n=np.bincount(players[masks[0]].ravel(),minlength=size)
        known=np.full(size,-1); eligible=np.flatnonzero(prior_n>=MIN_HISTORY); known[eligible]=np.arange(len(eligible))
        if len(eligible)<150:
            continue
        context, x = features(d['b'].astype(int),d['ranks'].astype(int),d['map'].astype(int),players,known,int(a['b'].max())+1,int(a['map'].max())+1)
        # Treat nonconvergence as failure, never publish a silently incomplete fit.
        with warnings.catch_warnings():
            warnings.simplefilter('error', ConvergenceWarning)
            model=LogisticRegression(C=.1,fit_intercept=False,solver='lbfgs',max_iter=400,tol=1e-6).fit(x[masks[0]],d['y'][masks[0]])
            baseline=LogisticRegression(C=.1,fit_intercept=False,solver='lbfgs',max_iter=400,tol=1e-6).fit(context[masks[0]],d['y'][masks[0]])
        vp=model.predict_proba(x[masks[1]])[:,1]; bp=baseline.predict_proba(context[masks[1]])[:,1]; vy=d['y'][masks[1]]
        metrics={'skillLogLoss':float(log_loss(vy,vp)),'draftOnlyLogLoss':float(log_loss(vy,bp)), 'brier':float(brier_score_loss(vy,vp))}
        result['validation']=metrics
        result['status']='exploratory' if metrics['skillLogLoss']<metrics['draftOnlyLogLoss'] and metrics['brier']<.25 else 'validation-failed'
        print(name, result['status'], metrics, flush=True)
        if result['status']!='exploratory':
            continue
        skill=model.coef_[0][context.shape[1]:]
        # Strength bands are relative within rank, defined ONLY by training data.
        cuts=np.quantile(skill,[1/3,2/3]); memberships=np.full(size,-1)
        memberships[eligible]=np.searchsorted(cuts,skill)
        context_logits=context @ model.coef_[0][:context.shape[1]]
        for group,label in enumerate(GROUPS):
            frames=[participant_frame(players[m],d['y'][m],context_logits[m],d['time'][m],memberships,group) for m in masks[2:]]
            windows=[]; ids=[]
            for w in range(8):
                stats, cohort=player_comparison(frames[0],w); windows.append(stats); ids.append(cohort)
            candidate=select_candidate(windows)
            holdout=None
            if candidate is not None:
                holdout,_=player_comparison(frames[1],candidate,ids[candidate])
                holdout['retention']=holdout['players']/windows[candidate]['players']
                # Only this preselected window is tested. Other holdout windows are
                # not exported for cherry-picking a replacement winner.
            result['groups'][label]={'trainingPlayers':int((memberships==group).sum()),'windows':[public_result(w) for w in windows],'candidate':candidate,'holdout':public_result(holdout) if holdout else None}
        # Descriptive weak-pool fraction is measured against frozen, known players;
        # report coverage so unidentified players cannot masquerade as stronger.
        later=masks[2]|masks[3]; pool=[]
        for w in range(8):
            pp=players[later & ((d['time']%86400)//10800==w)].ravel()
            identified=memberships[pp]>=0
            pool.append({'appearances':len(pp),'known':int(identified.sum()),'developing':int((memberships[pp]==0).sum())})
        result['pool']=pool
    output.write_text(json.dumps(report,separators=(',',':'),allow_nan=False))
    print('Saved aggregate report:',output,flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--data-dir',required=True);p.add_argument('--output',default='public-app/data/win-times.json');args=p.parse_args()
    run(Path(args.data_dir),Path(args.output))
