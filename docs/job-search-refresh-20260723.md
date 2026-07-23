# Job search refresh - 23/07/2026

## Summary

Refresh scope:

- Updated candidate profile and search prompt in `docs/cv-job-matching-profile.md`.
- Checked production source registry `hcm_official_career_sources_v2`.
- Attempted all-source production sync.
- Ran smaller production sync batches after the all-source run hit Worker runtime limits.
- Refreshed selected dashboard jobs from live web search evidence.

## Production source registry

- Total registry sources: 326.
- Enabled/crawlable sources: 225.
- Tier A: 170.
- Tier B: 55.
- Tier C/manual/disabled: 101.

## Sync runs

All-source run:

- Sync run: `sync_mrwxwz9m_qql0q0`.
- Requested sources: 225.
- Result: cancelled.
- Completed before cancellation: 11/225.
- Failed sources: 8.
- Discovered jobs: 0.
- Root cause: a single Worker `waitUntil` run is not long enough for 225 sequential source crawls.

Batch run:

- Artifact: `artifacts/sync-batches-20260723.json`.
- Batch size: 8 sources.
- Planned batches: 29.
- Completed JSON batches before API returned HTML/script errors: 3.
- Sources processed in completed batches: 24.
- Discovered jobs: 0.
- New jobs: 0.
- Updated jobs: 0.

Important limitation:

- Several production POST `/api/sync` calls returned HTML instead of JSON after the third batch. Treat the sync result as partial, not a complete proof that all 225 sources were searched successfully.

## Manual web search refresh

Manual search refreshed or added these dashboard entries:

- TopCV - SK CONNECT - Sales Operations - `https://www.topcv.vn/viec-lam/sales-operations/2194718.html`
- TopCV - AGARI - GTM Sales Operations - `https://www.topcv.vn/tim-viec-lam-sales-admin-tai-ho-chi-minh-kl2`
- CareerViet - Saigon Paper - Sales Operations Manager - `https://careerviet.vn/viec-lam-tuong-tu/sales-operation-specialist-tai-ho-chi-minh-kl8-vi.html`
- TopCV - NABATI Vietnam - Sales Operations Manager FMCG - `https://www.topcv.vn/brand/nabativietnam/tuyen-dung/sales-operations-manager-fmcg-j1588043.html`
- TopCV - VAS Nghi Son - Sales Operations Executive - `https://www.topcv.vn/viec-lam/sales-operations-executive/2089017.html`
- JobsGO - Gia Su Eteacher - Sales Operations / Stimulation - `https://jobsgo.vn/viec-lam-trade-marketing-executive.html`
- JobsGO - Qui Phuc - International Sales Executive - `https://jobsgo.vn/viec-lam/international-sales-executive-up-to-20m-28039032678.html`

## Follow-up engineering work

- Move source sync from long `waitUntil` loops to a durable queue or scheduled cursor.
- Add a JSON error response wrapper so `/api/sync` never returns HTML to automation clients.
- Store batch cursor state so 225 sources can be processed across multiple invocations.
- Prioritize official ATS adapters over generic HTML parsing.
