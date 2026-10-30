"""Train permutation-invariant, antisymmetric final-team evaluators by Ranked band."""
import argparse,json,itertools,datetime
from pathlib import Path
import numpy as np
from scipy.sparse import coo_matrix
from scipy.optimize import minimize_scalar
from scipy.special import expit
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss,brier_score_loss,roc_auc_score
from map_stats import build_map_stats

p=argparse.ArgumentParser();p.add_argument('--data-dir',required=True);p.add_argument('--output',default='lib/data/final-pick-model.json');a=p.parse_args();root=Path(a.data_dir)
audit=json.load(open(root/'audit.json'));data=np.load(root/'prepared.npz');N=len(audit['brawlers']);M=len(audit['maps']);K=len(audit['modes']);base=N*(1+K+M);D=base+2*N*N

def features(b,mode,mp,interactions=True):
 cols=[];values=[]
 for j in range(6):
  sign=1 if j<3 else -1
  for c in [b[:,j],N+mode*N+b[:,j],N*(1+K)+mp*N+b[:,j]]:cols.append(c);values.append(np.full(len(b),sign))
 if interactions:
  for side,sign in [(0,1),(3,-1)]:
   for i,j in itertools.combinations(range(side,side+3),2):
    cols.append(base+np.minimum(b[:,i],b[:,j])*N+np.maximum(b[:,i],b[:,j]));values.append(np.full(len(b),sign))
  for i in range(3):
   for j in range(3,6):
    cols.append(base+N*N+np.minimum(b[:,i],b[:,j])*N+np.maximum(b[:,i],b[:,j]));values.append(np.where(b[:,i]<b[:,j],1,-1))
 return coo_matrix((np.column_stack(values).ravel().astype(np.float64),(np.repeat(np.arange(len(b)),len(cols)),np.column_stack(cols).ravel())),shape=(len(b),D if interactions else base)).tocsr()

def metrics(y,p):
 bins=[];ece=0
 for lo in np.linspace(0,0.9,10):
  m=(p>=lo)&(p<lo+.10000001)
  if m.sum():
   pred=float(p[m].mean());actual=float(y[m].mean());ece+=m.mean()*abs(pred-actual);bins.append({'n':int(m.sum()),'prediction':round(pred,4),'actual':round(actual,4)})
 return {'logLoss':float(log_loss(y,p,labels=[0,1])),'brier':float(brier_score_loss(y,p)),'auc':float(roc_auc_score(y,p)),'ece':float(ece),'calibrationBins':bins}

models={}
for tier,name in enumerate(['Mythic','Legendary','Masters','Pro']):
 subsets={s:np.flatnonzero(data[s+'_tier']==tier) for s in ['train','validation','test']};counts={s:len(v) for s,v in subsets.items()};print(name,counts,flush=True)
 model={'tier':name,'counts':counts,'status':'insufficient-data'};models[name]=model
 if any(counts[s]<n for s,n in [('train',5000),('validation',1000),('test',1000)]):continue
 xs={s:features(data[s+'_b'][idx].astype(np.int32),data[s+'_mode'][idx].astype(np.int32),data[s+'_map'][idx].astype(np.int32)) for s,idx in subsets.items()};ys={s:data[s+'_y'][idx] for s,idx in subsets.items()}
 best=None
 for c in [.005,.05,.5]:
  est=LogisticRegression(C=c,fit_intercept=False,solver='lbfgs',max_iter=250,tol=1e-6).fit(xs['train'],ys['train'])
  loss=log_loss(ys['validation'],est.predict_proba(xs['validation'])[:,1]);print(name,'C',c,'validation',loss,'iterations',int(est.n_iter_[0]),flush=True)
  if est.n_iter_[0]>=est.max_iter:
   print(name,'C',c,'excluded: optimizer did not converge',flush=True);continue
  if best is None or loss<best[0]:best=(loss,c,est)
 if best is None:
  model['status']='validation-failed';continue
 _,c,est=best
 # Calibrate only on validation, before looking at test; no offset preserves side symmetry.
 logits=est.decision_function(xs['validation']);temp=minimize_scalar(lambda t:log_loss(ys['validation'],expit(logits/t)),bounds=(.5,3),method='bounded').x
 prob=expit(est.decision_function(xs['test'])/temp);m=metrics(ys['test'],prob)
 baseline=LogisticRegression(C=c,fit_intercept=False,solver='lbfgs',max_iter=250,tol=1e-6).fit(xs['train'][:,:base],ys['train'])
 baseline_logits=baseline.decision_function(xs['validation'][:,:base]);bt=minimize_scalar(lambda t:log_loss(ys['validation'],expit(baseline_logits/t)),bounds=(.5,3),method='bounded').x
 bm=metrics(ys['test'],expit(baseline.decision_function(xs['test'][:,:base])/bt))
 # Release gate: adequate counts and better than an uninformative fair coin on future sets.
 status='ready' if m['logLoss']<np.log(2) and m['brier']<.25 and m['ece']<.06 and baseline.n_iter_[0]<baseline.max_iter else 'validation-failed'
 idx=subsets['train'];b=data['train_b'][idx];mp=data['train_map'][idx];support=np.bincount(b.ravel(),minlength=N);map_support=np.zeros((M,N),dtype=int)
 for j in range(6):np.add.at(map_support,(mp,b[:,j]),1)
 model.update(status=status,weights=np.round(est.coef_[0]/temp,8).tolist(),regularization=c,temperature=float(temp),optimizerIterations=int(est.n_iter_[0]),baselineIterations=int(baseline.n_iter_[0]),metrics=m,individualBaseline=bm,support=support.tolist(),mapSupport=map_support.tolist())
 # Regression fixture bridges Python training and browser/server inference.
 first=int(subsets['test'][0]);model['fixture']={'brawlers':data['test_b'][first].tolist(),'map':int(data['test_map'][first]),'mode':int(data['test_mode'][first]),'probability':float(prob[0])}
 print(name,status,'test',m['logLoss'],'Brier',m['brier'],'AUC',m['auc'],'pair vs individual',bm['logLoss']-m['logLoss'],flush=True)
now=datetime.datetime.now(datetime.timezone.utc);bundle={'schema':1,'version':now.strftime('%Y%m%dT%H%M%SZ'),'createdAt':now.isoformat(),'expiresAt':(now+datetime.timedelta(days=3)).isoformat(),'regime':audit['regime'],'provenance':json.load(open(root/'provenance.json')),'brawlers':audit['brawlers'],'maps':audit['maps'],'modes':audit['modes'],'splitRanges':audit['split_ranges'],'auditCounts':audit['counts'],'models':models,'tierDefinition':'Median of the six observed rank indices, with all six Mythic or higher. Mixed-tier lobbies can be included. This is a lobby-band proxy, not six known player skill scores.','limitations':['Observational predictions are not causal win improvements.','Complete first-to-two sets, all six brawlers at power 11.','No bans, pick order, loadouts, player skill or premade-party status in model features.','Chronological evaluation is not player-disjoint.','Population is a crawler sample, not all Ranked players.','Map support is not evidence for the exact six-brawler composition.']}
bundle['mapStats']=build_map_stats(data,audit,bundle['provenance'],bundle['version'])
Path(a.output).write_text(json.dumps(bundle,separators=(',',':')))
(root/'model-report.json').write_text(json.dumps({k:{a:b for a,b in v.items() if a not in ['weights','support','mapSupport','fixture']} for k,v in models.items()},indent=2))
print('Saved',a.output,Path(a.output).stat().st_size,flush=True)
