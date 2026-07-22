import assert from "node:assert/strict";
import { __syncEngineTest as engine } from "../src/sync-engine.js";

const source = engine.officialSourceToRegistry(
  "Acme SaaS | Technology | Greenhouse | Major HCMC operations roles | https://boards.greenhouse.io/acmesaas | Grade A official source",
  "F1. Official HCMC Career Sources v2 - Grade A"
);

assert.equal(source.tier, "A");
assert.equal(source.enabled, true);
assert.equal(source.adapterKey, "greenhouse");

const selected = engine.selectSources([source, { ...source, id: "disabled", enabled: false }], { tiers: ["A"] });
assert.equal(selected.length, 1);
assert.equal(selected[0].id, source.id);

const raw = {
  sourceId: source.id,
  sourceJobId: "123",
  title: "Senior Sales Operations Specialist",
  companyName: "Acme SaaS",
  jobUrl: "https://boards.greenhouse.io/acmesaas/jobs/123",
  applyUrl: "https://boards.greenhouse.io/acmesaas/jobs/123",
  descriptionHtml: "<p>Own CRM data quality, KPI dashboards, workflow automation and stakeholder coordination in Ho Chi Minh City.</p>",
  locationText: "Ho Chi Minh City, Vietnam",
  employmentType: "Full-time",
  workplaceType: "Hybrid",
  salaryText: "",
  postedAt: "2026-07-22",
  fetchedAt: "2026-07-22T08:00:00.000Z"
};

const normalized = engine.normalizeRawJob(raw);
assert.equal(normalized.canonicalTitle, "Senior Sales Operations Specialist");
assert.equal(normalized.companyCanonicalName, "Acme SaaS");
assert.equal(normalized.workLocation.city, "Ho Chi Minh City");
assert.equal(normalized.workMode, "hybrid");
assert.equal(normalized.employmentType, "full_time");
assert.equal(normalized.linkQuality, "exact_job");

const appJob = engine.toAppJob(normalized, source);
assert.ok(appJob.score >= 85);
assert.equal(appJob.matchEvaluation.decision, "apply");
assert.equal(appJob.availabilityStatus, "active");

const duplicate = { ...appJob, id: "another-id", score: appJob.score - 5 };
assert.equal(engine.dedupeJobs([duplicate, appJob]).length, 1);
assert.equal(engine.dedupeJobs([duplicate, appJob])[0].id, appJob.id);

const dedupeIndex = engine.buildDedupeIndex([{ ...appJob, raw }]);
assert.equal(engine.findDuplicate({ ...appJob, id: "url-dupe" }, { jobUrl: appJob.url }, dedupeIndex).reason, "same_canonical_url");
assert.equal(engine.findDuplicate({ ...appJob, id: "apply-dupe", url: "https://example.com/listing/1", applicationLink: appJob.applicationLink }, { applyUrl: appJob.applicationLink }, dedupeIndex).reason, "same_apply_url");
assert.equal(engine.findDuplicate({ ...appJob, id: "source-dupe" }, { sourceId: raw.sourceId, sourceJobId: raw.sourceJobId }, dedupeIndex).reason, "same_source_job_id");

const merged = engine.mergeLifecycle({ ...appJob, firstSeenAt: "2026-07-20T00:00:00.000Z", score: 90 }, appJob);
assert.equal(merged.firstSeenAt, "2026-07-20T00:00:00.000Z");
assert.equal(merged.missingCheckCount, 0);
assert.equal(merged.matchEvaluation.cacheStatus, "hit");
assert.equal(merged.matchEvaluation.evaluationCount, 1);

const changedJob = { ...appJob, contentHash: "changed", matchEvaluation: { ...appJob.matchEvaluation, score: appJob.score - 1 } };
const changedMerged = engine.mergeLifecycle({ ...appJob, matchEvaluation: { ...appJob.matchEvaluation, evaluationCount: 1 } }, changedJob);
assert.equal(changedMerged.matchEvaluation.cacheStatus, "miss");
assert.equal(changedMerged.matchEvaluation.evaluationCount, 2);

const missingOnce = engine.nextLifecycleForMissing(appJob);
assert.equal(missingOnce.availabilityStatus, "possibly_active");
assert.equal(missingOnce.missingCheckCount, 1);
const removedByCount = engine.nextLifecycleForMissing({ ...appJob, missingCheckCount: 2 });
assert.equal(removedByCount.availabilityStatus, "removed");
const removedByUrl = engine.nextLifecycleForMissing(appJob, "url_removed");
assert.equal(removedByUrl.availabilityStatus, "removed");

assert.equal(engine.evaluateLinkQuality("https://example.com/jobs/search?q=sales", raw, ""), "search_page");
assert.equal(engine.evaluateLinkQuality("not a url", raw, ""), "invalid");

const jsonLdHtml = `<script type="application/ld+json">{
  "@type": "JobPosting",
  "title": "Commercial Operations Analyst",
  "hiringOrganization": {"name": "Acme SaaS"},
  "url": "https://example.com/jobs/commercial-ops",
  "description": "Commercial operations, CRM and reporting role.",
  "jobLocation": {"address": {"addressLocality": "Ho Chi Minh City"}},
  "employmentType": "FULL_TIME",
  "datePosted": "2026-07-22"
}</script>`;
assert.equal(engine.extractJsonLdJobs(jsonLdHtml, { id: "jsonld", name: "Acme", baseUrl: "https://example.com/jobs" }).length, 1);

const htmlFixture = `<a href="/jobs/sales-operations">Sales Operations Executive</a><a href="/about">About us</a>`;
assert.equal(engine.genericHtmlRecords(htmlFixture, { id: "html", name: "Acme", baseUrl: "https://example.com/careers", locationScope: ["Ho Chi Minh City"] }).length, 1);

assert.equal(engine.classifyError(new Error("rate_limited:429")), "rate_limited");
assert.equal(engine.classifyError(new Error("auth_required:403")), "auth_required");
assert.equal(engine.classifyError(new Error("captcha challenge")), "captcha");
assert.equal(engine.retryPolicyForError("timeout").retry, true);
assert.equal(engine.retryPolicyForError("rate_limited").backoff, "exponential");
assert.equal(engine.retryPolicyForError("captcha").health, "blocked");

assert.throws(() => engine.validateCrawlUrl("http://127.0.0.1/jobs", { baseUrl: "https://example.com/careers" }), /blocked_private_host/);
assert.throws(() => engine.validateCrawlUrl("file:///etc/passwd", { baseUrl: "https://example.com/careers" }), /invalid_url_protocol/);
assert.throws(() => engine.validateCrawlUrl("https://evil.example.net/jobs", { baseUrl: "https://example.com/careers" }), /blocked_unregistered_host/);
assert.equal(engine.validateCrawlUrl("https://example.com/jobs/1", { baseUrl: "https://example.com/careers" }), "https://example.com/jobs/1");

console.log("sync-engine tests passed");
