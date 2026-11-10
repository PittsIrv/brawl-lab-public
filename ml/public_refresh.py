"""Fail-closed public refresh. Secrets stay in the runner; only aggregate exports ship.

The reviewed regime baseline is deliberately not inferred from dataset labels.
Only current-patch, current-season matches in a bounded recent window are used.
"""
import argparse, datetime as dt, hashlib, json, os, re, subprocess, sys
from html.parser import HTMLParser
from pathlib import Path
import requests
import pyarrow.parquet as pq

class RefreshBlocked(ValueError):
    """Expected upstream condition: publish status without renewing predictions."""

class MainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.inside=False; self.hidden=0; self.parts=[]; self.links=[]
    def handle_starttag(self, tag, attrs):
        if tag=='main': self.inside=True
        if tag in ('script','style'): self.hidden+=1
        href=dict(attrs).get('href','')
        if self.inside and tag=='a' and re.search(r'(release-notes|balance-changes|maintenance)',href):
            self.links.append('https://supercell.com'+href if href.startswith('/') else href)
    def handle_endtag(self, tag):
        if tag=='main': self.inside=False
        if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if self.inside and not self.hidden:self.parts.append(data)

def article_fingerprint(html):
    p=MainText();p.feed(html)
    if not p.parts: raise RefreshBlocked('Official release notes could not be parsed; patch verification needs review.')
    return hashlib.sha256(' '.join(' '.join(p.parts).split()).encode()).hexdigest()

def release_links(html):
    p=MainText();p.feed(html)
    if not p.links: raise RefreshBlocked('Official update index could not be parsed; patch verification needs review.')
    return sorted(set(p.links))

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
    if not dt.timedelta(0)<=now-last<=dt.timedelta(days=7):
        raise RefreshBlocked('Source match data is more than seven days old or future-dated; waiting for fresh current-patch matches.')
    end=last.replace(hour=0,minute=0,second=0,microsecond=0)
    fmt=lambda d:d.strftime('%Y%m%dT%H%M%S.000Z')
    if fmt(end)>regime['end']: raise RefreshBlocked('Source extends beyond the verified Ranked regime.')
    regime=dict(regime,start=max(regime['start'],fmt(end-dt.timedelta(days=21))))
    # Prefer full-day holdouts. Early in a patch, two complete days support
    # fixed 10-hour validation and 12-hour test windows with two-hour gaps.
    if fmt(end-dt.timedelta(days=4))>=regime['start']:
        train_end=end-dt.timedelta(days=2,hours=2)
        val_start=end-dt.timedelta(days=2);val_end=end-dt.timedelta(days=1,hours=2)
        test_start=end-dt.timedelta(days=1)
    elif fmt(end-dt.timedelta(days=2))>=regime['start']:
        train_end=end-dt.timedelta(days=1,hours=2)
        val_start=end-dt.timedelta(days=1);val_end=end-dt.timedelta(hours=14)
        test_start=end-dt.timedelta(hours=12)
    else:
        raise RefreshBlocked('Waiting for two complete current-patch days for separate training, validation and test windows.')
    return dict(regime,end=fmt(end),trainEnd=fmt(train_end),validationStart=fmt(val_start),validationEnd=fmt(val_end),testStart=fmt(test_start),verifiedAt=now.isoformat(),sourceLatestMatch=latest)


def probe_api(regime, status):
    token=os.environ['BRAWL_STARS_API_TOKEN']; tag=os.environ['BRAWL_SEASON_PROBE_TAG'].strip().lstrip('#')
    if not re.fullmatch('[A-Z0-9]+',tag): raise RefreshBlocked('Invalid server-side season probe configuration.')
    base='https://bsproxy.royaleapi.dev/v1/players/%23'+tag
    try:
        profile=get(base,headers={'Authorization':'Bearer '+token}).json()
        # Publish field availability only: no response values, tags, names or URLs.
        try:
            items=get(base+'/battlelog',headers={'Authorization':'Bearer '+token}).json().get('items',[])
            ranked=[x.get('battle',{}) for x in items if x.get('battle',{}).get('type') in ('soloRanked','teamRanked','ranked')]
            keys=set()
            def walk(value):
                if isinstance(value,dict):
                    for k,v in value.items():
                        if k.lower() in ('bans','picks','pickorder','draft','draftorder','banorder'): keys.add(k.lower())
                        walk(v)
                elif isinstance(value,list):
                    for v in value: walk(v)
            for battle in ranked:walk(battle)
            status['apiProbe']={'status':'checked','rankedRecords':len(ranked),'draftFields':sorted(keys)}
        except Exception:
            status['apiProbe']={'status':'unavailable','rankedRecords':0,'draftFields':[]}
    except Exception:
        raise RefreshBlocked('Official Ranked-season verification failed; server-side API access needs attention.') from None
    finally:
        os.environ.pop('BRAWL_STARS_API_TOKEN',None);os.environ.pop('BRAWL_SEASON_PROBE_TAG',None)
    status['officialRankedSeasonId']=profile.get('rankedSeasonId')
    if profile.get('rankedSeasonId')!=regime['rankedSeasonId']:
        raise RefreshBlocked('The official Ranked season changed; its date boundary must be verified before training.')

def refresh(root, baseline, status):
    regime=baseline['regime']
    probe_api(regime,status)
    print(json.dumps({'officialRankedSeasonId':status['officialRankedSeasonId'],'apiProbe':status['apiProbe']}),flush=True)
    news=baseline['officialNews']
    if release_links(get(news['url']).content.decode('utf-8'))!=news['releaseLinks']:
        raise RefreshBlocked('New official gameplay update detected; review the patch boundary before training.')
    for url,expected in baseline['officialArticles'].items():
        if article_fingerprint(get(url).content.decode('utf-8'))!=expected:
            raise RefreshBlocked('Official patch notes changed; review the patch boundary before training.')
    status['patchVerified']=True
    roster=get('https://api.brawlapi.com/v1/brawlers').json()['list']
    saved=json.loads(Path('lib/data/brawlers.json').read_text())
    if sorted(x['id'] for x in roster)!=sorted(x['id'] for x in saved):
        raise RefreshBlocked('Brawler roster changed; catalog validation is required before training.')
    meta=get('https://huggingface.co/api/datasets/EliF77/brawlstars-ranked').json(); revision=meta['sha']
    status['sourceRevision']=revision
    # A cheap early coverage check avoids downloading an unchanged stale parquet daily.
    metadata=get(f'https://huggingface.co/datasets/EliF77/brawlstars-ranked/resolve/{revision}/metadata.json').json()
    if metadata.get('season',{}).get('season_label')==regime['sourcePartition']:
        latest=metadata['season']['end_time'];status['sourceLatestMatch']=latest
        splits(regime,latest,dt.datetime.now(dt.timezone.utc))
    file=f"data/season={regime['sourcePartition']}/data.parquet"
    response=get(f'https://huggingface.co/datasets/EliF77/brawlstars-ranked/resolve/{revision}/{file}',stream=True)
    sha=hashlib.sha256(); size=0
    with (root/regime['localFile']).open('wb') as f:
        for chunk in response.iter_content(1048576):
            size+=len(chunk)
            if size>1500000000: raise RefreshBlocked('Dataset exceeds the reviewed download size limit.')
            sha.update(chunk);f.write(chunk)
    pf=pq.ParquetFile(root/regime['localFile']);col=pf.schema.names.index('battle_time')
    latest=max(pf.metadata.row_group(i).column(col).statistics.max for i in range(pf.num_row_groups))
    status['sourceLatestMatch']=latest
    regime=splits(regime,latest,dt.datetime.now(dt.timezone.utc))
    (root/'regime.json').write_text(json.dumps(regime))
    (root/'provenance.json').write_text(json.dumps(dict(dataset='EliF77/brawlstars-ranked',revision=revision,file=file,sha256=sha.hexdigest(),bytes=size,license='mit')))
    run(sys.executable,'ml/prepare.py','--data-dir',str(root),'--regime',str(root/'regime.json'),'--skip-time-stats')
    run(sys.executable,'ml/train.py','--data-dir',str(root),'--output',str(root/'candidate.json'))
    candidate=json.loads((root/'candidate.json').read_text())
    if not any(m['status']=='ready' for m in candidate['models'].values()):
        raise RefreshBlocked('No rank has enough current-patch evidence with passing validation yet; waiting for more matches.')
    run('node','scripts/export-public-model.mjs',str(root/'candidate.json'),'public-app/data/snapshot.json')
    for kind in ('combo','counter'):
        run(sys.executable,f'ml/{kind}_stats.py','--data-dir',str(root),'--snapshot','public-app/data/snapshot.json','--output',f'public-app/data/{kind}-stats.json')
    status.update(status='ready',reason='Current-patch models and aggregates passed validation.')

def main():
    p=argparse.ArgumentParser();p.add_argument('--data-dir',required=True);p.add_argument('--baseline',default='ml/public-refresh-baseline.json');a=p.parse_args()
    root=Path(a.data_dir).resolve();root.mkdir(parents=True,exist_ok=True)
    baseline=json.loads(Path(a.baseline).read_text())
    status={'schema':1,'checkedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'status':'blocked',
      'reason':'Refresh has not completed.','patch':baseline['regime']['balancePatchId'],
      'trainingStart':baseline['regime']['start'],'patchVerified':False,
      'sourceLatestMatch':None,'sourceRevision':None,'officialRankedSeasonId':None,
      'apiProbe':{'status':'unavailable','rankedRecords':0,'draftFields':[]}}
    try:
        refresh(root,baseline,status)
    except RefreshBlocked as e:
        status['reason']=str(e)
    # Unexpected failures still fail CI; never mark a partial export ready.
    Path('public-app/data/refresh-status.json').write_text(json.dumps(status,indent=2))
    print(json.dumps(status,indent=2))
    if status['status']=='blocked':print('Status-only release: model probabilities remain unavailable; next daily run retries.')

if __name__=='__main__': main()
