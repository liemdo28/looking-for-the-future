# Migration 002: Cloudflare Queues + D1 Required

Date: 2026-07-22

Status: Required by benchmark, not yet applied.

## Evidence

Production benchmark on 2026-07-22:

| Run size | Result |
|---:|---|
| 3 | completed partial in 12s |
| 10 | completed partial in 34s |
| 25 | timeout/unfinished after 122s; only 11/25 completed |
| 50 | timeout/unfinished after 125s; only 10/50 completed |

Decision: KV run state + `ctx.waitUntil` is not sufficient for production-scale source sync above small batches.

## Target Architecture

```text
POST /api/sync
→ create sync_run in D1
→ enqueue one SourceSyncTask per source
→ queue consumer processes each source independently
→ adapter fetch
→ normalize
→ dedupe
→ persist jobs and source links in D1
→ update source_sync_results
→ aggregate sync_run counters
→ frontend polling
```

## Queue Message

```ts
type SourceSyncTask = {
  syncRunId: string;
  sourceId: string;
  attempt: number;
  requestedAt: string;
};
```

## D1 Tables

```sql
CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  total_sources INTEGER NOT NULL DEFAULT 0,
  completed_sources INTEGER NOT NULL DEFAULT 0,
  failed_sources INTEGER NOT NULL DEFAULT 0,
  discovered_jobs INTEGER NOT NULL DEFAULT 0,
  new_jobs INTEGER NOT NULL DEFAULT 0,
  updated_jobs INTEGER NOT NULL DEFAULT 0,
  duplicate_jobs INTEGER NOT NULL DEFAULT 0,
  removed_jobs INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  error_summary TEXT
);

CREATE TABLE source_sync_results (
  sync_run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  status TEXT NOT NULL,
  jobs_fetched INTEGER NOT NULL DEFAULT 0,
  new_jobs INTEGER NOT NULL DEFAULT 0,
  updated_jobs INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  response_code INTEGER,
  duration_ms INTEGER,
  error_type TEXT,
  error_message TEXT,
  PRIMARY KEY (sync_run_id, source_id)
);

CREATE TABLE job_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  tier TEXT NOT NULL,
  sync_strategy TEXT NOT NULL,
  adapter_key TEXT,
  health TEXT NOT NULL DEFAULT 'unknown',
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_sync_at TEXT,
  last_error TEXT
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  canonical_title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  work_location_raw TEXT,
  city TEXT,
  district TEXT,
  country TEXT,
  work_mode TEXT,
  employment_type TEXT,
  job_url TEXT,
  apply_url TEXT,
  link_quality TEXT,
  content_hash TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  last_checked_at TEXT,
  missing_check_count INTEGER NOT NULL DEFAULT 0,
  availability_status TEXT NOT NULL DEFAULT 'unknown'
);

CREATE TABLE job_source_links (
  job_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_job_id TEXT,
  source_url TEXT,
  first_seen_at TEXT,
  last_seen_at TEXT,
  PRIMARY KEY (job_id, source_id, source_job_id)
);

CREATE TABLE job_evaluations (
  job_id TEXT PRIMARY KEY,
  score INTEGER NOT NULL,
  decision TEXT NOT NULL,
  strengths_json TEXT NOT NULL,
  risks_json TEXT NOT NULL,
  recommendation TEXT,
  resume_focus_json TEXT NOT NULL,
  model_version TEXT NOT NULL,
  scoring_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  evaluation_count INTEGER NOT NULL DEFAULT 1,
  evaluated_at TEXT
);

CREATE TABLE location_verifications (
  job_id TEXT PRIMARY KEY,
  work_location TEXT,
  office_address TEXT,
  source TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 0,
  evidence_url TEXT,
  verified_at TEXT
);
```

## Required Worker Changes

- Add D1 binding, for example `AIJH_DB`.
- Add Queue producer binding, for example `JOB_SOURCE_SYNC_QUEUE`.
- Add queue consumer in Worker export.
- Make queue consumer idempotent by checking `(syncRunId, sourceId)` status before processing.
- Keep KV action/notes storage unchanged.
- Keep existing KV sync keys as fallback until migration is verified.

## Rollout Plan

1. Create D1 database.
2. Apply schema migration.
3. Create Cloudflare Queue and optional dead-letter queue.
4. Deploy Worker with both KV and D1/Queue bindings.
5. Mirror source registry into D1.
6. Run 3/10/25/50 benchmark on Queue path.
7. Only then raise default manual sync cap above 10.

## Rollback

- Disable Queue producer path.
- Keep current KV + `ctx.waitUntil` path capped to 10 sources.
- Do not delete KV action or notes keys.
