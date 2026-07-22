import { INDEX_HTML } from "./generated-index.js";

const SYNC_VERSION = "AIJH-OFFICIAL-SOURCE-SYNC-20260722-1820";
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
      const officialCandidates = buildOfficialSourceCandidates(sources);
      return Response.json({
        checkedAt: new Date().toISOString(),
        syncIntervalMinutes: 60,
        sourceRegistryVersion: "hcm_official_career_sources_v2",
        sourcesChecked: officialCandidates.sourcesChecked,
        publishableSources: officialCandidates.publishableSources,
        weeklyCheckSources: officialCandidates.weeklyCheckSources,
        jobs: officialCandidates.jobs
      });
    }

    if (url.pathname === "/api/actions" && request.method === "POST") {
      const action = await request.json().catch(() => ({}));
      return Response.json({
        ok: true,
        action: {
          ...action,
          updatedAt: action.updatedAt || new Date().toISOString()
        }
      });
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

async function loadSources(request, env) {
  const sourceUrl = new URL("/data/sources.json", request.url);
  const response = await env.STATIC.fetch(new Request(sourceUrl, { method: "GET" }));
  if (!response.ok) return [];
  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload : [];
}

function buildOfficialSourceCandidates(sourceGroups) {
  const allSourceRows = sourceGroups
    .filter((group) => /^F[123]\. Official HCMC Career Sources v2/i.test(group.group))
    .flatMap((group) => group.sources.map((source) => parseOfficialSource(source, group.group)))
    .filter((source) => source.url);
  const publishableRows = allSourceRows.filter((source) => source.grade !== "C");

  const jobs = publishableRows
    .map(toCandidateJob)
    .filter((job) => job.score >= 50)
    .sort((a, b) => b.score - a.score || a.company.localeCompare(b.company))
    .slice(0, 120)
    .map((job, index) => ({ ...job, rank: index + 101 }));

  return {
    sourcesChecked: allSourceRows.length,
    publishableSources: publishableRows.length,
    weeklyCheckSources: allSourceRows.filter((source) => source.grade === "C").length,
    jobs
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
