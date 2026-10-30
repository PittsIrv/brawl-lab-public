'use client';

import {useEffect, useMemo, useState} from 'react';
import {ArrowRight, Ban, BookOpen, Crosshair, Info, Shield, Target, TrendingUp} from 'lucide-react';
import {type Match} from '@/lib/analysis';
import {RANK_TIERS, tierForRank, type RankTier} from '@/lib/ranks';
import {apiTime, personalMapRows, populationRows, POPULATION_MIN, PERSONAL_MIN, type MapGuideData} from '@/lib/map-guide';
import {objectives, roleAdvice} from '@/lib/coaching';
import {mapBanShortlist} from '@/lib/ban-guide';
import {quietPicks} from '@/lib/quiet-picks';
import catalog from '@/lib/data/brawlers.json';

type Profile = {rankedRank?: number; brawlers?: {id: number; power: number}[]} | null;
type Props = {matches: Match[]; profile: Profile; tag: string; demo: boolean; onDraft: () => void; publicOnly?: boolean; loadData?: () => Promise<MapGuideData>};
const pretty = (s: string) => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const percent = (n: number | null) => n === null ? '—' : `${n.toFixed(1)}%`;
const count = (n: number) => n.toLocaleString();
const byId = new Map(catalog.map(b => [b.id, b]));
const canUseRoster = (profile: Profile) => !!profile?.brawlers?.length;
const date = (s: string) => new Date(apiTime(s)).toLocaleDateString(undefined, {timeZone: 'UTC'});

export default function MapGuide({matches, profile, tag, demo, onDraft, publicOnly = false, loadData}: Props) {
  const [data, setData] = useState<MapGuideData | null>(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<RankTier | null>(null);
  const tier = selection ?? tierForRank(profile?.rankedRank) ?? 'Legendary';
  const [map, setMap] = useState(0);
  const [mode, setMode] = useState('All modes');
  const [view, setView] = useState<'population' | 'personal'>('population');
  const [owned, setOwned] = useState(false);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [kept, setKept] = useState<{context: string; ids: number[]}>({context: '', ids: []});
  const banContext = `${data?.version}:${tier}:${map}`;
  const keepAvailable = kept.context === banContext ? kept.ids : [];

  useEffect(() => {
    const controller = new AbortController();
    (loadData ? loadData().then(data => ({ok: true, json: async () => data})) : fetch('/api/map-guide', {signal: controller.signal, cache: 'no-store'}))
      .then(async response => {
        const result = await response.json() as MapGuideData & {error?: string};
        if (!response.ok) throw new Error(result.error || 'Could not load the map guide.');
        if (!controller.signal.aborted) {
          setData(result);
          setMap(Math.max(0, result.maps.findIndex(m => m.name === 'Shooting Star')));
        }
      }).catch(e => {if (!controller.signal.aborted) setError(e.message);});
    return () => controller.abort();
  }, [refresh, loadData]);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  const population = useMemo(() => data?.population ? populationRows(data.population, tier, map) : [], [data, tier, map]);
  const personal = useMemo(() => data?.population && data.maps[map]
    ? personalMapRows(matches, tier, data.maps[map], data.population) : null, [matches, tier, map, data]);
  const available = useMemo(() => new Set(profile?.brawlers?.filter(b => b.power === 11).map(b => b.id) ?? []), [profile]);

  if (!data) return <section className="panel mg-loading" role="status">{error || 'Loading rank-specific map results…'}</section>;
  const selected = data.maps[map], stats = data.population;
  if (!selected) return <section className="panel">No maps are available in this release.</section>;
  const stale = data.stale || (now >= data.freshUntil ? 'This snapshot needs a new freshness check. Reload the guide.' : '');
  const current = !stale && !data.unavailable;
  const tierSets = stats?.tiers[tier]?.sets ?? 0;
  const mapSets = stats?.tiers[tier]?.maps[map]?.sets ?? 0;
  const allowed = (id: number) => !owned || !profile?.brawlers?.length || available.has(id);
  const supported = population.filter(r => r.supported && allowed(r.id));
  const personalSupported = personal?.rows.filter(r => r.supported && allowed(r.id)) ?? [];
  const comfort = personalSupported[0];
  const review = [...personalSupported].sort((a, b) => a.score - b.score)[0];
  const best = supported[0];
  const quiet = quietPicks(data, tier, map, now, owned && canUseRoster(profile) ? available : undefined);
  const bans = mapBanShortlist(data, tier, map, now, keepAvailable);
  const name = (id: number) => pretty(byId.get(id)?.name ?? data.brawlers.find(b => b.id === id)?.name ?? 'Unknown brawler');
  const visiblePopulation = supported.filter(r => name(r.id).toLowerCase().includes(search.toLowerCase()));
  const visiblePersonal = (personal?.rows ?? []).filter(r => allowed(r.id) && name(r.id).toLowerCase().includes(search.toLowerCase()));
  const rows = view === 'population' ? visiblePopulation : visiblePersonal;
  const chooseMap = (index: number) => {setMap(index); setShowAll(false); setSearch('');};
  const canFilter = !!profile?.brawlers?.length;

  return <div className="map-guide">
    <section className="panel mg-hero">
      <div><span className="eyebrow mint"><BookOpen size={15}/> YOUR MAP PLAYBOOK</span>
        <h2>Know your picks before the draft.</h2>
        <p>Choose a rank and map. See which brawlers win more in the collected sample, {publicOnly ? 'build a shortlist before you play.' : 'then compare your own experience.'} No team entry needed.</p></div>
      <div className="mg-season"><Shield size={23}/><span>Ranked season <b>{data.regime.rankedSeasonId}</b><small>Patch {data.regime.balancePatchId}</small></span></div>
    </section>
    <section className="panel mg-controls">
      <label>Rank to explore<select aria-label="Map guide rank" value={tier} onChange={e => {setSelection(e.target.value as RankTier); setShowAll(false);}}>{RANK_TIERS.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Mode<select aria-label="Map guide mode" value={mode} onChange={e => {const value = e.target.value; setMode(value); if (value !== 'All modes' && selected.mode !== value) chooseMap(data.maps.findIndex(m => m.mode === value));}}><option>All modes</option>{[...new Set(data.maps.map(m => m.mode))].map(m => <option key={m} value={m}>{pretty(m)}</option>)}</select></label>
      <label>Map<select aria-label="Map guide map" value={map} onChange={e => chooseMap(Number(e.target.value))}>{data.maps.map((m, index) => ({...m, index})).filter(m => mode === 'All modes' || m.mode === mode).map(m => <option value={m.index} key={`${m.mode}-${m.name}`}>{m.name} · {pretty(m.mode)}</option>)}</select></label>
      {!publicOnly && <label className="mg-roster"><input type="checkbox" checked={owned && canFilter} disabled={!canFilter} onChange={e => {setOwned(e.target.checked); setShowAll(false);}}/>My power-11 roster only</label>}
    </section>
    {(stale || data.unavailable) && <div className="notice" role="status"><Info size={19}/><span><b>Current population suggestions paused.</b> {stale || data.unavailable} {!publicOnly && 'Personal results below are historical observations for the displayed regime.'}</span><button className="secondary" onClick={() => {setData(null); setError(''); setMode('All modes'); setNow(Date.now()); setRefresh(value => value + 1);}}>Reload guide</button></div>}
    {stats && <div className="mg-context"><span><b>{tier}</b> · {selected.name} · {pretty(selected.mode)}</span><span>{count(mapSets)} sampled sets on this map · data {date(stats.dataFrom)}–{date(stats.dataThrough)} UTC</span></div>}
    <section className="panel quiet-picks" aria-labelledby="quiet-picks-heading" aria-live="polite">
      <span className="eyebrow mint"><TrendingUp size={15}/> STRONG RESULTS · LESS OF THE SPOTLIGHT</span><h2 id="quiet-picks-heading">Not sure what to pick on {selected.name}?</h2><p>Try a less-popular map performer in {tier}. These picks sit outside this map’s top 12 by appearances and show up in under 10% of sampled sets.</p>
      {quiet.length?<div className="quiet-grid">{quiet.map(row=><article className="quiet-card" key={row.id}><div className="mg-brawler"><img src={byId.get(row.id)?.imageUrl2} width={52} height={52} alt="" loading="lazy"/><div><small>IF YOU’RE UNSURE, TRY</small><h3>{name(row.id)}</h3></div></div><p>On {selected.name}, try <b>{name(row.id)}</b> if you need a starting point and its {byId.get(row.id)?.class.name.toLowerCase() ?? 'brawler'} role fits your team.</p><div className="quiet-numbers"><strong>{percent(row.rate)}<small>observed set wins</small></strong><strong>{percent(row.appearanceRate)}<small>of sampled sets</small></strong></div><p className="quiet-tip">{roleAdvice[byId.get(row.id)?.class.name??'']||'Use your effective range and preserve an escape route.'}</p><details><summary>Why suggest this pick?</summary><p>{row.wins}W–{row.losses}L across {count(row.n)} appearances. Descriptive 95% interval: {row.low.toFixed(1)}–{row.high.toFixed(1)}%. Ranked by the lower bound, with at least 100 appearances and an interval above 50%.</p><p>This is an observed map result, not your draft’s win probability. Specialist players and favorable matchups can lift the rate. Check enemy counters, your team’s missing role and your familiarity before locking in. The practice tip is role-based.</p></details></article>)}</div>:<p className="mg-empty">{!current?stale||data.unavailable:`No less-popular pick clears the evidence threshold here in ${tier}. Check the broader map shortlist below; we won’t promote a tiny-sample win streak.`}</p>}
    </section>
    <section className="panel mg-bans" aria-labelledby="map-ban-heading" aria-live="polite">
      <span className="eyebrow coral"><Ban size={15}/> INFERRED BAN PRIORITY</span>
      <h2 id="map-ban-heading">Who to consider banning on {selected.name}</h2>
      <p>Frequent, successful brawlers in {tier}. No draft entry needed. These are map threats to discuss with your team, not measured gains from banning.</p>
      {bans.length ? <div className="mg-ban-grid">{bans.map((row, index) => <article className="mg-ban-card" key={row.id}>
        <div className="mg-brawler">{byId.get(row.id)?.imageUrl2 && <img src={byId.get(row.id)!.imageUrl2} alt="" width={42} height={42}/>}<div><small>CONSIDER #{index + 1}</small><h3>{name(row.id)}</h3></div></div>
        <strong>{percent(row.rate)} <small>observed set wins</small></strong>
        <p>Appeared in {percent(row.appearanceRate)} of sampled sets · {count(row.n)} appearances.</p>
        <p className="mg-ban-evidence">95% interval {row.low.toFixed(1)}–{row.high.toFixed(1)}%. Prioritized for both frequency and supported above-50% results.</p>
        <button className="secondary" onClick={() => setKept({context: banContext, ids: [...keepAvailable, row.id]})} aria-label={`Keep ${name(row.id)} available`}>Keep available for our team</button>
      </article>)}</div> : <p className="mg-empty">{!current ? stale || data.unavailable : keepAvailable.length ? 'No more supported candidates after your exclusions. Remove an exclusion to reconsider it.' : `No supported ban shortlist for ${tier} here. A candidate needs at least ${POPULATION_MIN} appearances and a 95% interval entirely above 50%. We do not substitute another rank.`}</p>}
      {keepAvailable.length > 0 && <div className="mg-kept"><span>Keeping available:</span>{keepAvailable.map(id => <button key={id} onClick={() => setKept({context: banContext, ids: keepAvailable.filter(value => value !== id)})} aria-label={`Reconsider banning ${name(id)}`}>{name(id)} ×</button>)}</div>}
      <p className="mg-footnote">A ban removes an option for both teams. Keep a planned team pick available, especially when your team picks first. Your roster filter does not hide opposing threats. Battle logs lack bans and pick order; appearance share is not a ban rate. This shortlist cannot estimate how a ban changes the draft or your win probability.</p>
    </section>
    <div className="mg-insights">
      <section className="panel mg-pick-card"><span className="eyebrow mint"><TrendingUp size={16}/> POPULATION STARTING POINT</span>
        <h3>{current && best ? name(best.id) : 'More evidence needed'}</h3>
        <p>{current && best ? `${percent(best.rate)} observed set wins across ${count(best.n)} appearances in ${tier} on ${selected.name}. A candidate to learn, subject to the draft.` : stale || data.unavailable || `No brawler has ${POPULATION_MIN} sampled appearances here in ${tier}. We do not borrow another rank’s results.`}</p>
        {current && best && <span className="mg-evidence">95% interval {best.low.toFixed(0)}–{best.high.toFixed(0)}% · observational</span>}
      </section>
      {!publicOnly && <section className="panel mg-pick-card"><span className="eyebrow mint"><Shield size={16}/> {demo ? 'SAMPLE COMFORT PICK' : 'YOUR COMFORT CANDIDATE'}</span>
        <h3>{comfort ? name(comfort.id) : 'Build your map history'}</h3>
        <p>{comfort ? `${comfort.wins}W–${comfort.losses}L (${percent(comfort.rate)}) in your ${tier} records here. Your most promising supported result on this map; it is not proof of matchup strength.` : `Collect ${PERSONAL_MIN} decisive records with a brawler on this map at ${tier}. Records with unknown historical rank are kept out.`}</p>
        {comfort && <span className="mg-evidence">{comfort.n} records · 95% interval {comfort.low.toFixed(0)}–{comfort.high.toFixed(0)}%</span>}
      </section>}
      <section className="panel mg-pick-card"><span className="eyebrow"><Target size={16}/> A FOCUSED PRACTICE STEP</span>
        <h3>{review && review.rate !== null && review.rate < 50 ? `Review ${name(review.id)}` : 'Learn one map, then compare'}</h3>
        <p>{review && review.rate !== null && review.rate < 50 ? `${review.losses} losses in ${review.n} ${tier} records here. Review three replays for avoidable deaths or missed objectives, then test one change. Map fit and teammates may also explain the result.` : publicOnly ? `Practice a small pool for ${pretty(selected.mode)}. Review how you win space and survive against the opposing roles; compare the map sample before drafting.` : `Pick a small pool for ${pretty(selected.mode)}, sync after play, and compare results within the same rank and map. A rank change starts a separate comparison.`}</p>
      </section>
    </div>
    <section className="panel mg-results" aria-live="polite">
      <div className="section-head"><div><h2>{view === 'population' ? `What wins here in ${tier}?` : `Your ${tier} results on this map`}</h2><p>{view === 'population' ? 'Observed completed-set outcomes, ordered by win rate adjusted toward 50% for small samples.' : `${demo ? 'Synthetic sample' : tag} · recorded player rank · API record outcomes, not reconstructed set wins.`}</p></div></div>
      <div className="mg-table-controls"><div className="mg-tabs" role="group" aria-label="Map guide evidence"><button aria-pressed={view === 'population'} onClick={() => {setView('population'); setShowAll(false);}}>Rank population</button>{!publicOnly && <button aria-pressed={view === 'personal'} onClick={() => {setView('personal'); setShowAll(false);}}>My results{demo ? ' · sample' : ''}</button>}</div><input aria-label="Search guide brawlers" placeholder="Filter brawlers (optional)" value={search} onChange={e => {setSearch(e.target.value); setShowAll(false);}}/></div>
      {view === 'population' && !current ? <p className="mg-empty">{stale || data.unavailable}</p> : !rows.length ? <div className="mg-empty"><BookOpen size={27}/><h3>{search ? 'No matching brawlers' : view === 'population' ? 'No supported shortlist for this selection' : 'No rank-matched personal records yet'}</h3><p>{search ? 'Try another name or clear the filter.' : view === 'population' ? `${count(mapSets)} sampled sets here (${count(tierSets)} across the tier). A brawler needs ${POPULATION_MIN} appearances on this map. The dataset covers Mythic+; lower ranks need another source.` : 'Sync your player or import a battle log that includes the historical Ranked index. Your current profile rank is never assigned to older battles.'}</p></div> : <>
        <div className="table-scroll"><table className="mg-table"><thead><tr><th>Brawler</th><th>{view === 'population' ? 'Observed set wins' : 'Your record wins'}</th><th>95% interval</th><th>{view === 'population' ? 'Sample evidence' : 'Your evidence'}</th><th>How to use it</th></tr></thead><tbody>{(showAll ? rows : rows.slice(0, 12)).map(row => <tr key={row.id}><td><span className="mg-brawler">{byId.get(row.id)?.imageUrl2 && <img src={byId.get(row.id)!.imageUrl2} alt="" width={38} height={38}/>}<span><b>{name(row.id)}</b><small>{byId.get(row.id)?.class.name}</small></span></span></td><td><strong className={row.rate !== null && row.rate >= 50 ? 'mint' : 'coral'}>{percent(row.rate)}</strong><small>{row.wins}W · {row.losses}L</small></td><td>{row.low.toFixed(0)}–{row.high.toFixed(0)}%<small>Descriptive interval</small></td><td>{count(row.n)} {view === 'population' ? 'set appearances' : 'decisive records'}{view === 'population' && 'appearanceRate' in row && <small>In {row.appearanceRate.toFixed(1)}% of sampled sets</small>}{view === 'personal' && 'draws' in row && <small>{row.draws} draws excluded · {row.imported} {demo ? 'synthetic' : 'unverified/imported'} records</small>}</td><td><span className="tag">{view === 'population' ? 'MAP SHORTLIST' : !row.supported ? 'EARLY SIGNAL' : row.rate !== null && row.rate < 50 ? 'REVIEW LOSSES' : 'COMFORT CANDIDATE'}</span></td></tr>)}</tbody></table></div>
        {rows.length > 12 && <button className="secondary" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show top 12' : `Show all ${rows.length} brawlers`}</button>}
      </>}
      <p className="mg-footnote">{view === 'population' ? `Minimum ${POPULATION_MIN} appearances per brawler/map/rank; ${population.filter(r => !r.supported).length} low-sample brawlers are excluded. Counts use the retained training, validation and test sample for description only; model fitting is unchanged. Appearance share is not a ban rate or draft-choice rate.` : `${personal?.unknownRank ?? 0} records on this map have unknown rank, ${personal?.otherRank ?? 0} belong to other ranks, and ${personal?.outsideWindow ?? 0} fall outside this patch/season window. All are excluded from this comparison. No automatic historical rank reconstruction.`}</p>
    </section>
    <div className="mg-bottom"><section className="panel mg-tips"><span className="eyebrow mint">PLAY THE OBJECTIVE</span><h3>{pretty(selected.mode)} on {selected.name}</h3><p>{objectives[pretty(selected.mode)] || 'Review the mode objective and practice holding useful space with your team.'}</p>{current && best && <><h4>Practicing {name(best.id)}</h4><p>{roleAdvice[byId.get(best.id)?.class.name ?? ''] || 'Understand your range and keep an escape option.'}</p></>}<small>Role and mode advice is heuristic. Rank-specific evidence comes from the separate outcomes above; the data does not record your positioning or mistakes.</small></section><section className="panel mg-next"><Crosshair size={25}/><h3>Once the draft takes shape</h3><p>A map favorite can still be wrong against a particular team. Use the final-pick evaluator when the other five picks are known.</p><button className="primary" onClick={onDraft}>Open final-pick tool <ArrowRight size={16}/></button></section></div>
    <details className="panel mg-method"><summary>Rank, patch, sample size and what these rates mean</summary><p>Population bands use the median of six observed rank indices, all Mythic or higher, with all six brawlers at power 11. Personal rows use your own rank recorded in that battle, regardless of power level. These are related but different populations; we do not subtract one rate from the other.</p><p>Population rates describe complete first-to-two sets. Personal rates describe API records, which may be separate rounds. Wins divided by wins plus losses; draws are excluded. Sorting uses (wins + 5) / (decisive outcomes + 10). Intervals are approximate Wilson 95% intervals and do not account for repeated players/rounds, selection bias or testing many brawlers.</p><p>Ban priority multiplies the share of sampled sets containing a brawler by its Wilson lower bound above 50%. Candidates need at least 50 appearances and a lower bound above 50%; the top three are shown. This conservative heuristic weighs frequency and results, but is not a learned ban policy or a causal win-probability gain.</p><p>The data is a crawler sample, not all Ranked players. A high rate may reflect skilled specialists, favorable drafts or parties. Personal rank comes only from saved battle data; imported ranks are unverified. The profile’s current rank sets the initial selector, never historical labels.</p><p>All map-guide results use the displayed patch/Ranked-season time window. {stats && <>Window: {date(stats.start)} to {date(stats.end)} (end exclusive). </>}This is not a guarantee of the current map rotation. Old releases remain blocked after expiry or an overdue freshness check.</p><p>Source: <a href="https://huggingface.co/datasets/EliF77/brawlstars-ranked" target="_blank" rel="noreferrer">EliF77/brawlstars-ranked</a>. Official Ranked season {data.regime.rankedSeasonId}; provider partition {data.regime.sourcePartition}; balance patch {data.regime.balancePatchId}. Release {data.version}.</p></details>
  </div>;
}
