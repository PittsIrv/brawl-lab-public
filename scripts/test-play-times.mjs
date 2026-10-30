import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compile} from './map-guide-test-modules.mjs';
const {validateTimeStats,localTimeBuckets,summarizeTimes,TIME_TIERS}=await import(compile(readFileSync('lib/play-times.ts','utf8')));
const data=JSON.parse(readFileSync('public-app/data/time-stats.json','utf8'));
validateTimeStats(data);
assert.equal(data.sets,584131);
assert.equal(data.source.sha256,JSON.parse(readFileSync('reports/initial-release/provenance.json','utf8')).sha256);
const utc=localTimeBuckets(data,'UTC'),ny=localTimeBuckets(data,'America/New_York');
assert.equal(utc[0].day,4);assert.equal(utc[0].window,0);
assert.equal(ny[0].day,3);assert.equal(ny[0].window,6);
let total=0;
for(const tier of TIME_TIERS){
 const all=summarizeTimes(ny,tier,'all'),weekday=summarizeTimes(ny,tier,'weekdays'),weekend=summarizeTimes(ny,tier,'weekends');
 assert.equal(all.sets,weekday.sets+weekend.sets);
 assert.equal(all.sets,all.heatmap.flat().reduce((s,c)=>s+c.sets,0));
 assert.equal(all.windows.reduce((s,c)=>s+c.hours,0),264);
 assert.equal(all.sets,summarizeTimes(utc,tier,'all').sets);
 if(all.peak)assert.ok(all.peak.sets>=100&&all.peak.hours>=9&&all.peak.days.size>=3);
 total+=all.sets;
}
assert.equal(total,data.sets);
assert.equal(summarizeTimes(ny,'Pro','all').peak,null);
assert.throws(()=>validateTimeStats({...data,sets:data.sets+1}));
assert.throws(()=>validateTimeStats({...data,counts:data.counts.slice(1)}));
assert.throws(()=>localTimeBuckets(data,'fake-zone'));
// Constant observed intensity stays constant through local day boundaries,
// half-hour / quarter-hour offsets and the repeated DST hour.
const start='2026-10-30T00:00:00Z',endExclusive='2026-11-04T00:00:00Z';
const fixture={...data,start,endExclusive,counts:Array.from({length:5*96},()=>[1,0,0,0]),sets:5*96};
validateTimeStats(fixture);
for(const zone of ['UTC','America/New_York','Asia/Kolkata','Asia/Kathmandu']){
 const a=summarizeTimes(localTimeBuckets(fixture,zone),'Mythic','all');
 assert.ok(a.windows.every(w=>w.rate===12));assert.equal(a.sets,480);
}
const fall=localTimeBuckets(fixture,'America/New_York');
assert.equal(fall.filter(b=>b.date==='2026-11-01'&&b.window===0).length,16);
// Select by rate, not raw count; guard insufficient dates and rank isolation.
const synthetic=[];
for(let day=0;day<4;day++)for(let slot=0;slot<12;slot++)synthetic.push({date:`d${day}`,day,window:0,counts:[4,0,0,0]});
for(let day=0;day<3;day++)for(let slot=0;slot<12;slot++)synthetic.push({date:`d${day}`,day,window:1,counts:[5,0,0,0]});
const summary=summarizeTimes(synthetic,'Mythic','all');
assert.equal(summary.peak.index,1);assert.ok(summary.windows[0].sets>summary.windows[1].sets);
assert.equal(summarizeTimes(synthetic,'Legendary','all').peak,null);
console.log('PASS: timing totals, source provenance, tier isolation, coverage, filters, sparse ranks, timezone/DST and rate normalization.');
console.log(JSON.stringify(TIME_TIERS.map(t=>{const r=summarizeTimes(ny,t,'all');return {tier:t,sets:r.sets,peak:r.peak?.index??null,rate:r.peak?.rate??null};})));
