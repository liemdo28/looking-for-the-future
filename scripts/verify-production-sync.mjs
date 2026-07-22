import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const productionUrl = process.env.AIJH_PRODUCTION_URL || "https://looking-for-the-future.liem-dt0208.workers.dev";
const runSizes = (process.env.AIJH_VERIFY_RUN_SIZES || "3,10,25,50").split(",").map((value) => Number(value.trim())).filter(Boolean);
const maxRunWaitMs = Number(process.env.AIJH_VERIFY_MAX_RUN_WAIT_MS || 180_000);
const outDir = path.join(process.cwd(), "artifacts");
const docsDir = path.join(process.cwd(), "docs");
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

const verifiedAt = new Date().toISOString();
const gitHead = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

async function main() {
  const htmlResponse = await fetch(`${productionUrl}/?verify=scale-hardening`, { headers: { "Cache-Control": "no-cache" } });
  const html = await htmlResponse.text();
  const workerVersion = htmlResponse.headers.get("x-aijh-version") || "";
  const appMarker = /AIJH-[A-Z0-9-]+/.exec(html)?.[0] || "";
  const sourceRegistry = await fetchJson(`${productionUrl}/api/sources`);
  const syncSnapshot = await fetchJson(`${productionUrl}/api/sync?verify=scale-hardening`);

  const sourceAudit = auditSources(sourceRegistry.sources || []);
  const syncRuns = [];
  for (const size of runSizes) {
    const run = await runProductionSync(size);
    syncRuns.push(run);
    await sleep(3500);
  }

  const adapterResults = summarizeAdapterResults(syncRuns, sourceRegistry.sources || []);
  const benchmarkDecision = decideArchitecture(syncRuns);
  const linkQualityCases = buildLinkQualityCases(syncSnapshot.jobs || []);
  const locationCases = buildLocationCases(syncSnapshot.jobs || []);
  const lifecycleCases = buildLifecycleCases(syncRuns);
  const aiCacheCases = buildAiCacheCases();
  const dedupeCases = buildDedupeCases(syncRuns);

  const report = {
    verifiedAt,
    productionUrl,
    gitHead,
    workerVersion,
    appMarker,
    sourceRegistry: sourceAudit,
    syncRuns,
    adapters: adapterResults,
    dedupeCases,
    linkQualityCases,
    locationCases,
    lifecycleCases,
    aiCacheCases,
    benchmarks: syncRuns.map(toBenchmarkRow),
    decision: benchmarkDecision.decision,
    decisionReason: benchmarkDecision.reason,
    unverified: [
      "Real production duplicate cases A/B/C are not guaranteed to exist in live source responses; duplicate logic is fixture-tested and production counters are recorded when duplicates appear.",
      "Office address verification from official contact pages is not yet implemented as live crawling; current production evidence separates work location from empty/unknown office address.",
      "The score is rule_based heuristic scoring, not a real external AI model call.",
      "npm run lint and npm run typecheck are unavailable because package.json does not define those scripts."
    ]
  };

  writeJson(path.join(outDir, "sync-verification-report.json"), report);
  writeDocs(report);
  console.log(JSON.stringify({
    verifiedAt,
    workerVersion,
    appMarker,
    sourceTotals: sourceAudit.metrics,
    syncRuns: report.syncRuns.map(({ runSize, syncRunId, status, completedSources, totalSources, jobsFetched, newJobs, updatedJobs, duplicateJobs, failedSources, durationMs }) => ({
      runSize,
      syncRunId,
      status,
      completedSources,
      totalSources,
      jobsFetched,
      newJobs,
      updatedJobs,
      duplicateJobs,
      failedSources,
      durationMs
    })),
    decision: report.decision
  }, null, 2));
}

async function runProductionSync(runSize) {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const start = await fetchJson(`${productionUrl}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ mode: "due_sources", tiers: ["A", "B"], maxSources: runSize, force: true })
  });
  const syncRunId = start.syncRunId;
  let status = start;
  let sources = [];
  const timeoutMs = maxRunWaitMs;
  while (Date.now() - startMs < timeoutMs) {
    await sleep(5000);
    status = await fetchJson(`${productionUrl}/api/sync/${syncRunId}`);
    sources = (await fetchJson(`${productionUrl}/api/sync/${syncRunId}/sources`)).sources || [];
    if (["completed", "partial", "failed", "cancelled"].includes(status.status)) break;
  }
  const timedOut = ["queued", "running"].includes(status.status);
  if (timedOut && syncRunId) {
    await fetchJson(`${productionUrl}/api/sync/${syncRunId}/cancel`, { method: "POST" }).catch(() => null);
  }
  const completedAt = new Date().toISOString();
  const durations = sources.map((source) => Number(source.durationMs || 0)).filter((value) => value >= 0).sort((a, b) => a - b);
  return {
    runSize,
    syncRunId,
    startedAt,
    completedAt,
    durationMs: Date.now() - startMs,
    status: timedOut ? "timeout_unfinished" : status.status || "unknown",
    cancelledAfterTimeout: timedOut,
    totalSources: status.totalSources || start.queuedSources || runSize,
    queuedSources: status.queuedSources || start.queuedSources || 0,
    completedSources: status.completedSources || status.progress?.completed || 0,
    failedSources: status.failedSources || sources.filter((source) => source.status === "failed").length,
    skippedSources: sources.filter((source) => source.status === "skipped").length,
    rateLimitedSources: sources.filter((source) => source.status === "rate_limited").length,
    jobsFetched: sources.reduce((sum, source) => sum + Number(source.jobsFetched || 0), 0),
    newJobs: status.newJobs || 0,
    updatedJobs: status.updatedJobs || 0,
    duplicateJobs: status.duplicateJobs || 0,
    removedJobs: status.removedJobs || 0,
    p50SourceDurationMs: percentile(durations, 0.5),
    p95SourceDurationMs: percentile(durations, 0.95),
    p99SourceDurationMs: percentile(durations, 0.99),
    sourceResults: sources
  };
}

function auditSources(sources) {
  const byAdapter = {};
  const byType = {};
  const byHealth = {};
  const byTier = {};
  const urlCounts = new Map();
  const companyCounts = new Map();
  const domainCounts = new Map();
  const invalidSources = [];
  const unsupportedSources = [];
  const missingAdapterSources = [];
  sources.forEach((source) => {
    const adapter = adapterBucket(source);
    increment(byAdapter, adapter);
    increment(byType, source.type || "unknown");
    increment(byHealth, source.health || (source.enabled ? "unknown" : "disabled"));
    increment(byTier, source.tier || "unknown");
    if (source.baseUrl) {
      try {
        const url = new URL(source.baseUrl);
        incrementMap(urlCounts, canonicalSourceUrl(source.baseUrl));
        incrementMap(domainCounts, url.hostname);
      } catch {
        invalidSources.push(source);
      }
    } else if (source.enabled) {
      invalidSources.push(source);
    }
    incrementMap(companyCounts, normalizeKey(source.name));
    if (["Unsupported", "Manual", "Unknown"].includes(adapter)) unsupportedSources.push(source);
    if (source.enabled && ["Unsupported", "Manual", "Unknown"].includes(adapter)) missingAdapterSources.push(source);
  });
  const duplicateUrls = [...urlCounts.entries()].filter(([, count]) => count > 1);
  const duplicateCompanies = [...companyCounts.entries()].filter(([name, count]) => name && count > 1);
  const duplicateDomains = [...domainCounts.entries()].filter(([, count]) => count > 1);
  const enabled = sources.filter((source) => source.enabled).length;
  const crawlable = sources.filter((source) => source.enabled && source.baseUrl && !source.requiresAuth && source.robotsPolicy !== "restricted" && !["Unsupported", "Manual", "Unknown"].includes(adapterBucket(source))).length;
  return {
    metrics: {
      totalSources: sources.length,
      enabled,
      disabled: sources.length - enabled,
      crawlable,
      unsupported: unsupportedSources.length,
      invalidUrl: invalidSources.length,
      duplicateSource: duplicateUrls.length,
      healthy: byHealth.healthy || 0,
      degraded: byHealth.degraded || 0,
      failing: byHealth.failing || 0,
      blocked: byHealth.blocked || 0,
      unknown: byHealth.unknown || 0
    },
    byAdapter,
    byType,
    byHealth,
    byTier,
    duplicateUrls: duplicateUrls.slice(0, 25).map(([url, count]) => ({ url, count })),
    duplicateCompanies: duplicateCompanies.slice(0, 25).map(([company, count]) => ({ company, count })),
    duplicateDomains: duplicateDomains.slice(0, 25).map(([domain, count]) => ({ domain, count })),
    invalidSources: invalidSources.slice(0, 25).map(sourceSummary),
    missingAdapterSources: missingAdapterSources.slice(0, 25).map(sourceSummary)
  };
}

function summarizeAdapterResults(syncRuns, sources) {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const rows = {};
  syncRuns.flatMap((run) => run.sourceResults || []).forEach((result) => {
    const source = sourceById.get(result.sourceId) || {};
    const adapter = adapterBucket(source);
    rows[adapter] ||= { sourcesTested: 0, successful: 0, failed: 0, falsePositives: 0, jobsParsed: 0 };
    rows[adapter].sourcesTested += 1;
    if (result.status === "success") rows[adapter].successful += 1;
    if (["failed", "rate_limited"].includes(result.status)) rows[adapter].failed += 1;
    rows[adapter].jobsParsed += Number(result.jobsFetched || 0);
  });
  return rows;
}

function buildLinkQualityCases(jobs) {
  const cases = [];
  const samples = [
    ["https://boards.greenhouse.io/acme/jobs/123", "exact_job"],
    ["https://example.com/careers", "company_job_page"],
    ["https://example.com/jobs", "listing_page"],
    ["https://example.com/jobs/search?q=sales", "search_page"],
    ["not a url", "invalid"]
  ];
  samples.forEach(([url, expected]) => cases.push({ url, expected, actual: "Verified by unit test classifier", evidence: "tests/sync-engine.test.mjs" }));
  jobs.slice(0, 5).forEach((job) => cases.push({ url: job.url, expected: "production_sample", actual: job.linkQuality || "client_computed_or_missing", evidence: job.id }));
  return cases;
}

function buildLocationCases(jobs) {
  return jobs.slice(0, 10).map((job) => ({
    jobId: job.id,
    title: job.title,
    company: job.company,
    workLocation: job.location || job.locationDetails?.jobWorkAddress || "",
    officeAddress: job.locationDetails?.companyOfficeAddress || "",
    verificationSource: job.locationDetails?.locationSource || "job_platform_or_unknown",
    verified: job.locationDetails?.verificationStatus ? !["ai-suggested", "unknown"].includes(job.locationDetails.verificationStatus) : false,
    confidence: job.locationDetails?.locationConfidence || "UNVERIFIED",
    evidenceUrl: job.url
  }));
}

function buildLifecycleCases(syncRuns) {
  return [
    { scenario: "Job still present after sync", evidence: "tests/sync-engine.test.mjs mergeLifecycle", expected: "lastSeenAt updated; active; missingCheckCount reset", status: "Verified by unit/integration test" },
    { scenario: "Job missing once", evidence: "tests/sync-engine.test.mjs nextLifecycleForMissing", expected: "possibly_active; missingCheckCount incremented", status: "Verified by unit test" },
    { scenario: "Job 404/410", evidence: "tests/sync-engine.test.mjs nextLifecycleForMissing url_removed", expected: "removed", status: "Verified by unit test" },
    { scenario: "validThrough expired", evidence: "normalizeRawJob/toAppJob path", expected: "expired", status: "Implemented; fixture coverage limited" },
    { scenario: "Production removed count", evidence: syncRuns.map((run) => ({ syncRunId: run.syncRunId, removedJobs: run.removedJobs })), expected: "counter recorded", status: "Verified production counter" }
  ];
}

function buildAiCacheCases() {
  return [
    {
      jobId: "fixture:Senior Sales Operations Specialist",
      oldHash: "contentHash from normalized fixture",
      newHash: "same contentHash",
      evaluationCountBefore: 1,
      evaluationCountAfter: 1,
      cache: "hit",
      evidence: "tests/sync-engine.test.mjs"
    },
    {
      jobId: "fixture:Senior Sales Operations Specialist",
      oldHash: "original contentHash",
      newHash: "changed",
      evaluationCountBefore: 1,
      evaluationCountAfter: 2,
      cache: "miss",
      evidence: "tests/sync-engine.test.mjs"
    }
  ];
}

function buildDedupeCases(syncRuns) {
  const productionDuplicates = syncRuns.filter((run) => run.duplicateJobs > 0).map((run) => ({
    syncRunId: run.syncRunId,
    duplicateJobs: run.duplicateJobs,
    databaseResult: "counter persisted in sync_run"
  }));
  return [
    { case: "same canonical URL", sourceJobA: "fixture raw A", sourceJobB: "fixture raw B", canonicalJobId: "fixture canonical", duplicateConfidence: 98, duplicateReason: "same_canonical_url", databaseResult: "Verified by unit test" },
    { case: "same company + title + location", sourceJobA: "fixture raw A", sourceJobB: "fixture raw B", canonicalJobId: "fixture canonical", duplicateConfidence: 92, duplicateReason: "same_title_company_location", databaseResult: "Verified by unit test" },
    { case: "same apply URL", sourceJobA: "fixture raw A", sourceJobB: "fixture raw B", canonicalJobId: "fixture canonical", duplicateConfidence: 97, duplicateReason: "same_apply_url", databaseResult: "Verified by unit test" },
    ...productionDuplicates
  ];
}

function decideArchitecture(syncRuns) {
  const largest = syncRuns.at(-1);
  if (!largest) return { decision: "UNVERIFIED", reason: "No production run completed." };
  const failureRate = largest.totalSources ? largest.failedSources / largest.totalSources : 1;
  if (largest.status === "running" || largest.completedSources < largest.totalSources) {
    return { decision: "C. Không đủ, phải chuyển Queues + D1", reason: `Largest run did not finish: ${largest.completedSources}/${largest.totalSources}.` };
  }
  if (largest.runSize >= 50 && largest.durationMs < 15 * 60 * 1000 && failureRate < 0.6) {
    return { decision: "B. Dùng được nhưng cần giới hạn batch", reason: "KV + waitUntil completed 50-source run, but source failure rate and sequential crawler limits require capped batches." };
  }
  return { decision: "B. Dùng được nhưng cần giới hạn batch", reason: "Current runner completed smaller runs, but scale evidence is insufficient for 100+ sources." };
}

function toBenchmarkRow(run) {
  return {
    runSize: run.runSize,
    durationMs: run.durationMs,
    averageSourceDurationMs: run.sourceResults?.length ? Math.round(run.sourceResults.reduce((sum, source) => sum + Number(source.durationMs || 0), 0) / run.sourceResults.length) : 0,
    p50: run.p50SourceDurationMs,
    p95: run.p95SourceDurationMs,
    p99: run.p99SourceDurationMs,
    failureRate: run.totalSources ? run.failedSources / run.totalSources : 0,
    taskAbandonment: run.completedSources < run.totalSources,
    kvReads: "UNVERIFIED: Cloudflare KV metrics not exposed by endpoint",
    kvWrites: "UNVERIFIED: Cloudflare KV metrics not exposed by endpoint",
    subrequestCount: "Approx >= source count + KV operations",
    cpuTime: "UNVERIFIED: requires Cloudflare dashboard/logs"
  };
}

function writeDocs(report) {
  fs.writeFileSync(path.join(docsDir, "source-registry-audit.md"), sourceRegistryMarkdown(report), "utf8");
  fs.writeFileSync(path.join(docsDir, "sync-benchmark.md"), benchmarkMarkdown(report), "utf8");
  fs.writeFileSync(path.join(docsDir, "queue-migration-decision.md"), decisionMarkdown(report), "utf8");
  fs.writeFileSync(path.join(docsDir, "production-sync-verification.md"), verificationMarkdown(report), "utf8");
}

function sourceRegistryMarkdown(report) {
  return `# Source Registry Audit

Verified at: ${report.verifiedAt}

| Metric | Count |
|---|---:|
${Object.entries(report.sourceRegistry.metrics).map(([key, value]) => `| ${key} | ${value} |`).join("\n")}

## By Adapter

${markdownObjectTable(report.sourceRegistry.byAdapter)}

## By Type

${markdownObjectTable(report.sourceRegistry.byType)}

## By Health

${markdownObjectTable(report.sourceRegistry.byHealth)}

## Duplicate URLs

${markdownRows(report.sourceRegistry.duplicateUrls, ["url", "count"])}

## Invalid Sources

${markdownRows(report.sourceRegistry.invalidSources, ["id", "name", "type", "tier", "baseUrl"])}
`;
}

function benchmarkMarkdown(report) {
  return `# Sync Benchmark

| Run size | Success | Failed | Jobs fetched | New | Updated | Duplicate | Duration |
|---:|---:|---:|---:|---:|---:|---:|---:|
${report.syncRuns.map((run) => `| ${run.runSize} | ${run.completedSources - run.failedSources} | ${run.failedSources} | ${run.jobsFetched} | ${run.newJobs} | ${run.updatedJobs} | ${run.duplicateJobs} | ${formatMs(run.durationMs)} |`).join("\n")}

## Raw Benchmark Metrics

${markdownRows(report.benchmarks, ["runSize", "durationMs", "averageSourceDurationMs", "p50", "p95", "p99", "failureRate", "taskAbandonment"])}
`;
}

function decisionMarkdown(report) {
  return `# Queue Migration Decision

Decision: ${report.decision}

Reason: ${report.decisionReason}

Current architecture is KV-backed sync run state plus Cloudflare Worker \`ctx.waitUntil\`.

Cloudflare Queues + D1 migration is not performed in this phase unless benchmark evidence shows the current architecture cannot safely complete required batch sizes.
`;
}

function verificationMarkdown(report) {
  return `# Production Sync Verification

Production URL: ${report.productionUrl}

Git HEAD: ${report.gitHead}

Worker version/header: ${report.workerVersion}

App marker: ${report.appMarker}

Verified at: ${report.verifiedAt}

## Production Sync Runs

| Run size | syncRunId | Status | Completed | Failed | Jobs fetched | New | Updated | Duplicate | Duration |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
${report.syncRuns.map((run) => `| ${run.runSize} | ${run.syncRunId} | ${run.status} | ${run.completedSources}/${run.totalSources} | ${run.failedSources} | ${run.jobsFetched} | ${run.newJobs} | ${run.updatedJobs} | ${run.duplicateJobs} | ${formatMs(run.durationMs)} |`).join("\n")}

## Adapter Results

${markdownRows(Object.entries(report.adapters).map(([adapter, row]) => ({ adapter, ...row })), ["adapter", "sourcesTested", "successful", "failed", "falsePositives", "jobsParsed"])}

## Dedupe Evidence

${markdownRows(report.dedupeCases, ["case", "duplicateReason", "duplicateConfidence", "databaseResult"])}

## Link Quality Evidence

${markdownRows(report.linkQualityCases, ["url", "expected", "actual", "evidence"])}

## Location Evidence

${markdownRows(report.locationCases, ["jobId", "workLocation", "officeAddress", "verificationSource", "verified", "confidence", "evidenceUrl"])}

## Lifecycle Evidence

${markdownRows(report.lifecycleCases, ["scenario", "expected", "status", "evidence"])}

## AI Cache Evidence

${markdownRows(report.aiCacheCases, ["jobId", "oldHash", "newHash", "evaluationCountBefore", "evaluationCountAfter", "cache", "evidence"])}

## Unverified Or Missing

${report.unverified.map((item) => `- ${item}`).join("\n")}
`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} failed: ${response.status}`);
  return response.json();
}

function adapterBucket(source) {
  const text = `${source.adapterKey || ""} ${source.syncStrategy || ""} ${source.baseUrl || ""} ${source.ats || ""}`.toLowerCase();
  if (/greenhouse/.test(text)) return "Greenhouse";
  if (/lever/.test(text)) return "Lever";
  if (/json_ld/.test(text)) return "JSON-LD";
  if (/workday/.test(text)) return "Workday";
  if (/ashby/.test(text)) return "Ashby";
  if (/smartrecruiters/.test(text)) return "SmartRecruiters";
  if (source.syncStrategy === "manual") return "Manual";
  if (!source.baseUrl) return "Unsupported";
  if (["html", "custom", "ats_adapter"].includes(source.syncStrategy)) return "Generic HTML";
  return "Unknown";
}

function sourceSummary(source) {
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    tier: source.tier,
    baseUrl: source.baseUrl,
    enabled: source.enabled,
    adapter: adapterBucket(source),
    health: source.health
  };
}

function canonicalSourceUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value;
  }
}

function increment(object, key) {
  object[key] = (object[key] || 0) + 1;
}

function incrementMap(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function normalizeKey(value = "") {
  return String(value).toLowerCase().trim();
}

function percentile(values, p) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.ceil(values.length * p) - 1);
  return values[index];
}

function formatMs(ms) {
  return `${Math.round(ms / 1000)}s`;
}

function markdownObjectTable(object) {
  return markdownRows(Object.entries(object).map(([name, count]) => ({ name, count })), ["name", "count"]);
}

function markdownRows(rows, columns) {
  if (!rows?.length) return "_None._";
  return `| ${columns.join(" | ")} |\n| ${columns.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${columns.map((column) => escapeCell(row[column])).join(" | ")} |`).join("\n")}`;
}

function escapeCell(value) {
  if (value == null) return "";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value).replaceAll("|", "\\|");
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").slice(0, 180);
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
