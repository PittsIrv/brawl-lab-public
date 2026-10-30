"""Public timing aggregates from deduplicated, eligible sets; no outcomes or identities.

Use the full label-independent 25% sample BEFORE model split/caps so those
boundaries cannot create artificial quiet hours. Retain complete interior UTC
days only. Observed coverage is not a claim that the crawler ran continuously.
"""
import json
import pandas as pd

TIERS = ['Mythic', 'Legendary', 'Masters', 'Pro']


def build_time_stats(frame, regime, provenance):
    times = pd.to_datetime(frame.time, format='%Y%m%dT%H%M%S.%fZ', utc=True)
    start, end = times.min().ceil('D'), times.max().floor('D')
    if start >= end:
        raise ValueError('At least one complete interior UTC day is required')
    keep = (times >= start) & (times < end)
    eligible = pd.DataFrame({'at': times[keep].dt.floor('15min'), 'tier': frame.loc[keep, 'tier']})
    grid = pd.date_range(start, end, freq='15min', inclusive='left')
    counts = eligible.groupby(['at', 'tier']).size().unstack(fill_value=0)
    counts = counts.reindex(index=grid, columns=range(4), fill_value=0).fillna(0).astype(int)
    assert int(counts.to_numpy().sum()) == len(eligible)
    return {
        'schemaVersion': 1,
        'source': {k: provenance[k] for k in ['dataset', 'revision', 'sha256']},
        'regime': {k: regime[k] for k in ['rankedSeasonId', 'balancePatchId']},
        'start': start.isoformat(), 'endExclusive': end.isoformat(),
        'bucketMinutes': 15, 'sampleFraction': .25, 'tiers': TIERS,
        'sets': len(eligible), 'counts': counts.values.tolist(),
    }


def write_time_stats(frame, regime, root):
    provenance = json.loads((root / 'provenance.json').read_text())
    result = build_time_stats(frame, regime, provenance)
    (root / 'time-stats.json').write_text(json.dumps(result, separators=(',', ':')))
    print('Timing aggregate:', result['sets'], 'sets;', result['start'], 'to', result['endExclusive'], flush=True)
