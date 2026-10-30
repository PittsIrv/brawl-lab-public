'use client';
import {useEffect,useMemo,useState} from 'react';
import {ArrowRight,ChevronDown,Flame,GitCompareArrows,Search,Shield,Users,X} from 'lucide-react';
import {TIERS,type Bundle,type ModelState,type Tier} from '@/lib/final-pick';
import type {MapStats} from '@/lib/map-guide';
import {pairGuide,type PairKind,type PairRow} from '@/lib/pair-guide';
import catalog from '@/lib/data/brawlers.json';
import ComboExplorer from './combo-explorer';
import type {ComboStats} from '@/lib/combo-guide';
import CounterExplorer from './counter-explorer';
import type {CounterStats} from '@/lib/counter-guide';
const byId=new Map(catalog.map(b=>[b.id,b]));
const pretty=(s:string)=>s.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
type Brawler=Bundle['brawlers'][number];
function Face({brawler}:{brawler:Brawler}) {return <img src={byId.get(brawler.id)?.imageUrl2} width={48} height={48} alt="" loading="lazy"/>;}
function PairCard({row,kind,brawler,focus,onExplore}:{row:PairRow;kind:PairKind;brawler:Brawler;focus:Brawler;onExplore:()=>void}) {
  const allied=kind==='partners'||kind==='friction',caution=kind==='risks'||kind==='friction';
  return <article className={'pair-quick-card '+(caution?'caution':'')}>
    <div className="pair-quick-match">
      <div className="pair-person"><Face brawler={brawler}/><div><small>{caution?'Reconsider':'Consider picking'}</small><h3>{pretty(brawler.name)}</h3></div></div>
      <span className="pair-link-word">{allied?'WITH':'VS'}</span>
      <div className="pair-person pair-target"><Face brawler={focus}/><div><small>{allied?'Your teammate':'Enemy pick'}</small><strong>{pretty(focus.name)}</strong></div></div>
    </div>
    <p className="pair-quick-signal">{allied?(caution?'Negative pairing signal · check team coverage':'Positive pairing signal · potential partner'):(caution?`Matchup signal favors ${pretty(focus.name)}`:`Matchup signal favors ${pretty(brawler.name)}`)}</p>
    <details className="pair-explain"><summary>Why this pair? <span>Practice tip & evidence</span></summary><div className="pair-practice"><b>Practice idea · role-based</b><p>{row.tip}</p></div><p>{row.mapAppearances.toLocaleString()} individual map appearances for {pretty(brawler.name)} · {row.trainingAppearances.toLocaleString()} in training. These are not pair counts.</p><p>Pair contribution: <b>{row.signal>0?'+':''}{row.signal.toFixed(3)}</b> on the model’s log-odds scale, {allied?'for this allied pair':`from ${pretty(brawler.name)}’s side against ${pretty(focus.name)}`}. This is one term in a larger team model, not a win percentage. This checker shows individual coverage only. No uncertainty interval for this coefficient is available.</p><button className="text-button" onClick={onExplore}>Explore {pretty(brawler.name)} instead <ArrowRight size={13}/></button></details>
  </article>;
}
export default function PairGuide({bundle,state,stats,comboStats,counterStats}:{bundle:Bundle;state:ModelState;stats:MapStats|null;comboStats?:ComboStats;counterStats?:CounterStats}) {
  const [view,setView]=useState<'discover'|'counters'|'check'>(comboStats?'discover':'check');
  const [tier,setTier]=useState<Tier>('Legendary'),[map,setMap]=useState(()=>Math.max(0,bundle.maps.findIndex(m=>m.name==='Shooting Star'))),[anchor,setAnchor]=useState(()=>Math.max(0,bundle.brawlers.findIndex(b=>b.name==='Piper')));
  const [mode,setMode]=useState<'against'|'with'>('against'),[query,setQuery]=useState(''),[hotOnly,setHotOnly]=useState(true),[expanded,setExpanded]=useState(false),[now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
  const guide=useMemo(()=>pairGuide(bundle,state,stats,tier,map,anchor,hotOnly,now),[bundle,state,stats,tier,map,anchor,hotOnly,now]);
  const focus=bundle.brawlers[anchor],allied=mode==='with',positive:PairKind=allied?'partners':'answers',negative:PairKind=allied?'friction':'risks';
  const roster=useMemo(()=>bundle.brawlers.map((b,i)=>({...b,i})).sort((a,b)=>a.name.localeCompare(b.name)),[bundle.brawlers]);
  const search=query.trim().toLowerCase(),choices=search?roster.filter(b=>b.name.toLowerCase().includes(search)):guide.hot.slice(0,6).map(i=>({...bundle.brawlers[i],i}));
  function choose(i:number){setAnchor(i);setQuery('');setExpanded(false);}
  const contextKey=`${tier}-${map}-${anchor}-${mode}-${hotOnly}`;
  const cards=(kind:PairKind,limit:number)=>guide.rows[kind].slice(0,limit).map(row=><PairCard key={`${contextKey}-${row.index}`} row={row} kind={kind} brawler={bundle.brawlers[row.index]} focus={focus} onExplore={()=>choose(row.index)}/>);
  return <div className="pair-guide pair-workspace">
    <div className="pair-page-heading"><div><span className="eyebrow mint">QUICK MATCHUP CHECK</span><h1>Counters & combos</h1><p>Who works against them? Who works with them?</p></div><div className="pair-context-controls"><label>Rank<select value={tier} onChange={e=>{setTier(e.target.value as Tier);setExpanded(false);}}>{TIERS.map(t=><option key={t}>{t}</option>)}</select></label>{view==='check'&&<label>Map & mode<select value={map} onChange={e=>{setMap(Number(e.target.value));setExpanded(false);}}>{bundle.maps.map((m,i)=><option key={i} value={i}>{m.name} · {pretty(m.mode)}</option>)}</select></label>}</div></div>
    {(comboStats||counterStats)&&<div className="combo-navigation" role="group" aria-label="Matchup workspace">{comboStats&&<button aria-pressed={view==='discover'} onClick={()=>setView('discover')}>Discover combos</button>}{counterStats&&stats&&<button aria-pressed={view==='counters'} onClick={()=>setView('counters')}>Discover counters</button>}<button aria-pressed={view==='check'} onClick={()=>setView('check')}>Check a matchup</button></div>}
    {view==='counters'&&counterStats&&stats?<CounterExplorer bundle={bundle} state={state} data={counterStats} stats={stats} tier={tier} now={now} onExplore={(b,m)=>{setAnchor(b);setMap(m);setMode('against');setHotOnly(false);setQuery('');setExpanded(false);setView('check');}}/>:view==='discover'&&comboStats?<ComboExplorer bundle={bundle} state={state} data={comboStats} tier={tier} now={now} onExplore={(b,m)=>{setAnchor(b);setMap(m);setMode('with');setHotOnly(false);setExpanded(false);setView('check');}}/>:<>
    <div className="pair-intent" role="group" aria-label="Check counters or combos"><button aria-pressed={!allied} onClick={()=>{setMode('against');setExpanded(false);}}><GitCompareArrows size={21}/><span><b>Against · counters</b><small>They picked this brawler</small></span></button><button aria-pressed={allied} onClick={()=>{setMode('with');setExpanded(false);}}><Users size={21}/><span><b>With · combos</b><small>My teammate picked this brawler</small></span></button></div>
    <div className="pair-browser">
      <section className="panel pair-selector" aria-label="Choose a brawler">
        <span className="eyebrow">{allied?'YOUR TEAMMATE':'ENEMY PICK'}</span><div className={'pair-selected '+mode}><Face brawler={focus}/><div><h2>{pretty(focus.name)}</h2><p>{allied?'Find a partner for them':'Find an answer to them'}</p></div></div>
        <label className="pair-search"><Search size={16}/><input type="search" aria-label="Search counter and combo brawlers" placeholder="Search any brawler…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Clear brawler search" onClick={()=>setQuery('')}><X size={15}/></button>}</label>
        <div className="pair-choice-label">{search?<span>{choices.length} matching brawlers</span>:<><Flame size={14}/><span>Popular on this map</span></>}</div>
        <div className="pair-choices">{choices.slice(0,18).map(b=><button key={b.id} aria-pressed={anchor===b.i} aria-label={`Select ${pretty(b.name)}`} onClick={()=>choose(b.i)}><Face brawler={b}/><span>{pretty(b.name)}</span></button>)}</div>
        {search&&!choices.length&&<p className="pair-search-empty" role="status">No matching brawler. Try another name.</p>}{choices.length>18&&<p className="mg-footnote">Showing 18 matches. Keep typing to narrow your search.</p>}{!search&&!choices.length&&<p className="mg-footnote">No current hot picks. Search the roster above.</p>}
        <p className="pair-selector-note">Popular means most observed, not strongest. Search to select any brawler.</p>
      </section>
      <section className="pair-results" aria-label={allied?'Combo suggestions':'Counter suggestions'}>
        <div className="pair-results-heading"><div><span className="eyebrow mint">{allied?'SAME TEAM':'OPPOSITE TEAMS'}</span><h2>{allied?'Pair with':'Play against'} {pretty(focus.name)}</h2></div><label className="pair-hot-toggle"><input type="checkbox" checked={hotOnly} onChange={e=>{setHotOnly(e.target.checked);setExpanded(false);}}/> Popular picks only</label></div>
        <p className="pair-context-line">{tier} · {bundle.maps[map].name} · {pretty(bundle.maps[map].mode)}</p>
        <p className="pair-honesty"><Shield size={14}/><span>Learned candidates, not proven {allied?'combos':'counters'}. Pair signals span maps in this rank; this map filters individual coverage.</span></p>
        {guide.unavailable?<div className="panel mg-empty" role="status"><h3>Pair signals are unavailable</h3><p>{guide.unavailable}</p><p>General practice: compare range and cover, track defensive abilities, time your partner’s follow-up, and leave the third pick room to cover a weakness.</p></div>:<>
          <div className="pair-quick-list">{cards(positive,expanded?Infinity:3)}</div>
          {!guide.rows[positive].length&&<div className="panel pair-no-results"><h3>No qualifying {allied?'partner':'counter'} signal</h3><p>{hotOnly?'Try including all brawlers, or choose another map.':'Try another brawler or map. A blank list does not mean no useful pair exists.'}</p>{hotOnly&&<button className="text-button" onClick={()=>setHotOnly(false)}>Include all brawlers <ArrowRight size={14}/></button>}</div>}
          {guide.rows[positive].length>3&&<button className="pair-show-more" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show top 3':`Show all ${guide.rows[positive].length} candidates`} <ChevronDown size={15}/></button>}
          <details className="pair-cautions" key={contextKey}><summary><Shield size={16}/><span>{allied?'Pairings to reconsider':'Risky picks against '+pretty(focus.name)}</span><small>{guide.rows[negative].length}</small></summary><p>Negative {allied?'same-team':'opposing-team'} signals, not a ban on playing these brawlers. Check the full draft.</p>{cards(negative,Infinity)}{!guide.rows[negative].length&&<p>No qualifying negative pair signals in this selection.</p>}</details>
        </>}
      </section>
    </div>
    <details className="panel mg-method"><summary>How to use these suggestions & read the evidence</summary><p>Counter candidates appear on the opposite team from your selected brawler. Combos appear on the same team. Lists rank the strength of the relevant pair coefficient, not the full picker’s preference or a causal win improvement.</p><p>Use a candidate only when its range, cover and defensive tools fit the map. A favorable team-level association does not promise a won lane. The other four picks, terrain, skill and loadouts can reverse the result.</p><p>Open “Why this pair?” for a general role-based practice idea and the model term. Tips are hypotheses, not explanations proven by the model. This checker does not show pair win rates or counts. Discover combos and Discover counters separately provide same-team and opposing-team counts for qualifying pairs; neither view has uncertainty intervals for the model coefficients.</p><p>Shown terms must exceed 0.01 in magnitude and both brawlers need at least 100 tier training appearances, 20 map training appearances and 50 descriptive map appearances. These gates screen individual coverage, not pair reliability. “Popular picks only” restricts candidates to the top 12 sufficiently sampled brawlers on this map.</p><p>Model {bundle.version} · Ranked season {bundle.regime.rankedSeasonId} · patch {bundle.regime.balancePatchId}. Rank is the lobby’s median observed rank band. Stale or blocked snapshots suppress learned pairs; unsupported tiers never borrow another rank’s model.</p></details></>}
  </div>;
}
