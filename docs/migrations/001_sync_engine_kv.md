# Migration 001: Sync Engine KV Schema

Date: 2026-07-22

## Purpose

Add production sync engine persistence on the existing Cloudflare KV namespace `JOB_ACTIONS_KV` without changing user workflow action keys.

## New Key Families

| Logical model | KV prefix |
|---|---|
| `job_sources` state | `source_state:v1:` |
| `sync_runs` | `sync_run:v1:` |
| `source_sync_results` | `source_sync_result:v1:` |
| `raw_job_records` | `raw_job_record:v1:` |
| `jobs` | `ingested_job:v1:` |
| `job_match_evaluations` | `match_eval:v1:` |
| active sync lock | `sync:v1:active-run` |
| last completed sync | `sync:v1:last-completed-run` |

## Existing Key Families Left Untouched

| Existing model | KV prefix |
|---|---|
| user workflow actions | `action:v1:` |
| personal notes | `note:v1:` |
| shared action store | `actions:v1:shared-dashboard` |

## Reversibility

This migration is reversible by deleting only the new key families listed above. Do not delete `action:v1:`, `note:v1:` or `actions:v1:shared-dashboard`.

## Retention

- Sync runs/results: 14 days.
- Raw records: 14 days, truncated.
- Ingested jobs/match evaluations/source state: 60-90 days.

## Notes

This KV migration maps the requested database tables to the current stack. If the project later moves to D1/Postgres, these key families should become:

- `job_sources`
- `sync_runs`
- `source_sync_results`
- `raw_job_records`
- `jobs`
- `job_source_links`
- `job_match_evaluations`
- `location_verifications`
