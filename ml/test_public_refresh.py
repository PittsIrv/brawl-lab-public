import datetime as dt
import unittest
from public_refresh import fingerprint, splits

class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.regime={'start':'20261015T090000.000Z','end':'20261119T090000.000Z'}
        self.now=dt.datetime(2026,10,30,20,tzinfo=dt.timezone.utc)
    def test_complete_days_and_gaps(self):
        r=splits(self.regime,'20261030T014920.000Z',self.now)
        self.assertEqual(r['end'],'20261030T000000.000Z')
        self.assertEqual(r['testStart'],'20261029T000000.000Z')
        self.assertEqual(r['validationEnd'],'20261028T220000.000Z')
        self.assertEqual(r['trainEnd'],'20261027T220000.000Z')
        self.assertEqual(self.regime['end'],'20261119T090000.000Z')
    def test_stale_future_and_new_regime_rejected(self):
        for latest in ('20261026T000000.000Z','20261031T000000.000Z'):
            with self.assertRaises(ValueError): splits(self.regime,latest,self.now)
        with self.assertRaises(ValueError): splits(dict(self.regime,end='20261029T000000.000Z'),'20261030T014920.000Z',self.now)
    def test_content_fingerprint(self):
        self.assertEqual(fingerprint('<h1>Balance changes</h1><script>random()</script>'),fingerprint('<h1>Balance   changes</h1>'))
        self.assertNotEqual(fingerprint('<h1>Damage 100</h1>'),fingerprint('<h1>Damage 200</h1>'))

if __name__=='__main__': unittest.main()
