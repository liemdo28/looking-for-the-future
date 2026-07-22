# AI Job Hunter Sync Engine Runbook

## Audit

Current architecture:

- Frontend: static `index.html`, `styles.css`, `app.js`.
- Backend: Cloudflare Worker in `src/worker.js`.
- Storage: Cloudflare KV binding `JOB_ACTIONS_KV`.
- Static data: `data/jobs.json` and `data/sources.json`.
- Scheduler: Cloudflare Cron Trigger `0 1-13 * * *`, equal to 08:00-20:00 Asia/Ho_Chi_Minh.
- Deployment: `npm run deploy:worker`.

What existed before this engine:

- `GET /api/sync` returned source-derived jobs directly.
- Scheduled sync stored only a lightweight status payload.
- Frontend button refreshed data but did not create a backend sync run or show backend progress.

What was added:

- Canonical source registry generated from `data/sources.json`.
- Sync run model stored in KV.
- Per-source sync results stored in KV.
- Raw job records, ingested jobs and match evaluations stored in KV.
- Adapter architecture for Greenhouse, Lever, JSON-LD and generic HTML career pages.
- Normalization, link quality, location verification, dedupe, lifecycle and match scoring.
- `POST /api/sync` plus polling APIs.
- Frontend progress UI for queued/running/partial/completed/failed sync states.

Technical risks:

- This implementation uses KV and `ctx.waitUntil` as a lightweight background runner. For very high source volume, migrate the same source task schema to Cloudflare Queues and D1.
- Some career sites block public crawlers or require JavaScript/CAPTCHA. Those sources must remain `manual`, `restricted` or `unsupported`.
- Workday/Ashby/SmartRecruiters tenants vary by company and need tenant-specific adapter expansion.

## API

Start sync:

```http
POST /api/sync
Content-Type: application/json

{
  "mode": "due_sources",
  "tiers": ["A", "B"],
  "sourceIds": [],
  "force": false
}
```

Poll status:

```http
GET /api/sync/:syncRunId
```

Source results:

```http
GET /api/sync/:syncRunId/sources
```

Cancel:

```http
POST /api/sync/:syncRunId/cancel
```

Retry failed:

```http
POST /api/sync/:syncRunId/retry-failed
```

Source registry:

```http
GET /api/sources
```

Dashboard jobs:

```http
GET /api/sync
```

## KV Storage

KV keys:

- `sync_run:v1:{syncRunId}`
- `source_sync_result:v1:{syncRunId}:{sourceId}`
- `ingested_job:v1:{jobId}`
- `raw_job_record:v1:{sourceId}:{jobId}`
- `match_eval:v1:{jobId}`
- `source_state:v1:{sourceId}`
- `sync:v1:active-run`
- `sync:v1:last-completed-run`

## Supported Sources

| Source type | Adapter | Tier | Status |
|---|---|---:|---|
| Official career page | Generic HTML | A/B | Active |
| JSON-LD JobPosting | Generic JSON-LD | A/B | Active |
| Greenhouse | Greenhouse API | A | Active when board token is detectable |
| Lever | Lever API | A | Active when company slug is detectable |
| LinkedIn / Google Jobs / CAPTCHA sources | Manual | C | Restricted/manual |

## How To Run

Build:

```bash
npm run build
```

Test:

```bash
npm test
```

Deploy Worker:

```bash
npm run deploy:worker
```

Trigger manual sync:

```bash
curl -X POST https://looking-for-the-future.liem-dt0208.workers.dev/api/sync \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"due_sources\",\"tiers\":[\"A\",\"B\"],\"force\":false}"
```

Inspect run:

```bash
curl https://looking-for-the-future.liem-dt0208.workers.dev/api/sync/{syncRunId}
```

Retry failed sources:

```bash
curl -X POST https://looking-for-the-future.liem-dt0208.workers.dev/api/sync/{syncRunId}/retry-failed
```

Disable a source:

- Edit the source entry in `data/sources.json` or adjust registry generation in `src/sync-engine.js`.
- Set low-quality or blocked sources to `enabled: false`, `syncStrategy: "manual"`, or `robotsPolicy: "restricted"`.

Add a new adapter:

1. Add an adapter object in `src/sync-engine.js` with `canHandle(source)` and `fetchJobs(source)`.
2. Add it to `selectAdapter`.
3. Return `RawJobRecord` objects only.
4. Add fixture tests in `tests/sync-engine.test.mjs`.

## Known Limitations

- Cloudflare Queues are not configured in this repo yet; the current runner uses `ctx.waitUntil` with KV-backed run state.
- No authenticated user system exists, so manual sync is protected by source allow-listing and active-run locks, not per-user auth.
- Raw payload retention is intentionally short and truncated to control KV size.
- AI match is deterministic heuristic scoring; no external model call is made unless a future AI provider is added.
