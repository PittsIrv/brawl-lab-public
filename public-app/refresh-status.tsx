import status from './data/refresh-status.json';
export {status as refreshStatus};
const date=(s:string)=>new Date(s).toLocaleString();
const matchDate=(s:string)=>s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.\d+Z$/, '$1-$2-$3T$4:$5:$6Z');
export default function RefreshStatus(){
 const overdue=Date.now()-Date.parse(status.checkedAt)>36*3600000;
 return <section className="panel" aria-label="Current data status" role="status"><span className="eyebrow mint">CURRENT-PATCH DATA</span><h2>{status.status==='ready'&&!overdue?'Current-patch release':'Waiting for fresh current-patch evidence'}</h2><p>{status.reason}</p>{overdue&&<p><b>The refresh status itself is overdue. Check the cloud run for the latest failure.</b></p>}<p>Reviewed patch: <b>{status.patch}</b> · Matches eligible from <b>{date(matchDate(status.trainingStart))}</b>. Only this patch and the verified Ranked season are eligible, with a maximum 21-day window. Models are fitted from scratch.</p><p>Last refresh attempt: {date(status.checkedAt)}{status.sourceLatestMatch&&<> · Newest source match: {date(matchDate(status.sourceLatestMatch))}</>}</p><p>{status.status==='blocked'?'Old model probabilities, hot picks and learned combos/counters are disabled. General role ideas remain available. ':''}The cloud job retries daily. A new patch needs its date boundary reviewed; a new model also needs enough recent matches and passing validation.</p><a href="https://github.com/PittsIrv/brawl-lab-public/actions/workflows/public-refresh.yml" target="_blank" rel="noreferrer">Check cloud refresh runs</a></section>;
}
