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
