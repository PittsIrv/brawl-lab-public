"""Fetch a pinned public partition and run the saved per-tier pipeline.
Regime is an operator-verified Ranked season + balance patch; never infer IDs from HF labels.
"""
import argparse,json,hashlib,subprocess,sys
from pathlib import Path
import requests
p=argparse.ArgumentParser();p.add_argument('--data-dir',required=True);p.add_argument('--regime',required=True);p.add_argument('--output',required=True);a=p.parse_args();root=Path(a.data_dir);root.mkdir(parents=True,exist_ok=True);regime=json.load(open(a.regime))
meta=requests.get('https://huggingface.co/api/datasets/EliF77/brawlstars-ranked',timeout=60);meta.raise_for_status();revision=meta.json()['sha'];file=f"data/season={regime['sourcePartition']}/data.parquet"
url=f'https://huggingface.co/datasets/EliF77/brawlstars-ranked/resolve/{revision}/{file}'
r=requests.get(url,stream=True,timeout=180);r.raise_for_status();sha=hashlib.sha256();size=0
with open(root/regime['localFile'],'wb') as f:
 for chunk in r.iter_content(1048576):
  size+=len(chunk)
  if size>1500000000:raise RuntimeError('Source exceeds bounded 1.5 GB updater limit; review before proceeding.')
  f.write(chunk);sha.update(chunk)
(root/'provenance.json').write_text(json.dumps({'dataset':'EliF77/brawlstars-ranked','revision':revision,'file':file,'sha256':sha.hexdigest(),'bytes':size,'license':'mit'},indent=2))
subprocess.run([sys.executable,'ml/prepare.py','--data-dir',str(root),'--regime',a.regime],check=True)
subprocess.run([sys.executable,'ml/train.py','--data-dir',str(root),'--output',a.output],check=True)
