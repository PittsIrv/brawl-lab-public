"""Descriptive per-tier/map statistics from the audited, deduplicated sample.

Uses all retained chronological splits, never retrains on test outcomes.
Each unique brawler contributes one appearance and at most one win per set.
"""
import numpy as np

TIERS = ['Mythic', 'Legendary', 'Masters', 'Pro']


def build_map_stats(data, audit, provenance, version):
    n, m = len(audit['brawlers']), len(audit['maps'])
    tiers = {}
    for tier_index, tier in enumerate(TIERS):
        appearances = np.zeros((m, n), dtype=np.int64)
        wins = np.zeros((m, n), dtype=np.int64)
        sets = np.zeros(m, dtype=np.int64)
        for split in ['train', 'validation', 'test']:
            selected = data[split + '_tier'] == tier_index
            brawlers = data[split + '_b'][selected]
            maps = data[split + '_map'][selected]
            outcome = data[split + '_y'][selected]
            np.add.at(sets, maps, 1)
            for position in range(6):
                np.add.at(appearances, (maps, brawlers[:, position]), 1)
                np.add.at(wins, (maps, brawlers[:, position]), outcome if position < 3 else 1 - outcome)
        assert np.all(appearances.sum(axis=1) == sets * 6)
        assert np.all(wins.sum(axis=1) == sets * 3)
        tiers[tier] = {'sets': int(sets.sum()), 'maps': [
            {'sets': int(sets[i]), 'appearances': appearances[i].tolist(), 'wins': wins[i].tolist()}
            for i in range(m)
        ]}
    return {
        'schema': 1, 'bundleVersion': version, 'sourceRevision': provenance['revision'],
        'rankedSeasonId': audit['regime']['rankedSeasonId'],
        'balancePatchId': audit['regime']['balancePatchId'],
        'start': audit['regime']['start'], 'end': audit['regime']['end'],
        'dataFrom': min(v[0] for v in audit['split_ranges'].values()),
        'dataThrough': max(v[1] for v in audit['split_ranges'].values()),
        'brawlerIds': [b['id'] for b in audit['brawlers']], 'maps': audit['maps'],
        'tiers': tiers,
    }
