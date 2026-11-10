# Cloud refresh setup

The public site is https://brawl-lab-ten.vercel.app. Its API key is never shipped to browsers.

The daily job runs at 10:00 UTC (6 AM New York in daylight saving time, 5 AM in standard time). PRs and pushes only verify the source. Deployment is restricted to manual or scheduled runs on the protected main branch.

In GitHub Settings → Environments → production, configure:

- `BRAWL_STARS_API_TOKEN`: official developer API key, accessed through the existing RoyaleAPI proxy.
- `BRAWL_SEASON_PROBE_TAG`: a valid player tag for checking the current official Ranked season; no personal history is collected by this job.
- `VERCEL_TOKEN`: deployment access for the existing Brawl Lab Vercel project.

Configure credentials directly in GitHub, never in source or chat. Set repository variable `PUBLIC_REFRESH_ENABLED=true` only after those secrets and production branch restrictions are configured. Dispatch the workflow and confirm its deployed-version readback before relying on the daily schedule.

Official news/release-note text changes stop the job for review. Source data older than 72 hours, new Ranked season, roster changes, failed optimizer convergence or failed validation also stop release. Reviewed regime evidence lives in `ml/public-refresh-baseline.json`. Never alter its timestamp merely to silence an expiry warning. The historical win-window experiment retains its own original dates.

The workflow uploads only audited compiled output, never raw training records or server secrets. Enable GitHub Actions failure notifications so stopped refreshes are visible. A saved schedule alone does not prove unattended deployment works.

## November 10 current-patch recovery

The reviewed November 3 update replaces the September baseline. Eligible matches
start November 4 00:00 UTC, conservatively excluding the entire release day because
the maintenance completion timestamp is not independently established. The job
verifies the official Ranked season separately; provider season55 is not that ID.
Training starts from scratch with no earlier weights, uses only the reviewed patch
and season, and caps the window at 21 days. Time-separated validation/test days
and release gates remain required. No older patch is used to fill sparse tiers.

The public provider revision f49a208cbc6a00dcfebfc0fba92ccc6b540ee73f contains
6,399,077 rows, ends November 6 02:35:30 UTC, and has 742,488 raw rows dated
November 4 onward. These are not yet filtered/deduplicated training counts. It is
stale on November 10 and supplies only two complete eligible days. No current
model can honestly be released from that snapshot under the existing gates.

Expected upstream blockers now publish a status-only release with the reason and
last attempt date, while disabling all archived model recommendations. They retry
daily. Unexpected processing/build/deployment errors still fail CI. The UI also
marks the status overdue after 36 hours, so a status release cannot hide an outage.

The official news check compares gameplay-update links inside main, not promotional
copy or navigation. Reviewed release notes are hashed inside main; gameplay edits
still require review. This is not fully automatic patch interpretation.

The November notes describe picks/bans in the game Battle Log, not a developer API
contract. The current parquet and provider documentation contain no bans/order.
Each cloud run probes the official battle log, emitting only a count of Ranked
records and recognized draft-field names, never tags, values, or raw responses.
A missing field in a small sample does not prove universal API absence.

### Revised current-patch evidence policy

Upstream scheduled Ingest run 42730192972 on November 10 skipped ingestion because
season55 was past its seven-day opening window. Waiting for the daily collector
is therefore not a freshness strategy. The public consumer cannot change that
external schedule.

For the current-patch candidate, use an explicit seven-day maximum source age,
replacing the original arbitrary 72-hour check. This permits a NEW model fitted
only on November 4-6 matches; it does not renew the pre-patch model. Model expiry
is the earlier of build+3 days and newest-source-match+7 days. With two complete
patch days, use fixed chronological boundaries: train through November 4 22:00,
validate November 5 00:00-10:00, test November 5 12:00-24:00 UTC. Two-hour gaps,
minimum sample counts, calibration and held-out quality gates remain unchanged.
With four complete patch days, use the existing full-day holdouts. The rule is
chosen before looking at outcomes. If the candidate fails, publish the blocker.
The earlier 72-hour/two-day blocker description above documents the initial
investigation, not this revised policy. Continuing beyond November 13 02:35:30
UTC requires newer source matches; no build can extend that deadline.
