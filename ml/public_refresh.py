"""Fail-closed public refresh. Secrets stay in the runner; only aggregate exports ship.

The reviewed regime baseline is deliberately not inferred from dataset labels.
Changed official pages/season/roster require a reviewed baseline and new splits.
"""
import argparse, datetime as dt, hashlib, json, os, re, subprocess, sys
from html.parser import HTMLParser
from pathlib import Path
import requests
import pyarrow.parquet as pq

class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(); self.hidden=0; self.parts=[]
    def handle_starttag(self, tag, attrs):
        if tag in ('script','style'): self.hidden+=1
    def handle_endtag(self, tag):
        if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)

def fingerprint(html):
    p=VisibleText(); p.feed(html)
    return hashlib.sha256(' '.join(' '.join(p.parts).split()).encode()).hexdigest()

def get(url, **kwargs):
    r=requests.get(url,timeout=180,**kwargs); r.raise_for_status(); return r

def run(*args):
    subprocess.run(args,check=True)

def splits(regime, latest, now):
    last=dt.datetime.strptime(latest,'%Y%m%dT%H%M%S.%fZ').replace(tzinfo=dt.timezone.utc)
    if not dt.timedelta(0)<=now-last<=dt.timedelta(hours=72):
        raise ValueError('Source data is stale or future-dated; estimates must not be renewed.')
    end=last.replace(hour=0,minute=0,second=0,microsecond=0)
    fmt=lambda d:d.strftime('%Y%m%dT%H%M%S.000Z')
    if fmt(end)>regime['end']: raise ValueError('Source extends beyond the verified Ranked regime.')
    train_end=end-dt.timedelta(days=2,hours=2)
    if fmt(train_end-dt.timedelta(days=1))<=regime['start']: raise ValueError('Insufficient days in the verified regime.')
    return dict(regime,end=fmt(end),trainEnd=fmt(train_end),validationStart=fmt(end-dt.timedelta(days=2)),validationEnd=fmt(end-dt.timedelta(days=1,hours=2)),testStart=fmt(end-dt.timedelta(days=1)),verifiedAt=now.isoformat())

def main():
    p=argparse.ArgumentParser();p.add_argument('--data-dir',required=True);p.add_argument('--baseline',default='ml/public-refresh-baseline.json');a=p.parse_args()
    root=Path(a.data_dir).resolve(); root.mkdir(parents=True,exist_ok=True)
    baseline=json.loads(Path(a.baseline).read_text()); regime=baseline['regime']
    # Fetch before download/training, and never print authentication or player responses.
    for url,expected in baseline['officialPages'].items():
        if fingerprint(get(url).content.decode('utf-8'))!=expected: raise ValueError('Official news or release notes changed. Review patch and season before refreshing.')
    token=os.environ['BRAWL_STARS_API_TOKEN']; tag=os.environ['BRAWL_SEASON_PROBE_TAG'].strip().lstrip('#')
    if not re.fullmatch('[A-Z0-9]+',tag): raise ValueError('Invalid season probe tag')
    try:
        profile=get('https://bsproxy.royaleapi.dev/v1/players/%23'+tag,headers={'Authorization':'Bearer '+token}).json()
    except Exception:
        raise RuntimeError('Official Ranked-season verification failed; check the server-side API secret and proxy access.') from None
    os.environ.pop('BRAWL_STARS_API_TOKEN',None); os.environ.pop('BRAWL_SEASON_PROBE_TAG',None)
    if profile.get('rankedSeasonId')!=regime['rankedSeasonId']: raise ValueError('Official Ranked season changed. Review the regime before refreshing.')
    roster=get('https://api.brawlapi.com/v1/brawlers').json()['list']
    saved=json.loads(Path('lib/data/brawlers.json').read_text())
    if sorted(x['id'] for x in roster)!=sorted(x['id'] for x in saved): raise ValueError('Brawler roster changed; update and validate the catalog first.')
    meta=get('https://huggingface.co/api/datasets/EliF77/brawlstars-ranked').json(); revision=meta['sha']
    file=f"data/season={regime['sourcePartition']}/data.parquet"
    response=get(f'https://huggingface.co/datasets/EliF77/brawlstars-ranked/resolve/{revision}/{file}',stream=True)
    sha=hashlib.sha256(); size=0
    with (root/regime['localFile']).open('wb') as f:
        for chunk in response.iter_content(1048576):
            size+=len(chunk)
            if size>1500000000: raise ValueError('Dataset exceeds reviewed size bound.')
            sha.update(chunk); f.write(chunk)
    pf=pq.ParquetFile(root/regime['localFile']); col=pf.schema.names.index('battle_time')
    latest=max(pf.metadata.row_group(i).column(col).statistics.max for i in range(pf.num_row_groups))
    regime=splits(regime,latest,dt.datetime.now(dt.timezone.utc))
    (root/'regime.json').write_text(json.dumps(regime))
    (root/'provenance.json').write_text(json.dumps(dict(dataset='EliF77/brawlstars-ranked',revision=revision,file=file,sha256=sha.hexdigest(),bytes=size,license='mit')))
    run(sys.executable,'ml/prepare.py','--data-dir',str(root),'--regime',str(root/'regime.json'))
    run(sys.executable,'ml/train.py','--data-dir',str(root),'--output',str(root/'candidate.json'))
    run('node','scripts/export-public-model.mjs',str(root/'candidate.json'),'public-app/data/snapshot.json')
    for kind in ('combo','counter'):
        run(sys.executable,f'ml/{kind}_stats.py','--data-dir',str(root),'--snapshot','public-app/data/snapshot.json','--output',f'public-app/data/{kind}-stats.json')
    print('Validated aggregate candidate exported. Run scripts/release-public.mjs --deploy to test, audit and publish.')

if __name__=='__main__': main()
