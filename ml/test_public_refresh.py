import datetime as dt
import unittest
from public_refresh import fingerprint, splits, article_fingerprint, release_links, RefreshBlocked, probe_api
from unittest.mock import patch
import os

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
        for latest in ('20261022T000000.000Z','20261031T000000.000Z'):
            with self.assertRaises(ValueError): splits(self.regime,latest,self.now)
        with self.assertRaises(ValueError): splits(dict(self.regime,end='20261029T000000.000Z'),'20261030T014920.000Z',self.now)
    def test_content_fingerprint(self):
        self.assertEqual(fingerprint('<h1>Balance changes</h1><script>random()</script>'),fingerprint('<h1>Balance   changes</h1>'))
        self.assertNotEqual(fingerprint('<h1>Damage 100</h1>'),fingerprint('<h1>Damage 200</h1>'))

    def test_current_patch_and_rolling_window(self):
        now=dt.datetime(2026,11,10,12,tzinfo=dt.timezone.utc)
        r=splits({'start':'20261104T000000.000Z','end':'20261119T090000.000Z'},'20261110T014920.000Z',now)
        self.assertEqual(r['start'],'20261104T000000.000Z')
        self.assertGreater(r['trainEnd'],r['start'])
        r=splits({'start':'20260901T000000.000Z','end':'20261119T090000.000Z'},'20261110T014920.000Z',now)
        self.assertEqual(r['start'],'20261020T000000.000Z')
        with self.assertRaises(RefreshBlocked):
            splits({'start':'20261109T000000.000Z','end':'20261119T090000.000Z'},'20261110T014920.000Z',now)

    def test_early_patch_holdouts_remain_separate(self):
        now=dt.datetime(2026,11,10,12,tzinfo=dt.timezone.utc)
        r=splits({'start':'20261104T000000.000Z','end':'20261119T090000.000Z'},'20261106T023530.000Z',now)
        self.assertEqual(r['trainEnd'],'20261104T220000.000Z')
        self.assertEqual(r['validationStart'],'20261105T000000.000Z')
        self.assertEqual(r['validationEnd'],'20261105T100000.000Z')
        self.assertEqual(r['testStart'],'20261105T120000.000Z')
        self.assertLess(r['start'],r['trainEnd'])
        with self.assertRaises(RefreshBlocked):
            splits(r,'20261106T023530.000Z',dt.datetime(2026,11,13,3,tzinfo=dt.timezone.utc))

    def test_news_ignores_promotions_but_detects_gameplay_links(self):
        a='<main><a href="/release-notes-november/">Notes</a><p>Promotion A</p></main>'
        self.assertEqual(release_links(a),release_links(a.replace('Promotion A','Promotion B')))
        self.assertNotEqual(release_links(a),release_links(a.replace('november','december')))
        with self.assertRaises(RefreshBlocked):release_links('<main>broken</main>')

    def test_patch_content_ignores_site_chrome_not_balance_edits(self):
        a='<nav>Old</nav><main><h1>Patch</h1><p>Damage 100</p></main><footer>A</footer>'
        self.assertEqual(article_fingerprint(a),article_fingerprint(a.replace('Old','New').replace('footer>A','footer>B')))
        self.assertNotEqual(article_fingerprint(a),article_fingerprint(a.replace('100','200')))
        with self.assertRaises(RefreshBlocked):article_fingerprint('broken')

    def test_api_probe_exports_availability_only(self):
        from types import SimpleNamespace
        responses=[{'rankedSeasonId':50},{'items':[{'battle':{'type':'soloRanked','bans':[{'tag':'PRIVATE'}],'pickOrder':[1,2],'teams':[]}}]}]
        with patch.dict(os.environ,{'BRAWL_STARS_API_TOKEN':'private-token','BRAWL_SEASON_PROBE_TAG':'TEST123'}),patch('public_refresh.get',side_effect=[SimpleNamespace(json=lambda x=x:x) for x in responses]):
            status={};probe_api({'rankedSeasonId':50},status)
            self.assertEqual(status['apiProbe']['draftFields'],['bans','pickorder'])
            self.assertNotIn('PRIVATE',str(status));self.assertNotIn('private-token',str(status))
            self.assertNotIn('BRAWL_STARS_API_TOKEN',os.environ)

    def test_blocked_refresh_publishes_status_without_touching_model(self):
        import tempfile,json,contextlib,io
        from pathlib import Path
        from public_refresh import main
        with tempfile.TemporaryDirectory() as directory:
            previous=os.getcwd()
            try:
                os.chdir(directory);Path('public-app/data').mkdir(parents=True)
                Path('baseline.json').write_text(json.dumps({'regime':{'balancePatchId':'2026-11-03','start':'20261104T000000.000Z'}}))
                snapshot=Path('public-app/data/snapshot.json');snapshot.write_text('original model timestamps')
                with patch('sys.argv',['refresh','--data-dir','work','--baseline','baseline.json']),patch('public_refresh.refresh',side_effect=RefreshBlocked('Waiting for fresh matches')),contextlib.redirect_stdout(io.StringIO()):main()
                result=json.loads(Path('public-app/data/refresh-status.json').read_text())
                self.assertEqual(result['status'],'blocked');self.assertEqual(result['reason'],'Waiting for fresh matches')
                self.assertEqual(snapshot.read_text(),'original model timestamps')
            finally:os.chdir(previous)

if __name__=='__main__': unittest.main()
