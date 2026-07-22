# Production Sync Verification

Production URL: https://looking-for-the-future.liem-dt0208.workers.dev

Git HEAD: 3c516f7161a6c602ed7808aa25bc3c055500d71e

Worker version/header: AIJH-SYNC-ENGINE-20260722-1845

App marker: AIJH-SYNC-ENGINE-20260722-1845

Verified at: 2026-07-22T16:32:24.964Z

## Production Sync Runs

| Run size | syncRunId | Status | Completed | Failed | Jobs fetched | New | Updated | Duplicate | Duration |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| 3 | sync_mrwaw7vx_up7mnr | partial | 3/3 | 2 | 0 | 0 | 0 | 0 | 12s |
| 10 | sync_mrwawjyd_fwm596 | partial | 10/10 | 7 | 0 | 0 | 0 | 0 | 34s |
| 25 | sync_mrwaxcrg_9o0gut | timeout_unfinished | 11/25 | 8 | 0 | 0 | 0 | 0 | 122s |
| 50 | sync_mrwb01ep_vf38uk | timeout_unfinished | 10/50 | 7 | 0 | 0 | 0 | 0 | 125s |

## Adapter Results

| adapter | sourcesTested | successful | failed | falsePositives | jobsParsed |
| --- | --- | --- | --- | --- | --- |
| Workday | 7 | 4 | 0 | 0 | 0 |
| Generic HTML | 73 | 3 | 23 | 0 | 0 |
| SmartRecruiters | 6 | 3 | 0 | 0 | 0 |
| Greenhouse | 2 | 0 | 1 | 0 | 0 |

## Dedupe Evidence

| case | duplicateReason | duplicateConfidence | databaseResult |
| --- | --- | --- | --- |
| same canonical URL | same_canonical_url | 98 | Verified by unit test |
| same company + title + location | same_title_company_location | 92 | Verified by unit test |
| same apply URL | same_apply_url | 97 | Verified by unit test |

## Link Quality Evidence

| url | expected | actual | evidence |
| --- | --- | --- | --- |
| https://boards.greenhouse.io/acme/jobs/123 | exact_job | Verified by unit test classifier | tests/sync-engine.test.mjs |
| https://example.com/careers | company_job_page | Verified by unit test classifier | tests/sync-engine.test.mjs |
| https://example.com/jobs | listing_page | Verified by unit test classifier | tests/sync-engine.test.mjs |
| https://example.com/jobs/search?q=sales | search_page | Verified by unit test classifier | tests/sync-engine.test.mjs |
| not a url | invalid | Verified by unit test classifier | tests/sync-engine.test.mjs |
| https://jobs.sanofi.com/corporate-functions-business-operations | production_sample | client_computed_or_missing | official-crawl-sanofi-vietnam-corporate-functions-business-operations |
| https://www.accenture.com/vn-en/careers/jobsearch | production_sample | client_computed_or_missing | official-v2-accenture-business-operations-revenue-operations |
| https://aeonpeople.com.vn/ | production_sample | client_computed_or_missing | official-v2-aeon-vietnam-sales-operations-sales-analyst |
| https://www.ajinomoto.com.vn/vi/tuyen-dung | production_sample | client_computed_or_missing | official-v2-ajinomoto-vietnam-sales-operations-sales-analyst |
| https://careers.astrazeneca.com/search-jobs/Vietnam/7684/2/1562822/16x16667/108x21667/50/2 | production_sample | client_computed_or_missing | official-v2-astrazeneca-vietnam-commercial-operations-tender-analyst |

## Location Evidence

| jobId | workLocation | officeAddress | verificationSource | verified | confidence | evidenceUrl |
| --- | --- | --- | --- | --- | --- | --- |
| official-crawl-sanofi-vietnam-corporate-functions-business-operations | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://jobs.sanofi.com/corporate-functions-business-operations |
| official-v2-accenture-business-operations-revenue-operations | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://www.accenture.com/vn-en/careers/jobsearch |
| official-v2-aeon-vietnam-sales-operations-sales-analyst | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://aeonpeople.com.vn/ |
| official-v2-ajinomoto-vietnam-sales-operations-sales-analyst | Ho Chi Minh City / cần xác minh theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://www.ajinomoto.com.vn/vi/tuyen-dung |
| official-v2-astrazeneca-vietnam-commercial-operations-tender-analyst | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://careers.astrazeneca.com/search-jobs/Vietnam/7684/2/1562822/16x16667/108x21667/50/2 |
| official-v2-be-group-business-operations-revenue-operations | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://be.com.vn/tuyen-dung/ |
| official-v2-central-retail-vietnam-sales-operations-sales-analyst | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://tuyendung.centralretail.com.vn/ |
| official-v2-circle-k-vietnam-sales-operations-sales-analyst | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://www.circlek.com.vn/en/careers/ |
| official-v2-decathlon-vietnam-sales-operations-sales-analyst | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://careers.decathlon.vn/ |
| official-v2-dxc-technology-business-operations-revenue-operations | Vietnam / cần xác minh HCMC theo JD |  | job_platform_or_unknown | false | UNVERIFIED | https://careers.dxc.com/global/en/search-results?keywords=&location=Vietnam |

## Lifecycle Evidence

| scenario | expected | status | evidence |
| --- | --- | --- | --- |
| Job still present after sync | lastSeenAt updated; active; missingCheckCount reset | Verified by unit/integration test | tests/sync-engine.test.mjs mergeLifecycle |
| Job missing once | possibly_active; missingCheckCount incremented | Verified by unit test | tests/sync-engine.test.mjs nextLifecycleForMissing |
| Job 404/410 | removed | Verified by unit test | tests/sync-engine.test.mjs nextLifecycleForMissing url_removed |
| validThrough expired | expired | Implemented; fixture coverage limited | normalizeRawJob/toAppJob path |
| Production removed count | counter recorded | Verified production counter | [{"syncRunId":"sync_mrwaw7vx_up7mnr","removedJobs":0},{"syncRunId":"sync_mrwawjyd_fwm596","removedJobs":0},{"syncRunId":"sync_mrwaxcrg_9o0gut","removedJobs":0},{"syncRunId":"sync_mrwb01ep_vf38uk","removedJobs":0}] |

## AI Cache Evidence

| jobId | oldHash | newHash | evaluationCountBefore | evaluationCountAfter | cache | evidence |
| --- | --- | --- | --- | --- | --- | --- |
| fixture:Senior Sales Operations Specialist | contentHash from normalized fixture | same contentHash | 1 | 1 | hit | tests/sync-engine.test.mjs |
| fixture:Senior Sales Operations Specialist | original contentHash | changed | 1 | 2 | miss | tests/sync-engine.test.mjs |

## Unverified Or Missing

- Real production duplicate cases A/B/C are not guaranteed to exist in live source responses; duplicate logic is fixture-tested and production counters are recorded when duplicates appear.
- Office address verification from official contact pages is not yet implemented as live crawling; current production evidence separates work location from empty/unknown office address.
- The score is rule_based heuristic scoring, not a real external AI model call.
- npm run lint and npm run typecheck are unavailable because package.json does not define those scripts.
