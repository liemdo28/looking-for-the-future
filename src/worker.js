import { INDEX_HTML } from "./generated-index.js";

const SYNC_VERSION = "AIJH-OFFICIAL-SOURCE-SYNC-20260722-1910";
const ACTION_STORE_KEY = "actions:v1:shared-dashboard";
const TARGET_ROLE_FAMILIES = [
  "Sales Operations",
  "Commercial Operations",
  "Business Operations",
  "Revenue Operations",
  "Sales Planning",
  "Sales Analyst",
  "CRM",
  "Business Intelligence",
  "Operations Analyst"
];
const LIVE_CRAWL_COMPANIES = new Set([
  "Shopee",
  "Grab",
  "MoMo",
  "Zalo",
  "ZaloPay",
  "VNG",
  "Bosch Group / BGSW",
  "KMS Technology",
  "FPT Software",
  "Accenture",
  "HEINEKEN Vietnam",
  "Sanofi Vietnam",
  "Abbott Vietnam",
  "DKSH",
  "Maersk"
]);
const ROLE_KEYWORD_RE = /(sales operations?|commercial operations?|business operations?|revenue operations?|sales planning|sales analyst|business analyst|business intelligence|operations analyst|crm|tender analyst|sales support)/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const noStoreHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-AIJH-Version": SYNC_VERSION
    };

    if ((url.pathname === "/" || url.pathname === "/index.html") && request.method === "GET") {
      return new Response(INDEX_HTML, {
        headers: {
          ...noStoreHeaders,
          "Content-Type": "text/html; charset=utf-8"
        }
      });
    }

    if (url.pathname === "/api/sync" && request.method === "GET") {
      const sources = await loadSources(request, env);
      const officialCandidates = await buildOfficialSourceCandidates(sources);
      return Response.json({
        checkedAt: new Date().toISOString(),
        syncIntervalMinutes: 60,
        sourceRegistryVersion: "hcm_official_career_sources_v2",
        sourcesChecked: officialCandidates.sourcesChecked,
        publishableSources: officialCandidates.publishableSources,
        weeklyCheckSources: officialCandidates.weeklyCheckSources,
        liveCrawlSources: officialCandidates.liveCrawlSources,
        concreteJobs: officialCandidates.concreteJobs,
        jobs: officialCandidates.jobs
      });
    }

    if (url.pathname === "/api/actions" && request.method === "GET") {
      return Response.json(await readActionStore(env));
    }

    if (url.pathname === "/api/actions" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const result = await updateActionStore(env, payload);
      return Response.json(result);
    }

    const response = await env.STATIC.fetch(request);
    const headers = new Headers(response.headers);
    Object.entries(noStoreHeaders).forEach(([key, value]) => headers.set(key, value));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};

async function readActionStore(env) {
  const empty = {
    ok: true,
    persisted: Boolean(env.JOB_ACTIONS_KV),
    actions: {},
    notes: {},
    updatedAt: ""
  };
  if (!env.JOB_ACTIONS_KV) return empty;
  const stored = await env.JOB_ACTIONS_KV.get(ACTION_STORE_KEY, "json").catch(() => null);
  return {
    ...empty,
    ...(stored && typeof stored === "object" ? stored : {}),
    ok: true,
    persisted: true
  };
}

async function updateActionStore(env, payload) {
  const now = new Date().toISOString();
  const store = await readActionStore(env);
  const next = {
    ok: true,
    persisted: Boolean(env.JOB_ACTIONS_KV),
    actions: { ...(store.actions || {}) },
    notes: { ...(store.notes || {}) },
    updatedAt: now
  };

  if (payload.type === "note") {
    if (!payload.jobId) return { ok: false, persisted: next.persisted, error: "Missing jobId" };
    const value = String(payload.note || "").trim();
    if (value) {
      next.notes[payload.jobId] = {
        note: value,
        updatedAt: payload.updatedAt || now
      };
    } else {
      delete next.notes[payload.jobId];
    }
  } else {
    if (!payload.jobId) return { ok: false, persisted: next.persisted, error: "Missing jobId" };
    const action = {
      ...payload,
      updatedAt: payload.updatedAt || now
    };
    delete action.type;
    if (action.status === "none") delete next.actions[payload.jobId];
    else next.actions[payload.jobId] = action;
  }

  if (env.JOB_ACTIONS_KV) {
    await env.JOB_ACTIONS_KV.put(ACTION_STORE_KEY, JSON.stringify(next));
  }
  return next;
}

async function loadSources(request, env) {
  const sourceUrl = new URL("/data/sources.json", request.url);
  const response = await env.STATIC.fetch(new Request(sourceUrl, { method: "GET" }));
  if (!response.ok) return [];
  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

async function buildOfficialSourceCandidates(sourceGroups) {
  const allSourceRows = sourceGroups
    .filter((group) => /^F[123]\. Official HCMC Career Sources v2/i.test(group.group))
    .flatMap((group) => group.sources.map((source) => parseOfficialSource(source, group.group)))
    .filter((source) => source.url);
  const publishableRows = allSourceRows.filter((source) => source.grade !== "C");

  const liveRows = publishableRows.filter((source) => LIVE_CRAWL_COMPANIES.has(source.company));
  const liveJobs = await crawlOfficialJobs(liveRows);
  const liveIds = new Set(liveJobs.map((job) => `${job.company}::${job.title}`.toLowerCase()));
  const candidateJobs = publishableRows
    .filter((source) => !liveIds.has(`${source.company}::${likelyRoleFamily(source)}`.toLowerCase()))
    .map(toCandidateJob)
    .filter((job) => job.score >= 50)
    .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company))
    .slice(0, 120);
  const jobs = [...liveJobs, ...candidateJobs]
    .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company))
    .slice(0, 140)
    .map((job, index) => ({ ...job, rank: index + 101 }));

  return {
    sourcesChecked: allSourceRows.length,
    publishableSources: publishableRows.length,
    weeklyCheckSources: allSourceRows.filter((source) => source.grade === "C").length,
    liveCrawlSources: liveRows.length,
    concreteJobs: liveJobs.length,
    jobs
  };
}

async function crawlOfficialJobs(sources) {
  const settled = await Promise.allSettled(sources.map((source) => crawlOfficialSource(source)));
  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

async function crawlOfficialSource(source) {
  let response;
  try {
    response = await fetch(source.url, {
      headers: {
        "User-Agent": "AIJobHunter/1.0 source validation",
        "Accept": "text/html,application/xhtml+xml,application/json"
      },
      signal: AbortSignal.timeout(4500)
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  const links = contentType.includes("json") ? extractJsonJobs(body, source) : extractHtmlJobs(body, source);
  return links.slice(0, 2).map((item, index) => toConcreteJob(source, item, index));
}

function extractJsonJobs(body, source) {
  const matches = [];
  for (const raw of body.matchAll(/"title"\s*:\s*"([^"]{6,120})"[\s\S]{0,400}?"(?:url|applyUrl|externalPath)"\s*:\s*"([^"]+)"/gi)) {
    const title = decodeText(raw[1]);
    if (!ROLE_KEYWORD_RE.test(title)) continue;
    matches.push({ title, url: absolutizeUrl(raw[2].replaceAll("\\/", "/"), source.url) });
  }
  return dedupeMatches(matches);
}

function extractHtmlJobs(body, source) {
  const matches = [];
  for (const raw of body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,260}?)<\/a>/gi)) {
    const title = decodeText(stripTags(raw[2]));
    if (title.length < 6 || title.length > 120 || !ROLE_KEYWORD_RE.test(title)) continue;
    matches.push({ title, url: absolutizeUrl(raw[1], source.url) });
  }
  return dedupeMatches(matches);
}

function toConcreteJob(source, item, index) {
  const role = item.title;
  const score = Math.min(86, sourceScore(source, role) + 4 - index);
  return {
    id: `official-crawl-${slug(source.company)}-${slug(role)}`,
    rank: 0,
    score,
    title: role,
    company: source.company,
    location: likelyLocation(source.relevance),
    workMode: "Theo official career page / cần xác minh JD",
    openStatus: "Có thể ứng tuyển",
    source: "Official Career Crawl",
    url: item.url,
    summary: `Tìm thấy title phù hợp trên official career page của ${source.company}.`,
    match: [
      `Title trên nguồn chính thức khớp nhóm ${likelyRoleFamily(source)}.`,
      "Cần mở JD để xác nhận địa điểm HCMC, trạng thái còn mở và scope chi tiết."
    ],
    risks: [
      "Parser nhẹ chỉ xác nhận title/link trên official page, chưa đọc đầy đủ JD.",
      "Không apply nếu JD không ghi rõ location/work mode hoặc có câu hỏi bắt buộc chưa xử lý."
    ],
    applicationAngle: applicationAngle(role),
    isNew: true,
    verifiedAt: new Date().toISOString().slice(0, 10),
    jobType: "job",
    sourceRegistry: "",
    sourceGrade: source.grade,
    sourceNote: source.note
  };
}

function parseOfficialSource(value, group) {
  const [company = "", industry = "", ats = "", relevance = "", url = "", note = ""] = String(value).split(" | ").map((item) => item.trim());
  const grade = /Grade\s+([ABC])/i.exec(group)?.[1] || "B";
  return { company, industry, ats, relevance, url, note, grade };
}

function toCandidateJob(source) {
  const role = likelyRoleFamily(source);
  const score = sourceScore(source, role);
  const location = likelyLocation(source.relevance);
  const id = `official-v2-${slug(source.company)}-${slug(role)}`;
  return {
    id,
    rank: 0,
    score,
    title: `Official career search: ${role}`,
    company: source.company,
    location,
    workMode: "Theo official career page / cần xác minh JD",
    openStatus: "Đang tuyển",
    source: "Official Career v2",
    url: source.url,
    summary: `Nguồn chính thức của ${source.company}; tìm ${role.toLowerCase()} hoặc role operations/commercial tương đương.`,
    match: [
      `Official source scan từ ${source.ats || "career page"}; phù hợp để tìm ${role}.`,
      "Match dựa trên company source, ngành, ATS và từ khóa role; cần mở trang chính thức để xác minh posting cụ thể tại HCMC."
    ],
    risks: [
      "Đây là candidate từ official career source, không phải JD cụ thể đã parse xong.",
      "Chỉ xem là job có thể ứng tuyển sau khi trang chính thức hiển thị posting còn mở, đúng địa điểm và scope."
    ],
    applicationAngle: applicationAngle(role),
    isNew: true,
    verifiedAt: new Date().toISOString().slice(0, 10),
    sourceRegistry: "hcm_official_career_sources_v2",
    jobType: "source-candidate",
    sourceGrade: source.grade,
    sourceNote: source.note
  };
}

function likelyRoleFamily(source) {
  const text = `${source.company} ${source.industry} ${source.ats} ${source.relevance} ${source.note}`.toLowerCase();
  if (/bank|finance|fintech|payment|insurance|credit/.test(text)) return "Commercial Operations / Business Analyst";
  if (/fmcg|retail|beverage|consumer|food|beauty|dairy/.test(text)) return "Sales Operations / Sales Analyst";
  if (/logistics|shipping|supply|warehouse|delivery/.test(text)) return "Operations Analyst / Sales Support";
  if (/software|technology|internet|saas|e-commerce|cloud|big tech/.test(text)) return "Business Operations / Revenue Operations";
  if (/pharma|healthcare|medical|diagnostics/.test(text)) return "Commercial Operations / Tender Analyst";
  if (/consulting|big four|strategy/.test(text)) return "Business Operations / Consulting Analyst";
  return TARGET_ROLE_FAMILIES[hash(source.company) % TARGET_ROLE_FAMILIES.length];
}

function sourceScore(source, role) {
  const text = `${source.company} ${source.industry} ${source.relevance} ${source.note} ${role}`.toLowerCase();
  let score = source.grade === "A" ? 66 : 58;
  if (/hcmc|ho chi minh|hồ chí minh|yes|major hcmc|regional hub|hcmc region/.test(text)) score += 6;
  if (/sales operations|commercial operations|business operations|revenue operations|sales analyst|sales planning|crm/.test(text)) score += 8;
  if (/fmcg|retail|fintech|e-commerce|logistics|pharma|technology|saas/.test(text)) score += 4;
  if (/verify|role-dependent|uncertain|only include/.test(text)) score -= 5;
  return Math.max(50, Math.min(82, score));
}

function likelyLocation(relevance = "") {
  if (/hcmc|ho chi minh|hồ chí minh/i.test(relevance)) return "Ho Chi Minh City / cần xác minh theo JD";
  if (/binh duong|bình dương|dong nai|đồng nai|hưng yên|south/i.test(relevance)) return "HCMC region / cần xác minh theo JD";
  if (/remote/i.test(relevance)) return "Vietnam / Remote possible";
  return "Vietnam / cần xác minh HCMC theo JD";
}

function applicationAngle(role) {
  if (/sales operations|sales analyst|sales planning/i.test(role)) {
    return "Nếu official page có posting phù hợp, nhấn mạnh Sales/Commercial Operations, CRM data quality, KPI/reporting và phối hợp Sales/Finance/Legal.";
  }
  if (/business intelligence|analyst|crm/i.test(role)) {
    return "Nếu JD yêu cầu analyst/reporting, nhấn mạnh kinh nghiệm KPI/reporting automation, CRM data và stakeholder coordination; kiểm tra kỹ yêu cầu SQL/BI.";
  }
  return "Chỉ nộp nếu JD cụ thể có phần operations, reporting, process coordination hoặc commercial support khớp CV.";
}

function slug(value = "") {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 64) || "source";
}

function hash(value = "") {
  return [...value].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function stripTags(value = "") {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeText(value = "") {
  return value
    .replace(/\\u0026/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function absolutizeUrl(value = "", base = "") {
  try {
    return new URL(value, base).href;
  } catch {
    return base;
  }
}

function dedupeMatches(matches) {
  const seen = new Set();
  return matches.filter((item) => {
    const key = `${item.title}::${item.url}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
