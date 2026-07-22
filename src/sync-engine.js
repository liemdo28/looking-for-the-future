const SOURCE_REGISTRY_VERSION = "hcm_official_career_sources_v2";
const SYNC_RUN_PREFIX = "sync_run:v1:";
const SOURCE_RESULT_PREFIX = "source_sync_result:v1:";
const INGESTED_JOB_PREFIX = "ingested_job:v1:";
const RAW_RECORD_PREFIX = "raw_job_record:v1:";
const MATCH_EVAL_PREFIX = "match_eval:v1:";
const SOURCE_STATE_PREFIX = "source_state:v1:";
const ACTIVE_SYNC_KEY = "sync:v1:active-run";
const LAST_SYNC_KEY = "sync:v1:last-completed-run";
const MAX_SOURCES_PER_RUN = 42;
const RESPONSE_SIZE_LIMIT = 800_000;
const USER_AGENT = "AIJobHunter/1.0 (+https://looking-for-the-future.liem-dt0208.workers.dev)";
const ROLE_KEYWORD_RE = /(sales operations?|commercial operations?|business operations?|revenue operations?|sales planning|sales analyst|business analyst|business intelligence|operations analyst|crm|tender analyst|sales support|sales coordinator|operation executive)/i;
const MATCH_MODEL_VERSION = "heuristic-cv-sales-ops-v1";

export async function createSyncRun(request, env, ctx, trigger = "manual") {
  const payload = await request.json().catch(() => ({}));
  const active = await readActiveRun(env);
  if (active && ["queued", "running"].includes(active.status)) {
    return {
      status: "already_running",
      syncRunId: active.id,
      queuedSources: active.queuedSources,
      activeRun: summarizeRun(active)
    };
  }

  const registry = await loadSourceRegistry(env);
  const selectedSources = selectSources(registry.sources, payload);
  const now = new Date().toISOString();
  const run = {
    id: `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    trigger,
    status: "queued",
    requestedBy: trigger === "manual" ? "dashboard" : "scheduler",
    totalSources: selectedSources.length,
    queuedSources: selectedSources.length,
    completedSources: 0,
    failedSources: 0,
    discoveredJobs: 0,
    newJobs: 0,
    updatedJobs: 0,
    duplicateJobs: 0,
    removedJobs: 0,
    startedAt: now,
    completedAt: "",
    errorSummary: "",
    sourceIds: selectedSources.map((source) => source.id),
    registryVersion: registry.version
  };

  await writeJson(env, `${SYNC_RUN_PREFIX}${run.id}`, run, { expirationTtl: 60 * 60 * 24 * 14 });
  await writeJson(env, ACTIVE_SYNC_KEY, { id: run.id, status: run.status, queuedSources: run.queuedSources, startedAt: run.startedAt }, { expirationTtl: 60 * 20 });
  await Promise.all(selectedSources.map((source) => writeSourceResult(env, {
    syncRunId: run.id,
    sourceId: source.id,
    sourceName: source.name,
    status: "queued",
    jobsFetched: 0,
    newJobs: 0,
    updatedJobs: 0,
    duplicates: 0,
    startedAt: "",
    completedAt: "",
    durationMs: 0,
    errorType: "",
    errorMessage: ""
  })));

  ctx?.waitUntil(processSyncRun(env, run.id, selectedSources));
  return {
    syncRunId: run.id,
    status: "queued",
    queuedSources: selectedSources.length
  };
}

export async function createScheduledSync(env, controller, ctx) {
  const request = new Request("https://ai-job-hunter.local/api/sync", {
    method: "POST",
    body: JSON.stringify({ mode: "due_sources", tiers: ["A", "B"], force: false }),
    headers: { "Content-Type": "application/json" }
  });
  return createSyncRun(request, env, ctx, "scheduled");
}

export async function getSyncRun(env, syncRunId) {
  const run = await readJson(env, `${SYNC_RUN_PREFIX}${syncRunId}`);
  if (!run) return null;
  return {
    ...summarizeRun(run),
    progress: {
      completed: run.completedSources,
      total: run.totalSources
    }
  };
}

export async function getSourceResults(env, syncRunId) {
  const rows = await readKvPrefix(env, `${SOURCE_RESULT_PREFIX}${syncRunId}:`);
  return Object.values(rows).sort((a, b) => String(a.sourceName).localeCompare(String(b.sourceName)));
}

export async function cancelSyncRun(env, syncRunId) {
  const run = await readJson(env, `${SYNC_RUN_PREFIX}${syncRunId}`);
  if (!run) return { ok: false, error: "Sync run not found" };
  if (["completed", "partial", "failed", "cancelled"].includes(run.status)) return { ok: true, run: summarizeRun(run) };
  run.status = "cancelled";
  run.completedAt = new Date().toISOString();
  await writeJson(env, `${SYNC_RUN_PREFIX}${run.id}`, run, { expirationTtl: 60 * 60 * 24 * 14 });
  await env.JOB_ACTIONS_KV?.delete(ACTIVE_SYNC_KEY);
  return { ok: true, run: summarizeRun(run) };
}

export async function retryFailedSources(env, syncRunId, ctx) {
  const run = await readJson(env, `${SYNC_RUN_PREFIX}${syncRunId}`);
  if (!run) return { ok: false, error: "Sync run not found" };
  const results = await getSourceResults(env, syncRunId);
  const failedSourceIds = results.filter((row) => row.status === "failed").map((row) => row.sourceId);
  const registry = await loadSourceRegistry(env);
  const sources = registry.sources.filter((source) => failedSourceIds.includes(source.id));
  if (!sources.length) return { ok: true, status: "no_failed_sources", syncRunId };
  const request = new Request("https://ai-job-hunter.local/api/sync", {
    method: "POST",
    body: JSON.stringify({ mode: "source_ids", sourceIds: failedSourceIds, force: true }),
    headers: { "Content-Type": "application/json" }
  });
  return createSyncRun(request, env, ctx, "retry");
}

export async function getSourceRegistry(env) {
  return loadSourceRegistry(env);
}

export async function getLatestIngestedJobs(env) {
  const jobs = Object.values(await readKvPrefix(env, INGESTED_JOB_PREFIX))
    .filter((job) => job && job.score >= 50)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 160)
    .map((job, index) => ({ ...job, rank: index + 101 }));
  const lastRun = await readJson(env, LAST_SYNC_KEY);
  return { jobs, lastRun };
}

export async function runImmediateSourceSnapshot(env) {
  const registry = await loadSourceRegistry(env);
  const selectedSources = selectSources(registry.sources, { tiers: ["A"], force: true }).slice(0, 15);
  const rawJobs = [];
  const sourceResults = [];
  for (const source of selectedSources) {
    const started = Date.now();
    try {
      const records = await fetchRawJobs(source);
      rawJobs.push(...records);
      sourceResults.push({ sourceId: source.id, sourceName: source.name, status: "success", jobsFetched: records.length, durationMs: Date.now() - started });
    } catch (error) {
      sourceResults.push({ sourceId: source.id, sourceName: source.name, status: "failed", jobsFetched: 0, durationMs: Date.now() - started, errorMessage: error.message });
    }
  }
  const normalized = rawJobs.map((raw) => toAppJob(normalizeRawJob(raw), null)).filter(Boolean);
  const deduped = dedupeJobs(normalized).slice(0, 120);
  return {
    checkedAt: new Date().toISOString(),
    sourceRegistryVersion: SOURCE_REGISTRY_VERSION,
    sourcesChecked: selectedSources.length,
    publishableSources: registry.sources.filter((source) => source.enabled).length,
    weeklyCheckSources: registry.sources.filter((source) => source.tier === "C").length,
    liveCrawlSources: selectedSources.length,
    concreteJobs: deduped.filter((job) => job.jobType === "job").length,
    sourceResults,
    jobs: deduped.map((job, index) => ({ ...job, rank: index + 101 }))
  };
}

async function processSyncRun(env, syncRunId, sources) {
  let run = await readJson(env, `${SYNC_RUN_PREFIX}${syncRunId}`);
  if (!run) return;
  run.status = "running";
  await persistRun(env, run);

  const existingJobs = await readKvPrefix(env, INGESTED_JOB_PREFIX);
  const seenCanonicalKeys = new Map(Object.values(existingJobs).map((job) => [job.dedupeKey || canonicalJobKey(job), job.id]));

  for (const source of sources) {
    run = await readJson(env, `${SYNC_RUN_PREFIX}${syncRunId}`);
    if (!run || run.status === "cancelled") break;
    const result = await syncOneSource(env, run.id, source, seenCanonicalKeys);
    run.completedSources += 1;
    run.discoveredJobs += result.jobsFetched;
    run.newJobs += result.newJobs;
    run.updatedJobs += result.updatedJobs;
    run.duplicateJobs += result.duplicates;
    if (result.status === "failed") run.failedSources += 1;
    await persistRun(env, run);
  }

  run = await readJson(env, `${SYNC_RUN_PREFIX}${syncRunId}`);
  if (!run || run.status === "cancelled") return;
  run.completedAt = new Date().toISOString();
  run.status = run.failedSources && run.completedSources ? "partial" : run.failedSources ? "failed" : "completed";
  if (run.failedSources) run.errorSummary = `${run.failedSources} nguồn lỗi`;
  await persistRun(env, run);
  await writeJson(env, LAST_SYNC_KEY, summarizeRun(run), { expirationTtl: 60 * 60 * 24 * 30 });
  await env.JOB_ACTIONS_KV?.delete(ACTIVE_SYNC_KEY);
}

async function syncOneSource(env, syncRunId, source, seenCanonicalKeys) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const base = {
    syncRunId,
    sourceId: source.id,
    sourceName: source.name,
    status: "running",
    jobsFetched: 0,
    newJobs: 0,
    updatedJobs: 0,
    duplicates: 0,
    startedAt,
    completedAt: "",
    responseCode: 0,
    durationMs: 0,
    errorType: "",
    errorMessage: ""
  };
  await writeSourceResult(env, base);
  try {
    if (!source.enabled || source.syncStrategy === "manual" || source.robotsPolicy === "restricted" || source.requiresAuth) {
      const skipped = { ...base, status: "skipped", completedAt: new Date().toISOString(), durationMs: Date.now() - started };
      await writeSourceResult(env, skipped);
      await updateSourceState(env, source, skipped);
      return skipped;
    }
    const rawRecords = await fetchRawJobs(source);
    let newJobs = 0;
    let updatedJobs = 0;
    let duplicates = 0;
    for (const raw of rawRecords) {
      const normalized = normalizeRawJob(raw);
      const appJob = toAppJob(normalized, source);
      if (!appJob) continue;
      const dedupeKey = canonicalJobKey(appJob);
      const duplicateOf = seenCanonicalKeys.get(dedupeKey);
      if (duplicateOf && duplicateOf !== appJob.id) {
        duplicates += 1;
        appJob.duplicateMatch = { duplicateOfJobId: duplicateOf, confidence: 92, reason: "same_title_company_location" };
      } else {
        seenCanonicalKeys.set(dedupeKey, appJob.id);
      }
      const existing = await readJson(env, `${INGESTED_JOB_PREFIX}${appJob.id}`);
      const merged = mergeLifecycle(existing, appJob);
      await writeJson(env, `${INGESTED_JOB_PREFIX}${merged.id}`, merged, { expirationTtl: 60 * 60 * 24 * 90 });
      await writeJson(env, `${MATCH_EVAL_PREFIX}${merged.id}`, merged.matchEvaluation, { expirationTtl: 60 * 60 * 24 * 90 });
      await writeJson(env, `${RAW_RECORD_PREFIX}${source.id}:${merged.id}`, truncateRawRecord(raw), { expirationTtl: 60 * 60 * 24 * 14 });
      if (existing) updatedJobs += 1;
      else newJobs += 1;
    }
    const result = {
      ...base,
      status: "success",
      jobsFetched: rawRecords.length,
      newJobs,
      updatedJobs,
      duplicates,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started
    };
    await writeSourceResult(env, result);
    await updateSourceState(env, source, result);
    return result;
  } catch (error) {
    const result = {
      ...base,
      status: classifyError(error) === "rate_limited" ? "rate_limited" : "failed",
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      errorType: classifyError(error),
      errorMessage: error.message || "Source sync failed"
    };
    await writeSourceResult(env, result);
    await updateSourceState(env, source, result);
    return result;
  }
}

async function fetchRawJobs(source) {
  const adapter = selectAdapter(source);
  if (!adapter) return [];
  return adapter.fetchJobs(source);
}

function selectAdapter(source) {
  const adapters = [greenhouseAdapter, leverAdapter, jsonLdAdapter, genericHtmlAdapter];
  return adapters.find((adapter) => adapter.canHandle(source));
}

const greenhouseAdapter = {
  canHandle(source) {
    return source.adapterKey === "greenhouse";
  },
  async fetchJobs(source) {
    const token = greenhouseToken(source.baseUrl);
    if (!token) return genericHtmlAdapter.fetchJobs(source);
    const response = await safeFetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`, source);
    const payload = await response.json();
    return (payload.jobs || []).filter((job) => ROLE_KEYWORD_RE.test(job.title || "")).slice(0, 12).map((job) => ({
      sourceId: source.id,
      sourceJobId: String(job.id || ""),
      title: job.title,
      companyName: source.name,
      jobUrl: job.absolute_url || source.baseUrl,
      applyUrl: job.absolute_url || "",
      descriptionHtml: job.content || "",
      descriptionText: stripTags(job.content || ""),
      locationText: (job.location && job.location.name) || source.locationScope?.[0] || "",
      employmentType: "",
      workplaceType: "",
      salaryText: "",
      postedAt: job.updated_at || "",
      expiresAt: "",
      sourcePayload: { id: job.id, updated_at: job.updated_at },
      fetchedAt: new Date().toISOString()
    }));
  }
};

const leverAdapter = {
  canHandle(source) {
    return source.adapterKey === "lever";
  },
  async fetchJobs(source) {
    const company = leverCompany(source.baseUrl);
    if (!company) return genericHtmlAdapter.fetchJobs(source);
    const response = await safeFetch(`https://api.lever.co/v0/postings/${company}?mode=json`, source);
    const payload = await response.json();
    return (Array.isArray(payload) ? payload : []).filter((job) => ROLE_KEYWORD_RE.test(job.text || "")).slice(0, 12).map((job) => ({
      sourceId: source.id,
      sourceJobId: job.id || job.hostedUrl || "",
      title: job.text,
      companyName: source.name,
      jobUrl: job.hostedUrl || source.baseUrl,
      applyUrl: job.applyUrl || job.hostedUrl || "",
      descriptionHtml: job.description || "",
      descriptionText: stripTags(job.description || ""),
      locationText: (job.categories && job.categories.location) || source.locationScope?.[0] || "",
      employmentType: (job.categories && job.categories.commitment) || "",
      workplaceType: "",
      salaryText: "",
      postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : "",
      expiresAt: "",
      sourcePayload: { id: job.id, createdAt: job.createdAt },
      fetchedAt: new Date().toISOString()
    }));
  }
};

const jsonLdAdapter = {
  canHandle(source) {
    return ["json_ld", "ats_adapter"].includes(source.syncStrategy);
  },
  async fetchJobs(source) {
    const response = await safeFetch(source.baseUrl, source);
    const body = await limitedText(response);
    const jobs = extractJsonLdJobs(body, source);
    if (jobs.length) return jobs;
    return genericHtmlRecords(body, source);
  }
};

const genericHtmlAdapter = {
  canHandle(source) {
    return ["html", "custom", "ats_adapter"].includes(source.syncStrategy);
  },
  async fetchJobs(source) {
    const response = await safeFetch(source.baseUrl, source);
    const body = await limitedText(response);
    return genericHtmlRecords(body, source);
  }
};

async function loadSourceRegistry(env) {
  const sourceGroups = await loadSources(env);
  const officialSources = sourceGroups
    .filter((group) => /^F[123]\. Official HCMC Career Sources v2/i.test(group.group))
    .flatMap((group) => group.sources.map((source) => officialSourceToRegistry(source, group.group)))
    .filter((source) => source.baseUrl);
  const broadSources = sourceGroups
    .filter((group) => !/^F[123]\. Official HCMC Career Sources v2/i.test(group.group))
    .flatMap((group) => group.sources.map((source) => broadSourceToRegistry(source, group.group)));
  const sources = [...officialSources, ...broadSources];
  return {
    version: SOURCE_REGISTRY_VERSION,
    generatedAt: new Date().toISOString(),
    sources
  };
}

async function loadSources(env) {
  const response = await env.STATIC.fetch(new Request("https://ai-job-hunter.local/data/sources.json", { method: "GET" }));
  if (!response.ok) return [];
  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

function officialSourceToRegistry(value, group) {
  const [company = "", industry = "", ats = "", relevance = "", url = "", note = ""] = String(value).split(" | ").map((item) => item.trim());
  const grade = /Grade\s+([ABC])/i.exec(group)?.[1] || "B";
  const adapterKey = inferAdapterKey(url, ats);
  const strategy = adapterKey ? "ats_adapter" : /rss|feed/i.test(url) ? "rss" : "html";
  const tier = grade === "A" ? "A" : grade === "B" ? "B" : "C";
  return {
    id: `src_${slug(company)}_${slug(adapterKey || "career")}`,
    name: company,
    type: adapterKey ? "ats" : "official_career",
    baseUrl: url,
    enabled: grade !== "C",
    tier,
    syncStrategy: strategy,
    adapterKey,
    locationScope: inferLocationScope(relevance),
    keywords: ["sales operations", "commercial operations", "business operations", "revenue operations", "sales analyst", "crm"],
    syncIntervalMinutes: tier === "A" ? 240 : tier === "B" ? 720 : 4320,
    lastSyncAt: "",
    nextSyncAt: "",
    failureCount: 0,
    lastError: "",
    rateLimitPerMinute: 12,
    timeoutMs: 12_000,
    requiresAuth: false,
    robotsPolicy: "unknown",
    industry,
    ats,
    relevance,
    note,
    grade
  };
}

function broadSourceToRegistry(name, group) {
  const type = /headhunter|recruiter/i.test(group) ? "recruiter" : /job boards/i.test(group) ? "job_board" : /freelance/i.test(group) ? "job_board" : "search_page";
  const isRestricted = /LinkedIn|Google Jobs|Glassdoor|FlexJobs|Fiverr|Upwork/i.test(name);
  return {
    id: `src_${slug(name)}`,
    name,
    type,
    baseUrl: "",
    enabled: false,
    tier: "C",
    syncStrategy: "manual",
    adapterKey: "",
    locationScope: ["Ho Chi Minh City", "Vietnam", "Remote"],
    keywords: ["sales operations", "business operations"],
    syncIntervalMinutes: 4320,
    lastSyncAt: "",
    nextSyncAt: "",
    failureCount: 0,
    lastError: "",
    rateLimitPerMinute: 2,
    timeoutMs: 15_000,
    requiresAuth: false,
    robotsPolicy: isRestricted ? "restricted" : "unknown"
  };
}

function selectSources(sources, payload = {}) {
  const tiers = Array.isArray(payload.tiers) && payload.tiers.length ? new Set(payload.tiers) : new Set(["A", "B"]);
  const sourceIds = Array.isArray(payload.sourceIds) ? new Set(payload.sourceIds) : new Set();
  const mode = payload.mode || "due_sources";
  return sources
    .filter((source) => source.enabled)
    .filter((source) => !sourceIds.size || sourceIds.has(source.id))
    .filter((source) => sourceIds.size || tiers.has(source.tier))
    .filter((source) => mode !== "tier_a_only" || source.tier === "A")
    .filter((source) => source.baseUrl && !source.requiresAuth && source.robotsPolicy !== "restricted")
    .sort((a, b) => tierWeight(a.tier) - tierWeight(b.tier) || a.name.localeCompare(b.name))
    .slice(0, Number(payload.maxSources || MAX_SOURCES_PER_RUN));
}

function normalizeRawJob(raw) {
  const description = stripTags(raw.descriptionText || raw.descriptionHtml || "");
  const canonicalTitle = cleanTitle(raw.title);
  const location = normalizeLocation(raw.locationText || description);
  const workMode = normalizeWorkMode(`${raw.workplaceType || ""} ${raw.locationText || ""} ${description}`);
  const employmentType = normalizeEmploymentType(`${raw.employmentType || ""} ${description}`);
  const jobUrl = canonicalUrl(raw.jobUrl);
  return {
    raw,
    canonicalTitle,
    companyCanonicalName: cleanCompany(raw.companyName),
    workLocation: location,
    officeLocation: undefined,
    workMode,
    employmentType,
    salaryText: raw.salaryText || extractSalary(description),
    postedAt: normalizeDate(raw.postedAt),
    expiresAt: normalizeDate(raw.expiresAt),
    jobUrl,
    applyUrl: canonicalUrl(raw.applyUrl || raw.jobUrl),
    description,
    skills: inferSkills(`${canonicalTitle} ${description}`),
    seniority: inferSeniority(canonicalTitle),
    department: inferDepartment(canonicalTitle),
    linkQuality: evaluateLinkQuality(jobUrl, raw, description),
    locationVerification: verifyLocation(location, raw, description),
    contentHash: hashText([canonicalTitle, raw.companyName, location.raw, workMode, employmentType, description.slice(0, 1200)].join("|"))
  };
}

function toAppJob(normalized, source) {
  if (!normalized || !normalized.canonicalTitle || !normalized.companyCanonicalName || !normalized.jobUrl) return null;
  const matchEvaluation = evaluateMatch(normalized);
  if (matchEvaluation.score < 50) return null;
  const id = `ingested-${slug(normalized.companyCanonicalName)}-${slug(normalized.canonicalTitle)}-${hashText(normalized.jobUrl).slice(0, 8)}`;
  const now = new Date().toISOString();
  const sourceName = source?.name || normalized.raw.companyName || "Job Source";
  return {
    id,
    rank: 0,
    score: matchEvaluation.score,
    title: normalized.canonicalTitle,
    company: normalized.companyCanonicalName,
    location: normalized.workLocation.raw || "Vietnam / cần xác minh",
    workMode: normalized.workMode,
    openStatus: availabilityText(normalized),
    source: sourceName,
    url: normalized.jobUrl,
    applicationLink: normalized.applyUrl || normalized.jobUrl,
    summary: matchEvaluation.recommendation,
    match: matchEvaluation.strengths,
    risks: matchEvaluation.risks,
    applicationAngle: applicationAngle(normalized.canonicalTitle),
    resumeFocus: matchEvaluation.resumeFocus,
    isNew: true,
    verifiedAt: now.slice(0, 10),
    firstSeenAt: now,
    lastSeenAt: now,
    lastCheckedAt: now,
    missingCheckCount: 0,
    availabilityStatus: normalized.expiresAt && new Date(normalized.expiresAt) < new Date() ? "expired" : "active",
    jobType: normalized.linkQuality === "exact_job" ? "job" : "source-candidate",
    sourceRegistry: source?.id || normalized.raw.sourceId,
    sourceGrade: source?.grade || "",
    sourceNote: source?.note || "",
    linkQuality: normalized.linkQuality,
    dedupeKey: canonicalJobKey({ company: normalized.companyCanonicalName, title: normalized.canonicalTitle, location: normalized.workLocation.city || normalized.workLocation.raw }),
    matchEvaluation,
    contentHash: normalized.contentHash,
    locationDetails: {
      jobWorkAddress: normalized.workLocation.raw,
      companyOfficeAddress: "",
      city: normalized.workLocation.city,
      district: normalized.workLocation.district,
      workMode: normalized.workMode,
      locationSource: normalized.locationVerification.source,
      locationSourceLabel: normalized.locationVerification.source,
      verificationStatus: normalized.locationVerification.verified ? "from-job-description" : "unknown",
      officeVerificationStatus: "unknown",
      companyOfficeSource: "unknown",
      locationConfidence: `Trung bình (${normalized.locationVerification.confidence}%)`
    }
  };
}

function mergeLifecycle(existing, incoming) {
  if (!existing) return incoming;
  const unchanged = existing.contentHash === incoming.contentHash && existing.matchEvaluation;
  return {
    ...existing,
    ...incoming,
    firstSeenAt: existing.firstSeenAt || incoming.firstSeenAt,
    lastSeenAt: incoming.lastSeenAt,
    lastCheckedAt: incoming.lastCheckedAt,
    missingCheckCount: 0,
    availabilityStatus: incoming.availabilityStatus || "active",
    score: unchanged ? existing.score : incoming.score,
    matchEvaluation: unchanged ? existing.matchEvaluation : incoming.matchEvaluation,
    isNew: false
  };
}

function evaluateMatch(normalized) {
  const text = `${normalized.canonicalTitle} ${normalized.description} ${normalized.skills.join(" ")}`.toLowerCase();
  let score = 50;
  if (/sales operations?|commercial operations?|revenue operations?/.test(text)) score += 22;
  if (/crm|salesforce|hubspot|customer data/.test(text)) score += 8;
  if (/report|dashboard|kpi|analytics|business intelligence|\bbi\b/.test(text)) score += 9;
  if (/automation|process|workflow|sop|operation/.test(text)) score += 6;
  if (/stakeholder|cross-functional|sales support|coordination/.test(text)) score += 6;
  if (/sql|power bi|python|advanced analytics/.test(text)) score -= 4;
  if (normalized.workMode === "remote" || /ho chi minh|hcm|vietnam/i.test(normalized.workLocation.raw)) score += 3;
  score = Math.max(50, Math.min(95, score));
  const decision = score >= 85 ? "apply" : score >= 70 ? "consider" : "skip";
  return {
    score,
    decision,
    strengths: [
      /sales operations?|commercial operations?/.test(text) ? "Scope gần Sales/Commercial Operations." : "Có tín hiệu operations hoặc coordination phù hợp.",
      /report|dashboard|kpi|analytics/.test(text) ? "Có yếu tố KPI/reporting để tận dụng kinh nghiệm dashboard." : "Có thể nhấn mạnh vận hành quy trình và stakeholder.",
      /crm|salesforce|hubspot/.test(text) ? "CRM/data quality là điểm mạnh trực tiếp." : "Có thể dùng câu chuyện Sales, Finance, Legal coordination."
    ],
    risks: [
      /sql|power bi|advanced analytics/.test(text) ? "Có thể cần SQL/Power BI nâng cao, cần kiểm tra JD kỹ." : "Cần mở JD để xác nhận scope, seniority và yêu cầu kỹ thuật.",
      normalized.linkQuality !== "exact_job" ? "Link chưa phải posting chính xác, không xem là official apply." : "Cần xác nhận job còn mở trước khi nộp."
    ],
    recommendation: decision === "apply" ? "Nộp ngay nếu JD xác nhận location/work mode phù hợp." : decision === "consider" ? "Nên cân nhắc sau khi kiểm tra JD chi tiết." : "Chỉ theo dõi nếu role có scope operations rõ hơn.",
    resumeFocus: ["Sales/Commercial Operations", "CRM data quality", "KPI/reporting", "Stakeholder coordination"].filter((item) => text.includes(item.split("/")[0].toLowerCase()) || item !== "CRM data quality").slice(0, 4),
    modelVersion: MATCH_MODEL_VERSION,
    evaluatedAt: new Date().toISOString()
  };
}

function extractJsonLdJobs(body, source) {
  const jobs = [];
  for (const match of body.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const json = decodeHtml(match[1]);
    const parsed = JSON.parse(json);
    const nodes = Array.isArray(parsed) ? parsed : parsed["@graph"] || [parsed];
    nodes.filter((node) => /JobPosting/i.test(String(node["@type"] || ""))).forEach((node) => {
      const title = node.title || "";
      if (!ROLE_KEYWORD_RE.test(title)) return;
      jobs.push({
        sourceId: source.id,
        sourceJobId: node.identifier?.value || node.identifier || node.url || "",
        title,
        companyName: node.hiringOrganization?.name || source.name,
        jobUrl: absolutizeUrl(node.url || source.baseUrl, source.baseUrl),
        applyUrl: absolutizeUrl(node.url || source.baseUrl, source.baseUrl),
        descriptionHtml: node.description || "",
        descriptionText: stripTags(node.description || ""),
        locationText: node.jobLocation?.address?.addressLocality || node.applicantLocationRequirements?.name || "",
        employmentType: String(node.employmentType || ""),
        workplaceType: String(node.jobLocationType || ""),
        salaryText: "",
        postedAt: node.datePosted || "",
        expiresAt: node.validThrough || "",
        sourcePayload: { identifier: node.identifier, datePosted: node.datePosted },
        fetchedAt: new Date().toISOString()
      });
    });
  }
  return dedupeRawRecords(jobs);
}

function genericHtmlRecords(body, source) {
  const matches = [];
  for (const raw of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const title = decodeText(stripTags(raw[2]));
    if (title.length < 6 || title.length > 140 || !ROLE_KEYWORD_RE.test(title)) continue;
    const url = absolutizeUrl(raw[1], source.baseUrl);
    matches.push({
      sourceId: source.id,
      sourceJobId: url,
      title,
      companyName: source.name,
      jobUrl: url,
      applyUrl: url,
      descriptionHtml: "",
      descriptionText: title,
      locationText: source.locationScope?.[0] || "",
      employmentType: "",
      workplaceType: "",
      salaryText: "",
      postedAt: "",
      expiresAt: "",
      sourcePayload: { anchorText: title },
      fetchedAt: new Date().toISOString()
    });
  }
  return dedupeRawRecords(matches).slice(0, 8);
}

async function safeFetch(input, source) {
  const url = validateCrawlUrl(input, source);
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/json",
      "User-Agent": USER_AGENT
    },
    signal: AbortSignal.timeout(source.timeoutMs || 12_000)
  });
  if ([403, 401].includes(response.status)) throw new Error(`auth_required:${response.status}`);
  if (response.status === 429) throw new Error("rate_limited:429");
  if (response.status === 404 || response.status === 410) throw new Error(`removed:${response.status}`);
  if (!response.ok) throw new Error(`network:${response.status}`);
  return response;
}

async function limitedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > RESPONSE_SIZE_LIMIT) throw new Error("response_too_large");
    chunks.push(value);
  }
  return new TextDecoder().decode(concatUint8(chunks, size));
}

function validateCrawlUrl(input, source) {
  const url = new URL(input);
  const sourceHost = new URL(source.baseUrl).hostname;
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("invalid_url_protocol");
  if (isPrivateHostname(url.hostname)) throw new Error("blocked_private_host");
  if (url.hostname !== sourceHost && !url.hostname.endsWith(`.${sourceHost}`)) throw new Error("blocked_unregistered_host");
  return url.href;
}

function isPrivateHostname(hostname) {
  return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1)/i.test(hostname);
}

function evaluateLinkQuality(url, raw, description = "") {
  if (!url) return "invalid";
  try {
    const parsed = new URL(url);
    const text = `${parsed.pathname} ${parsed.search} ${raw.title || ""} ${description.slice(0, 400)}`.toLowerCase();
    if (/(^|[/?&=_-])(search|keyword|keywords|q|query|listing|list|openings|opportunities)([/?&=_-]|$)|jobs\?|careers\?/.test(text)) return "search_page";
    if (/job|jobs|position|posting|requisition|requisitions|boards|lever|greenhouse|ashby|smartrecruiters|apply|id=|gh_jid|req|jr/.test(text)) return "exact_job";
    if (/career|careers|join-us|work-with-us/.test(text)) return "company_job_page";
    return "unknown";
  } catch {
    return "invalid";
  }
}

function verifyLocation(location, raw, description) {
  const text = `${location.raw} ${description.slice(0, 500)}`;
  if (/remote/i.test(text)) return { value: location.raw || "Remote", source: "job_description", verified: true, confidence: 75, evidenceUrl: raw.jobUrl, verifiedAt: new Date().toISOString() };
  if (/ho chi minh|hcm|hồ chí minh|district|quận|vietnam/i.test(text)) return { value: location.raw, source: "job_description", verified: true, confidence: location.district ? 88 : 72, evidenceUrl: raw.jobUrl, verifiedAt: new Date().toISOString() };
  return { value: location.raw, source: location.raw ? "job_platform" : "unknown", verified: false, confidence: location.raw ? 45 : 0, evidenceUrl: raw.jobUrl, verifiedAt: new Date().toISOString() };
}

function normalizeLocation(raw = "") {
  const text = decodeText(raw).slice(0, 180);
  const lower = text.toLowerCase();
  const city = /hcm|ho chi minh|hồ chí minh|saigon|sài gòn/.test(lower) ? "Ho Chi Minh City" : /vietnam|việt nam/.test(lower) ? "Vietnam" : "";
  const districtMatch = text.match(/(?:District|Quận|Q\.?)\s*([0-9A-Za-zÀ-ỹ]+)/i);
  return {
    raw: text || "Vietnam / cần xác minh",
    city,
    district: districtMatch ? `Quận ${districtMatch[1]}` : "",
    country: /vietnam|việt nam|hcm|ho chi minh|hồ chí minh/i.test(text) ? "Vietnam" : ""
  };
}

function normalizeWorkMode(text = "") {
  if (/remote|work from home|wfh/i.test(text)) return "remote";
  if (/hybrid/i.test(text)) return "hybrid";
  if (/contract|freelance/i.test(text)) return "contract";
  if (/onsite|on-site|office/i.test(text)) return "onsite";
  return "unknown";
}

function normalizeEmploymentType(text = "") {
  if (/intern/i.test(text)) return "internship";
  if (/part.?time/i.test(text)) return "part_time";
  if (/contract|temporary|temp/i.test(text)) return "contract";
  if (/full.?time|permanent/i.test(text)) return "full_time";
  return "unknown";
}

function canonicalJobKey(job) {
  return slug(`${job.company || ""}-${job.title || ""}-${job.location || ""}`);
}

function dedupeJobs(jobs) {
  const map = new Map();
  jobs.forEach((job) => {
    const key = canonicalJobKey(job);
    if (!map.has(key) || Number(job.score) > Number(map.get(key).score)) map.set(key, job);
  });
  return [...map.values()];
}

function dedupeRawRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.sourceId}:${record.sourceJobId || record.jobUrl || record.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function updateSourceState(env, source, result) {
  const previous = await readJson(env, `${SOURCE_STATE_PREFIX}${source.id}`) || {};
  const failureCount = result.status === "success" ? 0 : Number(previous.failureCount || 0) + 1;
  const health = !source.enabled ? "disabled" : result.status === "success" ? "healthy" : result.status === "rate_limited" ? "degraded" : failureCount >= 3 ? "failing" : "degraded";
  await writeJson(env, `${SOURCE_STATE_PREFIX}${source.id}`, {
    sourceId: source.id,
    health,
    failureCount,
    lastSyncAt: result.completedAt,
    jobsFound: result.jobsFetched,
    lastError: result.errorMessage || "",
    updatedAt: new Date().toISOString()
  }, { expirationTtl: 60 * 60 * 24 * 60 });
}

async function readActiveRun(env) {
  const pointer = await readJson(env, ACTIVE_SYNC_KEY);
  if (!pointer?.id) return null;
  const run = await readJson(env, `${SYNC_RUN_PREFIX}${pointer.id}`);
  if (!run) return null;
  const ageMs = Date.now() - new Date(run.startedAt || 0).getTime();
  if (ageMs > 20 * 60 * 1000) {
    await env.JOB_ACTIONS_KV?.delete(ACTIVE_SYNC_KEY);
    return null;
  }
  return run;
}

async function persistRun(env, run) {
  await writeJson(env, `${SYNC_RUN_PREFIX}${run.id}`, run, { expirationTtl: 60 * 60 * 24 * 14 });
  if (["queued", "running"].includes(run.status)) {
    await writeJson(env, ACTIVE_SYNC_KEY, { id: run.id, status: run.status, queuedSources: run.queuedSources, startedAt: run.startedAt }, { expirationTtl: 60 * 20 });
  }
}

function summarizeRun(run) {
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    totalSources: run.totalSources,
    queuedSources: run.queuedSources,
    completedSources: run.completedSources,
    failedSources: run.failedSources,
    discoveredJobs: run.discoveredJobs,
    newJobs: run.newJobs,
    updatedJobs: run.updatedJobs,
    duplicateJobs: run.duplicateJobs,
    removedJobs: run.removedJobs,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    errorSummary: run.errorSummary || ""
  };
}

async function writeSourceResult(env, result) {
  await writeJson(env, `${SOURCE_RESULT_PREFIX}${result.syncRunId}:${result.sourceId}`, result, { expirationTtl: 60 * 60 * 24 * 14 });
}

async function readJson(env, key) {
  if (!env.JOB_ACTIONS_KV) return null;
  return env.JOB_ACTIONS_KV.get(key, "json").catch(() => null);
}

async function writeJson(env, key, value, options = {}) {
  if (!env.JOB_ACTIONS_KV) return;
  await env.JOB_ACTIONS_KV.put(key, JSON.stringify(value), options);
}

async function readKvPrefix(env, prefix) {
  if (!env.JOB_ACTIONS_KV) return {};
  const rows = {};
  let cursor;
  do {
    const page = await env.JOB_ACTIONS_KV.list({ prefix, cursor });
    await Promise.all(page.keys.map(async (item) => {
      const value = await env.JOB_ACTIONS_KV.get(item.name, "json").catch(() => null);
      if (value && typeof value === "object") rows[item.name.slice(prefix.length)] = value;
    }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return rows;
}

function inferAdapterKey(url = "", ats = "") {
  const text = `${url} ${ats}`.toLowerCase();
  if (/greenhouse/.test(text)) return "greenhouse";
  if (/lever/.test(text)) return "lever";
  if (/ashby|workday|smartrecruiters|successfactors|taleo/.test(text)) return "";
  return "";
}

function greenhouseToken(url = "") {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/\/(?:embed\/)?job_board\?for=([^&/]+)/) || parsed.pathname.match(/\/([^/?#]+)$/);
  return parsed.hostname.includes("greenhouse") && match ? match[1] : "";
}

function leverCompany(url = "") {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("lever.co")) return "";
  return parsed.pathname.split("/").filter(Boolean)[0] || "";
}

function inferLocationScope(relevance = "") {
  const scopes = [];
  if (/hcmc|ho chi minh|hồ chí minh/i.test(relevance)) scopes.push("Ho Chi Minh City");
  if (/remote/i.test(relevance)) scopes.push("Remote");
  scopes.push("Vietnam");
  return [...new Set(scopes)];
}

function tierWeight(tier) {
  return tier === "A" ? 1 : tier === "B" ? 2 : 3;
}

function classifyError(error) {
  const message = String(error?.message || error || "");
  if (/timeout|aborted/i.test(message)) return "timeout";
  if (/429|rate_limited/i.test(message)) return "rate_limited";
  if (/403|401|auth_required/i.test(message)) return "auth_required";
  if (/404|410|removed/i.test(message)) return "404";
  if (/private|unregistered|invalid_url/i.test(message)) return "invalid_url";
  if (/json|parse|schema/i.test(message)) return "parser_failed";
  return "network";
}

function truncateRawRecord(raw) {
  return {
    ...raw,
    descriptionHtml: raw.descriptionHtml ? raw.descriptionHtml.slice(0, 4000) : "",
    descriptionText: raw.descriptionText ? raw.descriptionText.slice(0, 4000) : "",
    sourcePayload: raw.sourcePayload ? JSON.stringify(raw.sourcePayload).slice(0, 2000) : undefined
  };
}

function cleanTitle(value = "") {
  return decodeText(value).replace(/\s+/g, " ").trim();
}

function cleanCompany(value = "") {
  return decodeText(value).replace(/\s+/g, " ").trim();
}

function canonicalUrl(value = "") {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function normalizeDate(value = "") {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function inferSkills(text = "") {
  const skills = [];
  if (/crm|salesforce|hubspot/i.test(text)) skills.push("CRM");
  if (/report|dashboard|kpi|analytics/i.test(text)) skills.push("Reporting");
  if (/automation|workflow|process/i.test(text)) skills.push("Automation");
  if (/sql/i.test(text)) skills.push("SQL");
  if (/power bi|business intelligence|\bbi\b/i.test(text)) skills.push("Power BI");
  return skills;
}

function inferSeniority(title = "") {
  if (/senior|lead|manager|head/i.test(title)) return "senior";
  if (/intern|assistant|junior/i.test(title)) return "junior";
  return "mid";
}

function inferDepartment(title = "") {
  if (/sales|commercial|revenue/i.test(title)) return "Sales / Commercial";
  if (/business intelligence|analyst|analytics/i.test(title)) return "Analytics";
  return "Operations";
}

function extractSalary(text = "") {
  const match = text.match(/(\d{1,3}(?:[.,]\d+)?\s*[-–]\s*\d{1,3}(?:[.,]\d+)?\s*(?:triệu|tr|m|million)|\d{1,3}\s*m\s*gross)/i);
  return match ? match[1] : "";
}

function availabilityText(normalized) {
  if (normalized.expiresAt && new Date(normalized.expiresAt) < new Date()) return "Đã hết hạn";
  if (normalized.linkQuality === "exact_job") return "Có thể ứng tuyển";
  return "Đang tuyển";
}

function applicationAngle(role) {
  if (/sales operations|sales analyst|sales planning/i.test(role)) return "Nhấn mạnh Sales/Commercial Operations, CRM data quality, KPI/reporting và phối hợp Sales/Finance/Legal.";
  if (/business intelligence|analyst|crm/i.test(role)) return "Nhấn mạnh KPI/reporting automation, CRM data và stakeholder coordination; kiểm tra kỹ SQL/BI.";
  return "Chỉ nộp nếu JD có operations, reporting, process coordination hoặc commercial support khớp CV.";
}

function hashText(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function concatUint8(chunks, size) {
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return bytes;
}

function stripTags(value = "") {
  return String(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeText(value = "") {
  return decodeHtml(String(value))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value = "") {
  return String(value)
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function absolutizeUrl(value = "", base = "") {
  try {
    return new URL(value, base).href;
  } catch {
    return base;
  }
}

function slug(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "item";
}

export const __syncEngineTest = {
  officialSourceToRegistry,
  selectSources,
  normalizeRawJob,
  toAppJob,
  evaluateLinkQuality,
  verifyLocation,
  canonicalJobKey,
  dedupeJobs,
  mergeLifecycle,
  evaluateMatch,
  extractJsonLdJobs,
  genericHtmlRecords,
  classifyError
};
