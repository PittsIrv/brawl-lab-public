import unittest
import pandas as pd
from time_stats import build_time_stats

class TimingTest(unittest.TestCase):
    def test_complete_days_and_no_outcomes_or_identifiers(self):
        frame = pd.DataFrame({'time': ['20261015T090000.000Z', '20261016T000000.000Z',
            '20261016T001459.000Z', '20261016T001500.000Z', '20261016T230000.000Z',
            '20261017T000001.000Z'], 'tier':[0,0,1,2,0,3], 'tag':['private']*6, 'y':[1]*6})
        result = build_time_stats(frame, {'rankedSeasonId':50,'balancePatchId':'test'},
            {'dataset':'public','revision':'abc','sha256':'def','private':'never-export'})
        self.assertEqual(result['sets'], 4)
        self.assertEqual(len(result['counts']), 96)
        self.assertEqual(result['counts'][0], [1,1,0,0])
        self.assertEqual(result['counts'][1], [0,0,1,0])
        self.assertEqual(result['counts'][2], [0,0,0,0])
        self.assertNotIn('private', str(result))
        self.assertNotIn('tag', result)
        self.assertNotIn('y', result)
        frame.y = 0
        self.assertEqual(build_time_stats(frame, {'rankedSeasonId':50,'balancePatchId':'test'},
            {'dataset':'public','revision':'abc','sha256':'def'}), result)

    def test_too_short(self):
        with self.assertRaises(ValueError):
            build_time_stats(pd.DataFrame({'time':['20261015T090000.000Z'], 'tier':[0]}), {}, {})

if __name__ == '__main__': unittest.main()
