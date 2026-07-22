const APP_VERSION = "AIJH-FINAL-POLISH-20260722-1705";
const AI_LOCATION_DISCLAIMER = "Địa chỉ này do AI tổng hợp từ thông tin công khai và có thể không phải địa điểm làm việc chính xác. Hãy kiểm tra lại trong JD hoặc website chính thức.";
const AI_CONTENT_DISCLAIMER = "AI có thể sai. Hãy kiểm tra JD và nguồn chính thức trước khi nộp.";
const APPROVED_RESUMES = {
  "cindy-sales-ops-resume": "Cindy Sales Ops Resume"
};
const BLACKLISTED_COMPANIES = [];
const ICONS = {
  "map-pin": `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 4.8-8 12-8 12S4 14.8 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="3"></circle></svg>`
};

const state = {
  jobs: [],
  sources: [],
  actions: readActions(),
  view: initialView(),
  matchFilter: "all",
  recordTypeFilter: "real",
  quickFilter: "all",
  qualityFilters: new Set(),
  locationFilter: "all",
  workModeFilter: "all",
  sourceFilter: "all",
  query: "",
  sortBy: "score",
  pageSize: 20,
  currentPage: 1,
  loadState: "loading",
  jobsError: "",
  sourcesError: "",
  newJobsFound: 0,
  lastSyncAt: localStorage.getItem("lastSyncAt") || "",
  settings: readSettings(),
  reviewJobId: ""
};

const syncIntervalMs = 60 * 60 * 1000;
let searchDebounceTimer = 0;
const els = {
  list: document.querySelector("#jobList"),
  kpiCards: [...document.querySelectorAll(".kpi-card")],
  quickFilterButtons: [...document.querySelectorAll("[data-quick-filter]")],
  activeFilterCount: document.querySelector("#activeFilterCount"),
  tabs: [...document.querySelectorAll(".primary-tabs .tab")],
  search: document.querySelector("#searchBox"),
  recordTypeFilter: document.querySelector("#recordTypeFilter"),
  matchFilter: document.querySelector("#matchFilter"),
  locationFilter: document.querySelector("#locationFilter"),
  workModeFilter: document.querySelector("#workModeFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  sort: document.querySelector("#sortBy"),
  pageSize: document.querySelector("#pageSize"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  pageInfo: document.querySelector("#pageInfo"),
  resultBreadcrumb: document.querySelector("#resultBreadcrumb"),
  resultContextDetail: document.querySelector("#resultContextDetail"),
  syncNow: document.querySelector("#syncNow"),
  syncStatus: document.querySelector("#syncStatus"),
  inboxCount: document.querySelector("#inboxCount"),
  excellentCount: document.querySelector("#excellentCount"),
  pipelineCount: document.querySelector("#pipelineCount"),
  newFoundCount: document.querySelector("#newFoundCount"),
  recommendationPanel: document.querySelector("#recommendationPanel"),
  recommendationText: document.querySelector("#recommendationText"),
  sourceGroups: document.querySelector("#sourceGroups"),
  sourceCount: document.querySelector("#sourceCount"),
  officialLinkCount: document.querySelector("#officialLinkCount"),
  verifiedLocationCount: document.querySelector("#verifiedLocationCount"),
  aiLocationCount: document.querySelector("#aiLocationCount"),
  salaryAvailableCount: document.querySelector("#salaryAvailableCount"),
  autoApplyThreshold: document.querySelector("#autoApplyThreshold"),
  approvedResume: document.querySelector("#approvedResume"),
  cityPreference: document.querySelector("#cityPreference"),
  workModePreference: document.querySelector("#workModePreference"),
  reviewDialog: document.querySelector("#jobDetailDialog"),
  dialogEyebrow: document.querySelector("#dialogEyebrow"),
  reviewTitle: document.querySelector("#reviewTitle"),
  drawerMeta: document.querySelector("#drawerMeta"),
  reviewContent: document.querySelector("#reviewContent"),
  reviewOpenLink: document.querySelector("#reviewOpenLink"),
  confirmAutoApply: document.querySelector("#confirmAutoApply")
};

init();

async function init() {
  bindEvents();
  renderSettings();
  render();
  await syncJobs();
  setInterval(syncJobs, syncIntervalMs);
}

function bindEvents() {
  syncActiveTab();
  els.kpiCards.forEach((card) => {
    card.addEventListener("click", () => applyKpiShortcut(card.dataset.kpi));
    card.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      applyKpiShortcut(card.dataset.kpi);
    });
  });

  els.quickFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.quickFilter;
      if (state.qualityFilters.has(filter)) state.qualityFilters.delete(filter);
      else state.qualityFilters.add(filter);
      state.currentPage = 1;
      render();
    });
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setView(tab.dataset.view);
      state.quickFilter = "all";
      state.currentPage = 1;
      render();
    });
  });

  els.recordTypeFilter.addEventListener("change", (event) => {
    state.recordTypeFilter = event.target.value;
    state.quickFilter = "all";
    state.currentPage = 1;
    render();
  });

  els.matchFilter.addEventListener("change", (event) => {
    state.matchFilter = event.target.value;
    state.quickFilter = "all";
    state.currentPage = 1;
    render();
  });

  els.locationFilter.addEventListener("change", (event) => {
    state.locationFilter = event.target.value;
    state.quickFilter = "all";
    state.currentPage = 1;
    render();
  });

  els.workModeFilter.addEventListener("change", (event) => {
    state.workModeFilter = event.target.value;
    state.quickFilter = "all";
    state.currentPage = 1;
    render();
  });

  els.sourceFilter.addEventListener("change", (event) => {
    state.sourceFilter = event.target.value;
    state.quickFilter = "all";
    state.currentPage = 1;
    render();
  });

  els.search.addEventListener("input", (event) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      state.query = event.target.value.trim().toLowerCase();
      state.currentPage = 1;
      render();
    }, 180);
  });

  els.sort.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    state.currentPage = 1;
    render();
  });

  els.pageSize.addEventListener("change", (event) => {
    state.pageSize = Number(event.target.value);
    state.currentPage = 1;
    render();
  });

  els.prevPage.addEventListener("click", () => {
    state.currentPage = Math.max(1, state.currentPage - 1);
    render();
  });

  els.nextPage.addEventListener("click", () => {
    state.currentPage += 1;
    render();
  });

  els.syncNow.addEventListener("click", syncJobs);

  [els.autoApplyThreshold, els.approvedResume, els.cityPreference, els.workModePreference].forEach((input) => {
    input.addEventListener("change", () => {
      state.settings = {
        autoApplyThreshold: els.autoApplyThreshold.value,
        approvedResume: els.approvedResume.value,
        cityPreference: els.cityPreference.value,
        workModePreference: els.workModePreference.value
      };
      persistSettings();
      render();
    });
  });

  els.confirmAutoApply.addEventListener("click", confirmAutoApply);
}

async function syncJobs() {
  els.syncNow.disabled = true;
  state.loadState = state.jobs.length ? "refreshing" : "loading";
  state.jobsError = "";
  state.sourcesError = "";
  renderSyncState();
  render();

  try {
    const [jobsResult, sourcesResult] = await Promise.allSettled([
      fetchJson("./data/jobs.json"),
      fetchJson("./data/sources.json")
    ]);

    if (jobsResult.status === "fulfilled") {
      const remoteJobs = await fetchRemoteJobs();
      const previousIds = new Set(state.jobs.map((job) => job.id));
      state.jobs = mergeJobs(jobsResult.value, remoteJobs).filter(isValidJob).filter((job) => job.score >= 50);
      const newConcreteJobs = state.jobs.filter((job) => job.isNew && !isSourceCandidate(job) && !previousIds.has(job.id));
      state.newJobsFound = newConcreteJobs.length || state.jobs.filter((job) => job.isNew && !isSourceCandidate(job)).length;
    } else {
      state.jobsError = jobsResult.reason?.message || "Could not load data/jobs.json";
    }

    if (sourcesResult.status === "fulfilled") {
      state.sources = Array.isArray(sourcesResult.value) ? sourcesResult.value : [];
    } else {
      state.sourcesError = sourcesResult.reason?.message || "Could not load data/sources.json";
    }

    state.loadState = state.jobsError ? "failed" : "loaded";
    state.lastSyncAt = new Date().toISOString();
    localStorage.setItem("lastSyncAt", state.lastSyncAt);
  } catch (error) {
    state.loadState = "failed";
    state.jobsError = error?.message || "Could not load production data";
    console.error(error);
  } finally {
    els.syncNow.disabled = false;
    renderSourceFilter();
    renderSources();
    render();
  }
}

async function fetchRemoteJobs() {
  try {
    const response = await fetch("./api/sync", {
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.jobs) ? payload.jobs : [];
  } catch {
    return [];
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot load ${url} (${response.status})`);
  return response.json();
}

function mergeJobs(localJobs, remoteJobs) {
  const map = new Map();
  [...asArray(localJobs), ...asArray(remoteJobs)].forEach((job) => {
    if (!job || typeof job !== "object") return;
    const id = job.id || makeId(job);
    map.set(id, normalizeJob({ ...job, id }));
  });
  return [...map.values()];
}

function normalizeJob(job) {
  return {
    ...job,
    locationDetails: normalizeLocationDetails(job),
    mandatoryQuestions: asArray(job.mandatoryQuestions),
    requiredDocuments: asArray(job.requiredDocuments),
    applicationLink: job.applicationLink || job.url,
    firstSeen: job.firstSeen || job.verifiedAt || "",
    lastChecked: job.lastChecked || job.verifiedAt || "2026-07-22",
    confidence: confidenceLabel(job.confidence ?? confidenceScore(job, "match")),
    locationConfidence: confidenceLabel(job.locationConfidence ?? confidenceScore(job, "location")),
    sourceConfidence: confidenceLabel(job.sourceConfidence ?? confidenceScore(job, "source")),
    applicationConfidence: confidenceLabel(job.applicationConfidence ?? confidenceScore(job, "application")),
    dataQualityStatus: dataQualityStatus(job)
  };
}

function isSourceCandidate(job) {
  return job.jobType === "source-candidate" || Boolean(job.sourceRegistry) || /^Official career search:/i.test(job.title || "");
}

function dataQualityStatus(job) {
  if (!isActiveJob(job)) return "expired";
  if (isGenericListingUrl(job.url)) return "generic-url";
  if (!job.openStatus) return "unknown";
  return "active";
}

function makeId(job) {
  return `${job.company || ""}-${job.title || ""}-${job.url || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isValidJob(job) {
  return Boolean(job && job.id && job.title && job.company && job.url && Number.isFinite(Number(job.score)));
}

function render() {
  renderSummary();
  syncActiveKpi();
  syncQuickFilters();
  renderQualitySummary();
  renderRecommendation();
  renderSyncState();

  if (state.loadState === "loading" && !state.jobs.length) {
    renderPagination(0, 1);
    els.list.innerHTML = stateMessage("Đang tải", "Đang tải job và nguồn từ production...", "loading");
    return;
  }

  if (state.loadState === "failed" && !state.jobs.length) {
    renderPagination(0, 1);
    els.list.innerHTML = stateMessage("Không tải được dữ liệu", state.jobsError || "Không tải được danh sách job.", "error");
    return;
  }

  if (state.loadState === "loaded" && !state.jobs.length) {
    renderPagination(0, 1);
    els.list.innerHTML = stateMessage("Chưa có job trong dữ liệu", "data/jobs.json và API đồng bộ chưa trả về job hợp lệ.", "empty-db");
    return;
  }

  const jobs = filteredJobs();
  const totalPages = Math.max(1, Math.ceil(jobs.length / state.pageSize));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * state.pageSize;
  const visibleJobs = jobs.slice(start, start + state.pageSize);
  renderPagination(jobs.length, totalPages);
  renderResultContext(jobs.length);
  els.list.innerHTML = "";

  if (!visibleJobs.length) {
    els.list.innerHTML = noMatchState();
    bindEmptyStateActions();
    return;
  }

  visibleJobs.forEach((job) => renderJob(job));
}

function renderJob(job) {
  if (!isValidJob(job)) return;

  const card = createJobCard();
  const action = getAction(job.id);
  const status = getStatus(job.id);
  const match = matchLabel(job.score);

  card.dataset.jobId = job.id;
  card.dataset.status = status;
  card.tabIndex = 0;
  card.setAttribute("aria-label", `Mở phân tích chi tiết ${toTitleCase(job.title)} tại ${job.company}`);
  card.querySelector(".rank").textContent = `#${job.rank || "-"}`;
  card.querySelector(".ai-label").textContent = match.label;
  card.querySelector(".score").textContent = `${job.score}%`;
  card.querySelector(".score").setAttribute("aria-label", `Điểm phù hợp ${job.score} phần trăm`);
  card.querySelector(".pipeline-status").textContent = statusLabel(status, action);
  card.querySelector(".pipeline-status").classList.add(`status-${status}`);
  card.querySelector(".job-title").textContent = toTitleCase(job.title);
  card.querySelector(".company").textContent = job.company;
  card.querySelector(".location-main").textContent = displayAddress(job.locationDetails);
  card.querySelector(".location-meta").textContent = locationCardMeta(job.locationDetails);
  const locationBadge = card.querySelector(".location-badge");
  locationBadge.textContent = locationStatusLabel(job.locationDetails);
  locationBadge.setAttribute("aria-label", `Trạng thái xác minh địa điểm: ${locationStatusLabel(job.locationDetails)}`);
  locationBadge.classList.add(`location-${job.locationDetails.verificationStatus}`);
  card.querySelector(".source-badge").textContent = job.source || "Source";
  card.querySelector(".record-type-badge").textContent = isSourceCandidate(job) ? "Nguồn official" : "Job thật";
  card.querySelector(".record-type-badge").classList.toggle("is-source", isSourceCandidate(job));
  card.querySelector(".open-status").textContent = recencyLabel(job);
  card.querySelector(".salary").textContent = salaryLabel(job);
  card.querySelector(".link-warning").textContent = linkQualityWarning(linkQuality(job.url));
  card.querySelector(".link-quality").textContent = linkQualityBadge(linkQuality(job.url));
  card.querySelector(".summary-text").innerHTML = aiSummaryHtml(job);
  card.querySelector(".ai-disclaimer").textContent = "✨ AI phân tích • Kiểm tra lại trước khi nộp";
  renderStageRail(card.querySelector(".stage-rail"), status);

  renderActions(card.querySelector(".actions"), job, status);
  renderInternalActions(card.querySelector(".internal-actions"), job, status);
  card.addEventListener("click", (event) => {
    if (event.target.closest("button, a, summary, details, select, input")) return;
    openJobDetail(job);
  });
  card.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    if (event.target !== card) return;
    event.preventDefault();
    openJobDetail(job);
  });

  els.list.appendChild(card);
}

function createJobCard() {
  const card = document.createElement("article");
  card.className = "job-card";
  card.innerHTML = `
    <div class="ai-row">
      <div>
        <span class="ai-label"></span>
        <strong class="score"></strong>
      </div>
      <span class="pipeline-status"></span>
    </div>
    <div class="job-head">
      <span class="rank"></span>
      <h3><span class="job-title"></span></h3>
      <p class="company-line">
        <span class="company"></span>
      </p>
      <div class="location-block">
        <div class="location-pin" aria-hidden="true">${icon("map-pin")}</div>
        <div>
          <p class="location-main"></p>
          <p class="location-meta"></p>
        </div>
        <span class="location-badge"></span>
      </div>
      <p class="source-line">
        <span class="source-badge"></span>
        <span class="record-type-badge"></span>
        <span class="dot">·</span>
        <span class="open-status"></span>
        <span class="dot">·</span>
        <span class="salary"></span>
      </p>
      <p class="link-warning"></p>
    </div>
    <div class="stage-rail" aria-label="Pipeline stage"></div>
    <div class="ai-summary">
      <strong>✨ Gợi ý từ AI</strong>
      <p class="summary-text"></p>
      <p class="ai-disclaimer"></p>
    </div>
    <div class="actions" aria-label="Job actions"></div>
    <p class="link-quality"></p>
    <div class="card-footer">
      <div class="internal-actions"></div>
    </div>
  `;
  return card;
}

function renderActions(container, job, status) {
  container.innerHTML = "";

  if (["none", "interested", "later"].includes(status)) {
    addLink(container, applicationLinkLabel(job), job.url, linkQuality(job.url));
    addButton(container, "Quan tâm", "interested", job);
    return;
  }

  addLink(container, applicationLinkLabel(job), job.url, linkQuality(job.url));

  if (status === "applied") {
    addButton(container, "Chuyển sang phỏng vấn", "interview", job);
    addButton(container, "Đánh dấu nhận offer", "offer", job);
    addButton(container, "Từ chối", "rejected", job);
    return;
  }

  if (status === "interview") {
    addButton(container, "Đánh dấu nhận offer", "offer", job);
    addButton(container, "Từ chối", "rejected", job);
    return;
  }

  if (status === "offer") {
    addButton(container, "Chấp nhận", "hired", job);
    addButton(container, "Từ chối", "rejected", job);
    return;
  }

  if (status === "hired") {
    addButton(container, "Lưu trữ", "archived", job);
    return;
  }

  addButton(container, "Khôi phục", "none", job);
}

function renderStageRail(container, status) {
  if (!container) return;
  const stages = ["interested", "applied", "interview", "offer", "archived"];
  const stageStatus = status === "rejected" ? "archived" : status;
  if (!stages.includes(stageStatus)) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }
  const activeIndex = stages.indexOf(stageStatus);
  container.hidden = false;
  container.innerHTML = stages
    .map((stage, index) => `<span class="${index <= activeIndex ? "done" : ""} ${index === activeIndex ? "current" : ""}">${escapeHtml(stageShortLabel(stage))}</span>`)
    .join("");
}

function stageShortLabel(stage) {
  const labels = {
    interested: "Interested",
    applied: "Applied",
    interview: "Interview",
    offer: "Offer",
    archived: "Archived"
  };
  return labels[stage] || stage;
}

function renderInternalActions(container, job, status) {
  container.innerHTML = "";
  if (["none", "interested", "later"].includes(status)) {
    addOverflow(container, [
      [applicationLinkLabel(job), "open-link"],
      ["Để sau", "later"],
      ["Không phù hợp", "rejected"],
      ["Đánh dấu đã nộp", "applied"],
      ["Sao chép link", "copy-link"],
      ["Lưu trữ", "archived"]
    ], job);
    return;
  }
  if (["applied", "interview", "rejected"].includes(status)) {
    addOverflow(container, [["Lưu trữ", "archived"]], job);
    return;
  }
  if (["archived", "offer", "hired"].includes(status)) {
    addOverflow(container, [["Khôi phục về Inbox", "none"]], job);
  }
}

function addLink(container, label, url, quality = linkQuality(url)) {
  if (quality === "invalid") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Link không hợp lệ";
    button.disabled = true;
    button.className = "unsafe-link";
    container.appendChild(button);
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  if (["listing_page", "search_page", "unknown"].includes(quality)) {
    link.classList.add("unsafe-link");
    link.title = quality === "unknown" ? "Chưa xác minh chất lượng link." : "Link này là trang search/listing, chưa phải URL job cụ thể.";
  }
  container.appendChild(link);
}

function addButton(container, label, action, job) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (action === "review-application") {
    button.className = "prepare-button";
    button.addEventListener("click", () => openJobDetail(job));
  } else if (action === "open-link") {
    button.addEventListener("click", () => window.open(job.url, "_blank", "noopener"));
  } else if (action === "copy-link") {
    button.addEventListener("click", () => {
      navigator.clipboard?.writeText(job.url).then(() => {}).catch(() => {});
    });
  } else {
    button.addEventListener("click", () => setAction(job.id, action, job.source));
  }
  container.appendChild(button);
}

function addOverflow(container, actions, job) {
  const details = document.createElement("details");
  details.className = "overflow-menu";
  const summary = document.createElement("summary");
  summary.textContent = "Thêm";
  details.appendChild(summary);
  actions.forEach(([label, action]) => addButton(details, label, action, job));
  container.appendChild(details);
}

function initialView() {
  const requested = sessionStorage.getItem("jobHunterView");
  return ["inbox", "pipeline", "archive"].includes(requested) ? requested : "inbox";
}

function setView(view) {
  state.view = ["inbox", "pipeline", "archive"].includes(view) ? view : "inbox";
  sessionStorage.setItem("jobHunterView", state.view);
  syncActiveTab();
}

function syncActiveTab() {
  els.tabs.forEach((tab) => {
    const active = tab.dataset.view === state.view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function applyKpiShortcut(kind) {
  state.currentPage = 1;
  state.quickFilter = "all";
  state.recordTypeFilter = "real";
  state.qualityFilters.clear();
  state.locationFilter = "all";
  state.workModeFilter = "all";
  state.sourceFilter = "all";

  if (kind === "high-priority") {
    setView("inbox");
    state.matchFilter = "excellent";
  } else if (kind === "following") {
    setView("pipeline");
    state.matchFilter = "all";
  } else if (kind === "today") {
    setView("inbox");
    state.matchFilter = "all";
    state.quickFilter = "today";
  } else {
    setView("inbox");
    state.matchFilter = "all";
  }

  syncFilterControls();
  render();
  scrollToFirstResult();
}

function syncFilterControls() {
  els.recordTypeFilter.value = state.recordTypeFilter;
  els.matchFilter.value = state.matchFilter;
  els.locationFilter.value = state.locationFilter;
  els.workModeFilter.value = state.workModeFilter;
  els.sourceFilter.value = state.sourceFilter;
}

function syncQuickFilters() {
  if (els.activeFilterCount) {
    els.activeFilterCount.textContent = `Bộ lọc (${state.qualityFilters.size})`;
  }
  els.quickFilterButtons.forEach((button) => {
    const active = state.qualityFilters.has(button.dataset.quickFilter);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function focusJob(job) {
  const status = getStatus(job.id);
  if (shouldShowInInbox(job)) setView("inbox");
  else if (["applied", "interview", "offer", "hired"].includes(status)) setView("pipeline");
  else setView("archive");
  state.currentPage = Math.max(1, Math.ceil((filteredJobs().findIndex((item) => item.id === job.id) + 1) / state.pageSize));
  render();
  requestAnimationFrame(() => {
    const card = document.querySelector(`[data-job-id="${CSS.escape(job.id)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("is-highlighted");
    setTimeout(() => card.classList.remove("is-highlighted"), 1600);
  });
}

function scrollToFirstResult() {
  requestAnimationFrame(() => {
    const card = document.querySelector(".job-card");
    const target = card || document.querySelector(".state-message") || document.querySelector(".result-context");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    if (!card) return;
    card.classList.add("is-highlighted");
    setTimeout(() => card.classList.remove("is-highlighted"), 1600);
  });
}

function viewLabel(view) {
  const labels = { inbox: "Inbox", pipeline: "Theo dõi", archive: "Lưu trữ" };
  return labels[view] || "Inbox";
}

function renderPagination(total, totalPages) {
  const start = total ? (state.currentPage - 1) * state.pageSize + 1 : 0;
  const end = Math.min(total, state.currentPage * state.pageSize);
  els.pageInfo.textContent = `Trang ${state.currentPage}/${totalPages} · ${start}-${end}/${total}`;
  els.prevPage.disabled = state.currentPage <= 1;
  els.nextPage.disabled = state.currentPage >= totalPages;
}

function renderResultContext(total) {
  const label = resultContextLabel(total);
  els.resultBreadcrumb.textContent = `${viewLabel(state.view)} › ${label} (${total})`;
  els.resultContextDetail.textContent = resultContextDetail(label);
}

function resultContextLabel() {
  if (state.view === "pipeline") return "Đang theo dõi";
  if (state.view === "archive") return "Lưu trữ";
  if (state.recordTypeFilter === "source") return "Nguồn official";
  if (state.quickFilter === "today") return "Mới hôm nay";
  if (state.qualityFilters.size) return `Bộ lọc (${state.qualityFilters.size})`;
  if (state.matchFilter === "excellent") return "Ưu tiên cao";
  return "Cần xem";
}

function resultContextDetail(label) {
  const details = {
    "Đang theo dõi": "Các job đang được quan tâm hoặc đã chuyển vào pipeline.",
    "Nguồn official": "Career page chính thức cần mở để xác minh posting cụ thể.",
    "Mới hôm nay": "Job trong Inbox được phát hiện hôm nay.",
    "Ưu tiên cao": "Job trong Inbox có mức phù hợp cao.",
    "Lưu trữ": "Job đã từ chối hoặc lưu trữ.",
    "Cần xem": "Danh sách job trong Inbox đang chờ bạn xem."
  };
  if (label.startsWith("Bộ lọc")) return [...state.qualityFilters].map(quickFilterLabel).join(" · ");
  return details[label] || "Danh sách job theo filter hiện tại.";
}

function quickFilterLabel(filter) {
  const labels = {
    match90: "Match > 90%",
    verified: "Địa chỉ xác thực",
    official: "Link nộp chính thức",
    salary: "Có lương",
    ai: "AI gợi ý",
    missing: "Thiếu thông tin"
  };
  return labels[filter] || "Filter nhanh";
}

function renderSummary() {
  const concreteJobs = state.jobs.filter((job) => !isSourceCandidate(job));
  const inboxJobs = concreteJobs.filter((job) => shouldShowInInbox(job));
  const followingJobs = concreteJobs.filter((job) => ["interested", "applied", "interview", "offer"].includes(getStatus(job.id)));
  const inboxNewJobs = inboxJobs.filter(isNewToday).length;
  els.inboxCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : inboxJobs.length;
  els.excellentCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : inboxJobs.filter((job) => job.score >= 85).length;
  els.pipelineCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : followingJobs.length;
  els.newFoundCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : inboxNewJobs;
}

function renderQualitySummary() {
  const validJobs = state.jobs.filter(isValidJob);
  els.officialLinkCount.textContent = validJobs.filter((job) => ["exact_job", "company_job_page"].includes(linkQuality(job.url))).length;
  els.verifiedLocationCount.textContent = validJobs.filter((job) => ["from-job-description", "official-career", "verified"].includes(job.locationDetails.verificationStatus)).length;
  els.aiLocationCount.textContent = validJobs.filter((job) => job.locationDetails.verificationStatus === "ai-suggested").length;
  els.salaryAvailableCount.textContent = validJobs.filter((job) => salaryLabel(job) !== "Lương chưa rõ").length;
}

function syncActiveKpi() {
  const activeKind = state.view === "pipeline"
    ? "following"
    : state.quickFilter === "today"
      ? "today"
      : state.matchFilter === "excellent"
        ? "high-priority"
        : state.view === "inbox"
          ? "inbox"
          : "";
  els.kpiCards.forEach((card) => {
    const active = card.dataset.kpi === activeKind;
    card.classList.toggle("active", active);
    card.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function renderRecommendation() {
  const inboxJobs = state.jobs.filter((job) => shouldShowInInbox(job) && !isSourceCandidate(job));
  if (!inboxJobs.length || state.loadState !== "loaded") {
    els.recommendationPanel.classList.add("is-hidden");
    els.recommendationText.textContent = "";
    return;
  }

  const best = [...inboxJobs].sort((a, b) => b.score - a.score)[0];
  els.recommendationPanel.classList.remove("is-hidden");
  els.recommendationText.innerHTML = `
    <span>✨ AI ưu tiên hôm nay</span>
    <strong>${escapeHtml(toTitleCase(best.title))} · ${escapeHtml(best.company)} · ${escapeHtml(String(best.score))}% · ${escapeHtml(displayAddress(best.locationDetails))}</strong>
    <button type="button" data-priority-job="${escapeHtml(best.id)}">Xem ngay</button>
  `;
  els.recommendationText.querySelector("[data-priority-job]")?.addEventListener("click", () => focusJob(best));
}

function renderSyncState() {
  els.syncNow.textContent = state.loadState === "loading" || state.loadState === "refreshing" ? "Đang đồng bộ..." : "Đồng bộ job";
  if (state.loadState === "failed") {
    els.syncStatus.textContent = "Đồng bộ lỗi. Thử lại.";
    els.syncStatus.className = "sync-error";
    return;
  }
  els.syncStatus.className = "";
  if (state.loadState === "loading") {
    els.syncStatus.textContent = "Đang tải dữ liệu...";
  } else if (state.loadState === "refreshing") {
    els.syncStatus.textContent = "Đang làm mới dữ liệu...";
  } else {
    els.syncStatus.textContent = `Đồng bộ lần cuối ${state.lastSyncAt ? dateTimeLabel(state.lastSyncAt) : "chưa có"} · ${state.newJobsFound} job mới`;
  }
}

function renderSources() {
  const total = state.sources.reduce((sum, group) => sum + asArray(group.sources).length, 0);
  els.sourceCount.textContent = `${total} nguồn`;
  els.sourceGroups.innerHTML = "";

  if (state.sourcesError) {
    els.sourceGroups.innerHTML = stateMessage("Không tải được nguồn", state.sourcesError, "error");
    return;
  }

  if (!state.sources.length) {
    els.sourceGroups.innerHTML = stateMessage("Chưa có source pool", "data/sources.json chưa có nguồn được cấu hình.", "empty-db");
    return;
  }

  state.sources.forEach((group) => {
    const section = document.createElement("section");
    section.className = "source-group";
    const title = document.createElement("h3");
    title.textContent = group.group;
    section.appendChild(title);
    const list = document.createElement("div");
    list.className = "source-chip-list";
    asArray(group.sources).forEach((source) => {
      const chip = document.createElement("span");
      chip.textContent = source;
      list.appendChild(chip);
    });
    section.appendChild(list);
    els.sourceGroups.appendChild(section);
  });
}

function renderSourceFilter() {
  const current = els.sourceFilter.value || "all";
  const sources = [...new Set(state.jobs.map((job) => job.source).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  els.sourceFilter.innerHTML = `<option value="all">Tất cả nguồn</option>${sources.map((source) => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`).join("")}`;
  els.sourceFilter.value = sources.includes(current) ? current : "all";
  state.sourceFilter = els.sourceFilter.value;
}

function renderSettings() {
  els.autoApplyThreshold.value = state.settings.autoApplyThreshold;
  els.approvedResume.value = state.settings.approvedResume;
  els.cityPreference.value = state.settings.cityPreference;
  els.workModePreference.value = state.settings.workModePreference;
}

function openApplicationReview(job) {
  const status = getStatus(job.id);
  const eligibility = autoApplyEligibility(job, status);
  state.reviewJobId = job.id;
  els.dialogEyebrow.textContent = "Xem hồ sơ nộp";
  els.reviewTitle.textContent = toTitleCase(job.title);
  renderDrawerMeta(job, status);
  els.reviewOpenLink.href = job.url;
  els.confirmAutoApply.disabled = !eligibility.eligible;
  els.reviewContent.innerHTML = reviewHtml(job, eligibility);
  bindDialogActions();
  els.reviewDialog.showModal();
}

function openJobDetail(job) {
  const status = getStatus(job.id);
  const eligibility = autoApplyEligibility(job, status);
  state.reviewJobId = job.id;
  els.dialogEyebrow.textContent = "Phân tích chi tiết";
  els.reviewTitle.textContent = toTitleCase(job.title);
  renderDrawerMeta(job, status);
  els.reviewOpenLink.href = job.url;
  els.confirmAutoApply.disabled = !eligibility.eligible;
  els.reviewContent.innerHTML = detailHtml(job, eligibility);
  bindDialogActions();
  els.reviewDialog.showModal();
}

function renderDrawerMeta(job, status) {
  if (!els.drawerMeta) return;
  const action = getAction(job.id);
  els.drawerMeta.innerHTML = `
    <span>${escapeHtml(job.company)}</span>
    <span>${escapeHtml(String(job.score))}% match</span>
    <span>${escapeHtml(statusLabel(status, action))}</span>
    <span>${escapeHtml(locationStatusLabel(job.locationDetails))}</span>
  `;
}

function bindDialogActions() {
  els.reviewContent.querySelectorAll("[data-copy-detail-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const job = state.jobs.find((item) => item.id === button.dataset.copyDetailPrompt);
      if (job) copyPrompt(job);
    });
  });
}

function confirmAutoApply() {
  const job = state.jobs.find((item) => item.id === state.reviewJobId);
  if (!job) return;
  const eligibility = autoApplyEligibility(job, getStatus(job.id));
  if (!eligibility.eligible) {
    els.reviewContent.innerHTML = reviewHtml(job, eligibility);
    return;
  }
  setAction(job.id, "applied", job.source, {
    resume: selectedResumeName(),
    applicationMethod: "Chuẩn bị hồ sơ",
    submittedAt: new Date().toISOString(),
    locationVerificationStatus: locationStatusLabel(job.locationDetails)
  });
  els.reviewDialog.close();
}

function autoApplyEligibility(job, status) {
  const blockers = [];
  const threshold = state.settings.autoApplyThreshold;
  const location = job.locationDetails;
  const quality = linkQuality(job.url);
  if (threshold === "disabled") blockers.push("Tính năng chuẩn bị hồ sơ đang tắt");
  if (threshold !== "disabled" && Number(job.score) < Number(threshold)) blockers.push(`Match dưới ${threshold}%`);
  if (!["exact_job", "company_job_page"].includes(quality)) blockers.push(linkQualityStatus(quality));
  if (!isActiveJob(job)) blockers.push("Job có thể đã hết hạn");
  if (["applied", "interview", "offer"].includes(status)) blockers.push("Job đã được đánh dấu đã nộp");
  if (!locationMeetsPreferences(location)) blockers.push("Địa điểm hoặc hình thức chưa khớp ưu tiên");
  if (!state.settings.approvedResume || !APPROVED_RESUMES[state.settings.approvedResume]) blockers.push("Thiếu CV đã duyệt");
  if (hasUnresolvedMandatoryQuestions(job)) blockers.push("Có câu hỏi bắt buộc chưa xử lý");
  if (hasMissingRequiredDocuments(job)) blockers.push("Thiếu tài liệu bắt buộc");
  if (hasUnsafeQuestions(job)) blockers.push("Cần rà soát câu hỏi lương/visa/work authorization");
  if (BLACKLISTED_COMPANIES.includes(job.company)) blockers.push("Công ty nằm trong blacklist");
  return { eligible: blockers.length === 0, blockers };
}

function reviewHtml(job, eligibility) {
  const location = job.locationDetails;
  const quality = linkQuality(job.url);
  const questions = asArray(job.mandatoryQuestions);
  const questionList = questions.length
    ? `<ul>${questions.map((question) => `<li>${escapeHtml(question.label || question)}</li>`).join("")}</ul>`
    : "<p>Chưa phát hiện câu hỏi bắt buộc chưa xử lý.</p>";
  const blockers = eligibility.blockers.length
    ? `<div class="review-blockers"><strong>Chưa thể chuẩn bị hồ sơ tự động</strong><ul>${eligibility.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "<div class=\"review-ready\"><strong>Sẵn sàng để bạn kiểm tra</strong><p>Không có rule chặn. Hệ thống chỉ hỗ trợ chuẩn bị và đánh dấu nội bộ, không tự nộp ra website bên ngoài.</p></div>";
  return `
    <div class="review-grid">
      <section>
        <strong>Công việc</strong>
        <p>${escapeHtml(toTitleCase(job.title))}</p>
        <p>${escapeHtml(job.company)} · ${escapeHtml(job.score)}% mức phù hợp</p>
      </section>
      <section>
        <strong>Địa điểm làm việc</strong>
        <p>${escapeHtml(displayAddress(location))}</p>
        <p>${escapeHtml(locationStatusLabel(location))} · ${escapeHtml(location.locationSourceLabel)}</p>
      </section>
      <section>
        <strong>CV đã chọn</strong>
        <p>${escapeHtml(selectedResumeName() || "Chưa chọn CV đã duyệt")}</p>
      </section>
      <section>
        <strong>Câu hỏi bắt buộc</strong>
        ${questionList}
      </section>
    </div>
    ${location.verificationStatus === "ai-suggested" ? `<p class="ai-warning">${escapeHtml(AI_LOCATION_DISCLAIMER)}</p>` : ""}
    <section class="cover-letter">
      <strong>Thư ứng tuyển do AI soạn nháp</strong>
      <p>${escapeHtml(generateCoverLetter(job))}</p>
      <p class="ai-warning">${escapeHtml(AI_CONTENT_DISCLAIMER)}</p>
    </section>
    <div class="location-detail-grid">
      <p><strong>URL ứng tuyển</strong><span>${escapeHtml(job.url)}</span></p>
      <p><strong>Chất lượng link</strong><span>${escapeHtml(linkQualityStatus(quality))}</span></p>
    </div>
    <p class="eligibility-note">Hệ thống hỗ trợ chuẩn bị hồ sơ và theo dõi nội bộ, không tự nộp ra website bên ngoài.</p>
    ${blockers}
  `;
}

function detailHtml(job, eligibility) {
  const action = getAction(job.id);
  const location = job.locationDetails;
  const quality = linkQuality(job.url);
  return `
    <nav class="drawer-tabs" aria-label="Job detail sections">
      <a href="#drawer-overview">Overview</a>
      <a href="#drawer-ai">AI</a>
      <a href="#drawer-location">Location</a>
      <a href="#drawer-resume">Resume</a>
      <a href="#drawer-history">History</a>
    </nav>
    <section class="detail-section" id="drawer-overview">
      <h3>Tổng quan</h3>
      <div class="location-detail-grid">
        <p><strong>Công việc</strong><span>${escapeHtml(toTitleCase(job.title))}</span></p>
        <p><strong>Công ty</strong><span>${escapeHtml(job.company)}</span></p>
        <p><strong>Mức phù hợp</strong><span>${escapeHtml(String(job.score))}%</span></p>
        <p><strong>Trạng thái workflow</strong><span>${escapeHtml(statusLabel(getStatus(job.id), action))}</span></p>
        <p><strong>Lương</strong><span>${escapeHtml(salaryLabel(job))}</span></p>
        <p><strong>Hình thức</strong><span>${escapeHtml(compactWorkMode(location.workMode))}</span></p>
        <p><strong>Nguồn</strong><span>${escapeHtml(sourceNameLabel(job.source))}</span></p>
        <p><strong>Ngày đăng / phát hiện</strong><span>${escapeHtml(recencyLabel(job))}</span></p>
        <p><strong>Kiểm tra lần cuối</strong><span>${escapeHtml(job.lastChecked || "Chưa có")}</span></p>
        <p><strong>Độ mới job</strong><span>${escapeHtml(freshnessStatus(job))}</span></p>
        <p><strong>Chất lượng link</strong><span>${escapeHtml(linkQualityStatus(quality))}</span></p>
      </div>
    </section>
    <section class="detail-section" id="drawer-ai">
      <h3>AI đánh giá</h3>
      <div class="details-grid">
        <div>
          <h4>Điểm mạnh</h4>
          <ul>${shortList(job.match).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
        <div>
          <h4>Missing skills</h4>
          <ul>${skillGapList(job).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
      </div>
      <div class="detail-triplet">
        ${aiSummarySections(job).map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></p>`).join("")}
      </div>
      <div class="location-detail-grid">
        <p><strong>Match confidence</strong><span>${escapeHtml(job.confidence)}</span></p>
        <p><strong>Giả định quan trọng</strong><span>${escapeHtml(importantAssumption(job))}</span></p>
      </div>
      <p class="ai-warning">${escapeHtml(AI_CONTENT_DISCLAIMER)}</p>
    </section>
    <section class="detail-section" id="drawer-location">
      <h3>Địa điểm</h3>
      ${locationDetailHtml(location)}
    </section>
    <section class="detail-section" id="drawer-resume">
      <h3>Hồ sơ nộp</h3>
      <div class="resume-focus detail-focus">${resumeFocus(job).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
      ${reviewHtml(job, eligibility)}
      <div class="location-detail-grid">
        <p><strong>URL chính xác</strong><span>${escapeHtml(job.url)}</span></p>
        <p><strong>Điều kiện chuẩn bị</strong><span>${escapeHtml(eligibility.eligible ? "Đủ điều kiện chuẩn bị hồ sơ" : eligibility.blockers.join("; "))}</span></p>
      </div>
      ${["exact_job", "company_job_page"].includes(quality) ? "" : `<p class="link-warning detail-warning">${escapeHtml(linkQualityWarning(quality))}</p>`}
    </section>
    <section class="detail-section" id="drawer-history">
      <h3>Lịch sử</h3>
      ${historyHtml(job, action)}
    </section>
  `;
}

function generateCoverLetter(job) {
  const focus = resumeFocus(job).join(", ");
  return `Tôi quan tâm đến vị trí ${toTitleCase(job.title)} tại ${job.company}. Kinh nghiệm của tôi phù hợp với ${focus}, đặc biệt ở Sales/Commercial Operations, CRM data quality, KPI reporting, theo dõi contract/billing/payment và phối hợp cross-functional.`;
}

function historyHtml(job, action) {
  const rows = [
    ["First seen", job.firstSeen || job.verifiedAt || "22/07/2026"],
    ["Last checked", job.lastChecked || job.verifiedAt || "22/07/2026"],
    ["Trạng thái hiện tại", statusLabel(getStatus(job.id), action)],
    ["Interested timestamp", action.interestedAt || ""],
    ["Applied timestamp", action.appliedAt || action.submittedAt || ""],
    ["Interview timestamp", action.interviewAt || ""],
    ["Offer timestamp", action.offerAt || ""],
    ["Rejected timestamp", action.rejectedAt || ""],
    ["Archived timestamp", action.archivedAt || ""],
    ["Source changes", asArray(action.sourceChanges).join(" · ")]
  ];
  const visibleRows = rows.map(([label, value]) => [label, value || "Chưa có"]);
  const history = asArray(action.statusHistory);
  return `
    <div class="location-detail-grid">${visibleRows.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(formatHistoryValue(value))}</span></p>`).join("")}</div>
    ${history.length ? `<ul class="status-history">${history.map((item) => `<li>${escapeHtml(statusLabel(item.from, item))} → ${escapeHtml(statusLabel(item.to, item))} · ${escapeHtml(dateTimeLabel(item.at))}</li>`).join("")}</ul>` : `<p class="empty-history">Chưa có lịch sử thay đổi.</p>`}
  `;
}

function formatHistoryValue(value) {
  if (!value || value === "Chưa có") return "Chưa có";
  return /^\d{4}-\d{2}-\d{2}T/.test(value) ? dateTimeLabel(value) : value;
}

function stateMessage(title, detail, type) {
  return `<div class="state-message ${type}">
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(detail)}</p>
  </div>`;
}

function noMatchState() {
  return `<div class="state-message no-match">
    <strong>Không tìm thấy công việc phù hợp.</strong>
    <p>Không có job nào khớp tab, bộ lọc và từ khóa hiện tại.</p>
    <div class="state-actions">
      <button type="button" data-clear-filters>Xóa bộ lọc</button>
      <button type="button" data-go-inbox>Quay về Inbox</button>
    </div>
  </div>`;
}

function bindEmptyStateActions() {
  els.list.querySelector("[data-clear-filters]")?.addEventListener("click", () => {
    state.matchFilter = "all";
    state.recordTypeFilter = "real";
    state.quickFilter = "all";
    state.qualityFilters.clear();
    state.locationFilter = "all";
    state.workModeFilter = "all";
    state.sourceFilter = "all";
    state.query = "";
    els.search.value = "";
    state.currentPage = 1;
    syncFilterControls();
    render();
  });
  els.list.querySelector("[data-go-inbox]")?.addEventListener("click", () => {
    setView("inbox");
    state.matchFilter = "all";
    state.recordTypeFilter = "real";
    state.quickFilter = "all";
    state.qualityFilters.clear();
    state.locationFilter = "all";
    state.workModeFilter = "all";
    state.sourceFilter = "all";
    state.query = "";
    els.search.value = "";
    state.currentPage = 1;
    syncFilterControls();
    render();
  });
}

function locationBucket(location) {
  if (location.verificationStatus === "ai-suggested") return "ai";
  if (location.verificationStatus === "unknown") return "unknown";
  if (location.verificationStatus === "multiple-offices") return "multiple";
  if (location.district || hasDetailedAddress(location.jobWorkAddress)) return "exact";
  return "city";
}

function workModeBucket(mode = "") {
  if (/remote/i.test(mode)) return "remote";
  if (/contract/i.test(mode)) return "contract";
  return "onsite";
}

function locationCardMeta(location) {
  const parts = [locationStatusLabel(location)];
  if (location.verificationStatus === "multiple-offices") {
    parts.push("Cần xác nhận nơi làm việc");
  } else if (!hasDetailedAddress(location.jobWorkAddress)) {
    parts.push("Chưa có địa chỉ chi tiết");
  }
  parts.push(compactWorkMode(location.workMode));
  return parts.filter(Boolean).join(" · ");
}

function companyOfficeLabel(location) {
  return location.companyOfficeAddress || "Chưa xác định địa chỉ văn phòng công ty";
}

function officeSourceLabel(location) {
  if (!location.companyOfficeAddress) return "Chưa có nguồn chính thức";
  return locationSourceLabel(location.companyOfficeSource);
}

function officeVerificationLabel(location) {
  if (location.officeVerificationStatus === "verified") return "✓ Đã xác thực";
  if (location.officeVerificationStatus === "ai-suggested") return "✨ Gợi ý từ AI · Chưa xác thực";
  return "Chưa xác minh";
}

function mapsLink(location) {
  const address = location.companyOfficeAddress || location.jobWorkAddress;
  if (!address || location.verificationStatus === "ai-suggested") return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function hasDetailedAddress(value = "") {
  return /quận|district|d\.?|q\.?|tân phong|tan phong|tân phú|tan phu|củ chi|cu chi|street|đường|phường/i.test(value);
}

function recencyLabel(job) {
  const status = `${job.openStatus || ""}`.trim();
  if (/expired|closed|đã đóng|hết hạn/i.test(status)) return "Có thể đã hết hạn";
  if (!status) return "Cần xác minh";
  return normalizeOpenStatus(status);
}

function freshnessStatus(job) {
  const text = `${job.openStatus || ""} ${job.summary || ""}`;
  if (/expired|closed|inactive|not available|đã đóng|hết hạn/i.test(text)) return "Đã hết hạn";
  const seen = Date.parse(job.firstSeen || job.verifiedAt || "");
  if (!Number.isFinite(seen)) return "Không rõ trạng thái";
  const ageDays = Math.max(0, Math.floor((Date.now() - seen) / 86400000));
  if (ageDays <= 7) return "Mới";
  if (ageDays <= 21) return "Cần kiểm tra";
  if (ageDays <= 45) return "Có thể đã cũ";
  return "Có thể đã hết hạn";
}

function normalizeOpenStatus(status = "") {
  const text = status.trim();
  if (/expired|closed|đã đóng|hết hạn/i.test(text)) return "Đã hết hạn";
  const deadline = text.match(/hạn nộp\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  if (deadline) {
    const [, day, month, year] = deadline;
    const deadlineDate = new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59);
    return deadlineDate >= new Date() ? "Có thể ứng tuyển" : "Đã hết hạn";
  }
  if (/^today$|posted today|new today|hôm nay/i.test(text)) return "Hôm nay";
  if (/apply visible|apply now|ứng tuyển ngay|hiển thị ứng tuyển/i.test(text)) return "Có thể ứng tuyển";
  if (/career page active|search result active|listing active|active\/recent|active/i.test(text)) return "Đang tuyển";
  if (/topcv đăng gần đây|recent|đăng gần đây/i.test(text)) return "Đang tuyển";
  if (/linkedin (similar jobs|listing):?\s*(.+)/i.test(text)) return normalizeOpenStatus(text.replace(/.*linkedin (similar jobs|listing):?\s*/i, "").trim()) || "Kết quả LinkedIn";
  if (/crawled yesterday|yesterday/i.test(text)) return "1 ngày trước";
  if (/last week/i.test(text)) return "1 tuần trước";
  if (/crawled\s+(\d+)\s+days?\s+ago/i.test(text)) return vietnameseAge(Number(text.replace(/.*crawled\s+(\d+)\s+days?\s+ago.*/i, "$1")), "day");
  if (/(\d+)\s+days?\s+ago/i.test(text)) return vietnameseAge(Number(text.replace(/.*?(\d+)\s+days?\s+ago.*/i, "$1")), "day");
  if (/(\d+)\s+hours?\s+ago/i.test(text)) return text.replace(/.*?(\d+)\s+hours?\s+ago.*/i, "$1 giờ trước");
  if (/(\d+)\s+weeks?\s+ago/i.test(text)) return vietnameseAge(Number(text.replace(/.*?(\d+)\s+weeks?\s+ago.*/i, "$1")), "week");
  if (/(\d+)\s+months?\s+ago/i.test(text)) return vietnameseAge(Number(text.replace(/.*?(\d+)\s+months?\s+ago.*/i, "$1")), "month");
  if (/^\d+\s+ngày trước$|^\d+\s+giờ trước$|^\d+\s+tuần trước$|^\d+\s+tháng trước$/i.test(text)) return text;
  return "Đang tuyển";
}

function vietnameseAge(value, unit) {
  const amount = Math.max(1, Number(value) || 1);
  if (unit === "day") {
    if (amount >= 21) return `${Math.round(amount / 30) || 1} tháng trước`;
    if (amount >= 14) return `${Math.round(amount / 7)} tuần trước`;
    return `${amount} ngày trước`;
  }
  if (unit === "week") return amount >= 4 ? `${Math.round(amount / 4)} tháng trước` : `${amount} tuần trước`;
  if (unit === "month") return `${amount} tháng trước`;
  return "Đang tuyển";
}

function applicationLinkLabel(job) {
  const quality = linkQuality(job.url);
  if (["exact_job", "company_job_page"].includes(quality)) return "Mở trang ứng tuyển";
  if (["listing_page", "search_page"].includes(quality)) return "Mở nguồn tham khảo";
  if (quality === "invalid") return "Link không hợp lệ";
  return "Kiểm tra nguồn";
}

function linkQualityStatus(quality) {
  const labels = {
    exact_job: "Link ứng tuyển trực tiếp",
    company_job_page: "Trang tuyển dụng chính thức",
    listing_page: "Trang listing/tham khảo",
    search_page: "Trang tìm kiếm/tham khảo",
    unknown: "Chưa xác minh chất lượng link",
    invalid: "Link không hợp lệ"
  };
  return labels[quality] || "Chưa xác minh chất lượng link";
}

function linkQualityBadge(quality) {
  const labels = {
    exact_job: "✅ Chính thức",
    company_job_page: "✅ Chính thức",
    listing_page: "⚠ Listing",
    search_page: "🔍 Search",
    unknown: "❌ Không xác minh",
    invalid: "❌ Không xác minh"
  };
  return labels[quality] || "❌ Không xác minh";
}

function linkQualityWarning(quality) {
  if (["listing_page", "search_page"].includes(quality)) return "⚠ Chưa có link ứng tuyển trực tiếp";
  if (quality === "unknown") return "⚠ Chưa xác minh chất lượng link";
  if (quality === "invalid") return "Link không hợp lệ";
  return "";
}

function sourceNameLabel(source = "") {
  return source
    .replace(/Careers$/i, "Career")
    .replace(/Monster\/Foundit/i, "Monster")
    .trim() || "Chưa xác định";
}

function confidenceScore(job, type) {
  if (type === "match") return Number(job.score) || 50;
  if (type === "location") {
    const location = normalizeLocationDetails(job);
    if (location.verificationStatus === "from-job-description" || location.verificationStatus === "official-career") return 85;
    if (location.verificationStatus === "multiple-offices") return 60;
    if (location.verificationStatus === "ai-suggested") return 45;
    return 35;
  }
  if (type === "application") return isValidApplicationLink(job.url) ? 85 : 45;
  if (type === "source") return isActiveJob(job) ? 80 : 45;
  return 50;
}

function confidenceLabel(value) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  if (score >= 85) return `Cao (${score}%)`;
  if (score >= 65) return `Trung bình (${score}%)`;
  return `Thấp (${score}%)`;
}

function salaryLabel(job) {
  const text = `${job.openStatus || ""} ${job.summary || ""}`;
  const match = text.match(/(?:lương\s*)?(\d{1,3}(?:[.,]\d+)?\s*[-–]\s*\d{1,3}(?:[.,]\d+)?\s*(?:triệu|tr|m|million)|\d{1,3}\s*m\s*gross)/i);
  return match ? match[1].replace(/\s+/g, " ") : "Lương chưa rõ";
}

function filteredJobs() {
  return state.jobs
    .filter(isValidJob)
    .filter((job) => {
      const status = getStatus(job.id);
      const bucket = matchLabel(job.score).bucket;

      if (state.view === "inbox" && !shouldShowInInbox(job)) return false;
      if (state.view === "pipeline" && !["interested", "applied", "interview", "offer"].includes(status)) return false;
      if (state.view === "archive" && !["rejected", "archived"].includes(status)) return false;
      if (state.recordTypeFilter === "real" && isSourceCandidate(job)) return false;
      if (state.recordTypeFilter === "source" && !isSourceCandidate(job)) return false;
      if (state.matchFilter !== "all" && bucket !== state.matchFilter) return false;
      if (state.quickFilter === "today" && !isNewToday(job)) return false;
      if (state.qualityFilters.size && ![...state.qualityFilters].every((filter) => matchesQualityFilter(job, filter))) return false;
      if (state.locationFilter !== "all" && locationBucket(job.locationDetails) !== state.locationFilter) return false;
      if (state.workModeFilter !== "all" && workModeBucket(job.locationDetails.workMode) !== state.workModeFilter) return false;
      if (state.sourceFilter !== "all" && job.source !== state.sourceFilter) return false;
      if (!state.query) return true;
      return [job.title, job.company, job.location, job.summary, job.source, job.openStatus, displayAddress(job.locationDetails), job.locationDetails.companyOfficeAddress, job.locationDetails.district].join(" ").toLowerCase().includes(state.query);
    })
    .sort((a, b) => {
      if (state.sortBy === "company") return a.company.localeCompare(b.company);
      if (state.sortBy === "status") return getStatus(a.id).localeCompare(getStatus(b.id));
      return b.score - a.score;
    });
}

function matchesQualityFilter(job, filter) {
  const quality = linkQuality(job.url);
  const location = job.locationDetails;
  if (filter === "match90") return Number(job.score) > 90;
  if (filter === "verified") return ["from-job-description", "official-career", "verified"].includes(location.verificationStatus);
  if (filter === "official") return ["exact_job", "company_job_page"].includes(quality);
  if (filter === "salary") return salaryLabel(job) !== "Lương chưa rõ";
  if (filter === "ai") return location.verificationStatus === "ai-suggested";
  if (filter === "missing") return quality !== "exact_job" || !hasDetailedAddress(location.jobWorkAddress) || salaryLabel(job) === "Lương chưa rõ" || !location.companyOfficeAddress;
  return true;
}

function isNewToday(job) {
  const today = new Date().toISOString().slice(0, 10);
  return (job.firstSeen || job.verifiedAt || "").slice(0, 10) === today || Boolean(job.isNew);
}

function shouldShowInInbox(job) {
  const action = getAction(job.id);
  if (["applied", "interview", "offer", "hired", "rejected", "archived"].includes(action.status)) return false;
  if (action.status === "later" && action.snoozedUntil && new Date(action.snoozedUntil) > new Date()) return false;
  return ["none", "interested", "later"].includes(action.status);
}

function setAction(jobId, status, source, extra = {}) {
  const previous = getAction(jobId);
  if (requiresConfirmation(previous.status, status) && !window.confirm(`Xác nhận chuyển trạng thái sang "${statusLabel(status, { status })}"?`)) return;
  const timestamp = new Date().toISOString();
  if (status === "none") {
    delete state.actions[jobId];
  } else {
    const history = [...asArray(previous.statusHistory), { from: previous.status || "none", to: status, at: timestamp, source }];
    const timestampField = statusTimestampField(status);
    state.actions[jobId] = status === "later"
      ? { ...previous, status, updatedAt: timestamp, source, snoozedUntil: addDays(3).toISOString(), statusHistory: history, [timestampField]: timestamp, ...extra }
      : { ...previous, status, updatedAt: timestamp, source, statusHistory: history, [timestampField]: timestamp, ...extra };
  }

  persistActions();
  syncAction(jobId, state.actions[jobId] || { status: "none" });
  render();
}

function requiresConfirmation(fromStatus, toStatus) {
  if (["rejected", "archived"].includes(toStatus)) return true;
  return ["applied", "interview", "offer"].includes(fromStatus) && toStatus === "none";
}

function statusTimestampField(status) {
  const fields = {
    interested: "interestedAt",
    applied: "appliedAt",
    interview: "interviewAt",
    offer: "offerAt",
    hired: "hiredAt",
    rejected: "rejectedAt",
    archived: "archivedAt",
    later: "snoozedAt"
  };
  return fields[status] || "updatedAt";
}

function syncAction(jobId, action) {
  fetch("./api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, ...action, updatedAt: new Date().toISOString() })
  }).catch(() => {});
}

function readActions() {
  try {
    const raw = JSON.parse(localStorage.getItem("jobActions") || "{}");
    const normalized = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, normalizeAction(value)]));
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      localStorage.setItem("jobActions", JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return {};
  }
}

function persistActions() {
  localStorage.setItem("jobActions", JSON.stringify(state.actions));
}

function normalizeAction(value) {
  if (!value) return { status: "none" };
  if (typeof value === "string") {
    if (["favorite", "Ưa thích", "ưa thích"].includes(value)) return { status: "interested" };
    if (value === "rejected") return { status: "rejected" };
    if (value === "archived") return { status: "archived" };
    return { status: value };
  }
  if (["favorite", "Ưa thích", "ưa thích"].includes(value.status)) return { ...value, status: "interested" };
  return value;
}

function readSettings() {
  const defaults = {
    autoApplyThreshold: "85",
    approvedResume: "cindy-sales-ops-resume",
    cityPreference: "hcm",
    workModePreference: "any"
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem("jobHunterSettings") || "{}") };
  } catch {
    return defaults;
  }
}

function persistSettings() {
  localStorage.setItem("jobHunterSettings", JSON.stringify(state.settings));
}

function getAction(jobId) {
  return normalizeAction(state.actions[jobId]);
}

function getStatus(jobId) {
  return getAction(jobId).status || "none";
}

function statusLabel(status, action) {
  if (status === "none") return "Mới";
  if (status === "interested") return "Quan tâm";
  if (status === "applied") return `Đã nộp · ${dateLabel(action.updatedAt)} · ${action.source || "nguồn"}`;
  if (status === "interview") return "Phỏng vấn";
  if (status === "offer") return "Đã nhận offer";
  if (status === "hired") return "Đã chấp nhận";
  if (status === "later") return `Để sau · ${dateLabel(action.snoozedUntil)}`;
  if (status === "rejected") return "Không phù hợp";
  if (status === "archived") return "Đã lưu trữ";
  return status;
}

function matchLabel(score) {
  if (score >= 85) return { bucket: "excellent", label: "Phù hợp cao" };
  if (score >= 70) return { bucket: "good", label: "Phù hợp tốt" };
  return { bucket: "possible", label: "Có thể phù hợp" };
}

function aiSummary(job) {
  return aiSummarySections(job).map(([label, value]) => `${label}: ${value}`).join(" ");
}

function aiSummaryHtml(job) {
  return aiSummarySections(job)
    .map(([label, value]) => `<span><b>${escapeHtml(label)}</b> ${escapeHtml(value)}</span>`)
    .join("");
}

function aiSummarySections(job) {
  if (!job.summary && !asArray(job.match).length && !asArray(job.risks).length) {
    return [
      ["Mạnh", "Chưa đủ dữ liệu để đánh giá."],
      ["Rủi ro", "Chưa đủ dữ liệu để đánh giá."],
      ["Khuyến nghị", "Mở nguồn gốc để đọc JD trước khi quyết định."]
    ];
  }
  const evidence = jobEvidence(job);
  const risk = skillRisk(job);
  const strength = evidence.strength || shortList(job.match)[0] || "Có tín hiệu phù hợp với kinh nghiệm vận hành thương mại.";
  return [
    ["Mạnh", strength],
    ["Rủi ro", risk],
    ["Khuyến nghị", recommendationFor(job, risk, evidence)]
  ];
}

function jobEvidence(job) {
  const text = `${job.title || ""} ${job.summary || ""} ${asArray(job.match).join(" ")}`.toLowerCase();
  if (/billing|payment|invoice|revenue|contract|collection/.test(text)) {
    return {
      area: "revenue",
      strength: "Role nhấn vào billing, contract hoặc payment follow-up, gần với kinh nghiệm vận hành doanh thu.",
      angle: "Nên mở bằng ví dụ xử lý contract, invoice và phối hợp Finance/Legal."
    };
  }
  if (/forecast|planning|demand|commercial plan|sales plan|pipeline/.test(text)) {
    return {
      area: "planning",
      strength: "Có tín hiệu về sales planning/forecast, phù hợp nền tảng commercial operations.",
      angle: "Nên nhấn vào planning cadence, forecast accuracy và phối hợp sales team."
    };
  }
  if (/customer success|account|partner|client|stakeholder/.test(text)) {
    return {
      area: "stakeholder",
      strength: "Job cần phối hợp khách hàng hoặc stakeholder, phù hợp kinh nghiệm cross-functional.",
      angle: "Nên dùng câu chuyện điều phối Sales, Finance, Legal hoặc khách hàng nội bộ."
    };
  }
  if (/process|sop|operation|workflow|automation|efficiency/.test(text)) {
    return {
      area: "process",
      strength: "Mô tả thiên về tối ưu quy trình, workflow hoặc hiệu suất vận hành.",
      angle: "Nên nhấn vào các cải tiến quy trình và giảm lỗi thủ công."
    };
  }
  if (/dashboard|kpi|report|analytics|power bi|sql|data/.test(text)) {
    return {
      area: "data",
      strength: "Có trọng tâm đo lường hiệu quả và dữ liệu vận hành.",
      angle: "Nên chọn vài ví dụ KPI/reporting cụ thể thay vì liệt kê công cụ."
    };
  }
  if (/admin|support|coordinator|sales assistant/.test(text)) {
    return {
      area: "support",
      strength: "Scope hỗ trợ vận hành bán hàng khá rõ, hợp với kinh nghiệm sales support.",
      angle: "Nên kiểm tra seniority để tránh role quá junior so với CV."
    };
  }
  return {
    area: "general",
    strength: Number(job.score) >= 85 ? "Điểm match cao, nhưng cần mở JD để xác nhận scope thực tế." : "Có tín hiệu match một phần, dữ liệu JD chưa đủ sâu.",
    angle: "Chưa đủ dữ liệu để đánh giá."
  };
}

function skillRisk(job) {
  const risk = shortList(job.risks).find((item) => !/job board|source pool|trạng thái|thay đổi nhanh|kiểm tra lại/i.test(item));
  if (risk) return risk.replace(/\.$/, ".");
  const text = `${job.title} ${job.summary}`.toLowerCase();
  if (!text.trim() || text.trim().length < 28) return "Chưa đủ dữ liệu để đánh giá.";
  if (/manager|lead|head/.test(text)) return "Cần kiểm tra yêu cầu quản lý đội nhóm và scope senior.";
  if (/sql|power bi|data|analytics|bi /.test(text)) return "Cần làm rõ mức yêu cầu SQL, Power BI hoặc phân tích dữ liệu.";
  return "Cần đọc JD chi tiết để xác nhận ngành và công cụ bắt buộc.";
}

function recommendationFor(job, risk, evidence = jobEvidence(job)) {
  if (risk === "Chưa đủ dữ liệu để đánh giá.") return "Chưa đủ dữ liệu để đánh giá.";
  if (job.score >= 85) return evidence.angle || "Nên nộp sau khi cập nhật CV theo trọng tâm role.";
  if (/sql|power bi|data|analytics/i.test(risk)) return "Nên bổ sung ví dụ đo lường hoặc tự động hóa báo cáo trước khi nộp.";
  if (/manager|senior|quản lý/i.test(risk)) return "Nên kiểm tra seniority trước khi quyết định nộp.";
  return "Có thể lưu để so sánh với các job ưu tiên cao hơn.";
}

function skillGapList(job) {
  const gap = skillRisk(job);
  return [gap];
}

function importantAssumption(job) {
  if (isGenericListingUrl(job.url)) return "Nguồn hiện là trang search/listing, cần mở nguồn để xác minh JD cụ thể.";
  if (job.locationDetails.verificationStatus === "ai-suggested") return "Địa điểm do AI gợi ý, chưa được xác thực từ nguồn chính thức.";
  return "Phân tích dựa trên title, summary, match notes và thông tin có trong dataset.";
}

function normalizeLocationDetails(job) {
  const raw = job.workLocation || job.location || "";
  const sourceType = locationSourceType(job);
  const officeSource = job.companyOfficeSource || "";
  const city = detectCity(raw);
  const district = detectDistrict(raw);
  const workMode = job.workMode || inferWorkMode(raw);
  const verificationStatus = locationVerificationStatus(raw, sourceType);
  return {
    jobWorkAddress: raw || "",
    job_work_address: raw || "",
    companyOfficeAddress: job.companyOfficeAddress || "",
    company_office_address: job.companyOfficeAddress || "",
    company_office_city: job.companyOfficeCity || detectCity(job.companyOfficeAddress || ""),
    company_office_district: job.companyOfficeDistrict || detectDistrict(job.companyOfficeAddress || ""),
    companyOfficeSource: officeSource,
    company_office_source: officeSource,
    officeVerificationStatus: officeVerificationStatus(job.companyOfficeAddress, officeSource),
    company_office_verification: officeVerificationStatus(job.companyOfficeAddress, officeSource),
    company_office_confidence: confidenceLabel(job.companyOfficeConfidence ?? (job.companyOfficeAddress ? 70 : 20)),
    city,
    district,
    workMode,
    locationSource: sourceType,
    locationSourceLabel: locationSourceLabel(sourceType),
    verificationStatus,
    locationConfidence: confidenceLabel(job.locationConfidence ?? locationConfidenceScore(verificationStatus))
  };
}

function locationConfidenceScore(status) {
  if (status === "from-job-description" || status === "official-career" || status === "verified") return 85;
  if (status === "multiple-offices") return 60;
  if (status === "ai-suggested") return 45;
  return 35;
}

function officeVerificationStatus(address = "", source = "") {
  if (!address) return "unknown";
  if (source === "ai-inference") return "ai-suggested";
  if (source === "official-company-website" || source === "official-company-career-page") return "verified";
  return "unknown";
}

function locationSourceType(job) {
  if (job.locationSource) return job.locationSource;
  const source = String(job.source || "").toLowerCase();
  if (isGenericListingUrl(job.url) && !hasDetailedAddress(job.location || "")) return "ai-inference";
  if (/careers|company career|grab careers|sanofi careers|pmax careers|dat bike careers/.test(source)) return "official-company-career-page";
  if (job.location) return "job-description";
  return "ai-inference";
}

function locationVerificationStatus(raw, sourceType) {
  if (!raw) return "unknown";
  if (/\/| and | hoặc |metropolitan/i.test(raw) && /vietnam|hưng yên|remote|\/|metropolitan/i.test(raw)) return "multiple-offices";
  if (sourceType === "ai-inference") return "ai-suggested";
  if (sourceType === "job-description") return "from-job-description";
  if (sourceType === "official-company-career-page") return "official-career";
  if (sourceType === "official-company-website") return "verified";
  return "unknown";
}

function locationStatusLabel(location) {
  const labels = {
    "verified": "✓ Đã xác thực",
    "from-job-description": "Theo JD",
    "official-career": "Theo Career Page",
    "ai-suggested": "✨ Gợi ý từ AI · Chưa xác thực",
    "unknown": "Chưa xác định",
    "multiple-offices": "Nhiều văn phòng"
  };
  return labels[location.verificationStatus] || "Chưa xác định";
}

function locationSourceLabel(source) {
  const labels = {
    "job-description": "Theo JD",
    "official-company-career-page": "Theo Career Page",
    "official-company-website": "Theo Website chính thức",
    "job-platform": "Theo nền tảng tuyển dụng",
    "ai-inference": "✨ Gợi ý từ AI"
  };
  return labels[source] || "Theo nền tảng tuyển dụng";
}

function locationDetailHtml(location) {
  const officeRows = [
    ["Địa chỉ", companyOfficeLabel(location)],
    ["Thành phố văn phòng", location.company_office_city || "Chưa xác định"],
    ["Quận/Huyện văn phòng", location.company_office_district || "Chưa xác định"],
    ["Nguồn", officeSourceLabel(location)],
    ["Xác minh", officeVerificationLabel(location)],
    ["Độ tin cậy", location.company_office_confidence]
  ];
  const rows = [
    ["Địa chỉ", location.jobWorkAddress || "Chưa xác định địa chỉ chi tiết"],
    ["Thành phố", location.city || "Chưa xác định"],
    ["Quận/Huyện", location.district || "Chưa xác định"],
    ["Hình thức", compactWorkMode(location.workMode)],
    ["Nguồn", location.locationSourceLabel],
    ["Xác minh", locationStatusLabel(location)],
    ["Độ tin cậy", location.locationConfidence || "Chưa có"]
  ];
  const mapLink = mapsLink(location);
  return `
    <div class="location-split">
      <section>
        <h4>Địa điểm làm việc</h4>
        <div class="location-detail-grid">${rows.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></p>`).join("")}${mapLink ? `<p><strong>Google Maps</strong><span><a href="${escapeHtml(mapLink)}" target="_blank" rel="noopener">Mở bản đồ</a></span></p>` : ""}</div>
      </section>
      <section>
        <h4>Văn phòng công ty</h4>
        <div class="office-address">${officeRows.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></p>`).join("")}</div>
      </section>
    </div>
    ${location.verificationStatus === "ai-suggested" || location.officeVerificationStatus === "ai-suggested" ? `<p class="ai-warning">${escapeHtml(AI_LOCATION_DISCLAIMER)}</p>` : ""}
  `;
}

function displayAddress(location) {
  return location.jobWorkAddress || location.companyOfficeAddress || location.city || "Chưa xác định địa điểm";
}

function detectCity(value = "") {
  if (/remote/i.test(value)) return "Remote";
  if (/hồ chí minh|ho chi minh|hcm|tphcm/i.test(value)) return "Ho Chi Minh City";
  if (/hà nội|ha noi|hanoi/i.test(value)) return "Ha Noi";
  if (/hưng yên|hung yen/i.test(value)) return "Hung Yen";
  if (/vietnam/i.test(value)) return "Vietnam";
  return value || "Chưa xác định";
}

function detectDistrict(value = "") {
  const district = String(value).match(/(?:quận|district|d\.?|q\.?)\s*(\d+|[a-zà-ỹ\s]+)/i);
  if (district) return district[0].replace(/\s+/g, " ").trim();
  if (/tân phú|tan phu/i.test(value)) return "Tan Phu";
  if (/tân phong|tan phong|d7|district 7|quận 7/i.test(value)) return "District 7";
  if (/củ chi|cu chi/i.test(value)) return "Cu Chi";
  return "";
}

function inferWorkMode(value = "") {
  if (/remote/i.test(value)) return "Remote";
  if (/hybrid/i.test(value)) return "Hybrid";
  return "";
}

function isValidApplicationLink(url) {
  return ["exact_job", "company_job_page"].includes(linkQuality(url));
}

function isGenericListingUrl(url = "") {
  return /linkedin\.com\/jobs\/search|\/search\/?|keywords=|google\.[^/]+\/search|jobs\/search/i.test(url);
}

function linkQuality(url = "") {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url ? "unknown" : "invalid";
  }
  if (!["https:", "http:"].includes(parsed.protocol)) return "invalid";
  const href = parsed.href.toLowerCase();
  if (/linkedin\.com\/jobs\/search|google\.[^/]+\/search|\/search\/?|keywords=|q=|results/.test(href)) return "search_page";
  if (/\/jobs\/view\/|\/viec-lam\/.+\.html|\/find-job\/.+\/jn-|talent\.com\/view\?id=|itviec\.com\/.+jobs|topcv\.vn\/viec-lam\//i.test(href)) return "exact_job";
  if (/\/careers?\/|greenhouse\.io|lever\.co|workdayjobs|smartrecruiters|ashbyhq|jobs\.ashbyhq/i.test(href)) return "company_job_page";
  if (/\/jobs?\/?|\/viec-lam|\/tuyen-dung|\/job\//i.test(href)) return "listing_page";
  return "unknown";
}

function isActiveJob(job) {
  return !/closed|expired|inactive|not available|đã đóng|hết hạn/i.test(`${job.openStatus || ""} ${job.summary || ""}`);
}

function locationMeetsPreferences(location) {
  const cityPref = state.settings.cityPreference;
  const modePref = state.settings.workModePreference;
  const cityText = `${location.city} ${location.jobWorkAddress}`.toLowerCase();
  const modeText = `${location.workMode} ${location.jobWorkAddress}`.toLowerCase();
  const cityOk = cityPref === "any"
    || (cityPref === "remote" && /remote/.test(cityText + modeText))
    || (cityPref === "hcm" && (/ho chi minh|hcm|hồ chí minh|remote/.test(cityText + modeText)));
  const modeOk = modePref === "any"
    || (modePref === "remote" && /remote/.test(modeText))
    || (modePref === "onsite" && !/remote only/.test(modeText));
  return cityOk && modeOk;
}

function hasUnresolvedMandatoryQuestions(job) {
  return asArray(job.mandatoryQuestions).some((question) => question.required && !question.answer);
}

function hasMissingRequiredDocuments(job) {
  return asArray(job.requiredDocuments).some((doc) => doc.required && !doc.available);
}

function hasUnsafeQuestions(job) {
  return asArray(job.mandatoryQuestions).some((question) => /free.?text|salary|visa|work authorization|authorization/i.test(`${question.type || ""} ${question.label || question}`));
}

function selectedResumeName() {
  return APPROVED_RESUMES[state.settings.approvedResume] || "";
}

function resumeFocus(job) {
  const text = `${job.title} ${job.summary} ${asArray(job.match).join(" ")}`.toLowerCase();
  const items = [
    ["CRM", "crm"],
    ["Sales Ops", "sales operation"],
    ["Reporting", "report"],
    ["KPI", "kpi"],
    ["Billing", "billing"],
    ["Automation", "automation"],
    ["Dynamics", "dynamics"],
    ["Power BI", "power bi"],
    ["Finance", "finance"],
    ["Stakeholder", "stakeholder"]
  ];
  const found = items.filter(([, needle]) => text.includes(needle)).map(([label]) => label);
  return found.length ? found.slice(0, 5) : ["CRM", "Reporting", "Operations"];
}

function renderFocus(container, items) {
  container.innerHTML = "";
  items.forEach((item) => {
    const chip = document.createElement("span");
    chip.textContent = item;
    container.appendChild(chip);
  });
}

function shortList(items = []) {
  return asArray(items).slice(0, 2).map((item) => String(item).replace(/^Có tín hiệu liên quan /, "").replace(/^Được tìm lại trong /, ""));
}

function fillList(list, items = []) {
  list.innerHTML = "";
  asArray(items).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function copyPrompt(job) {
  const prompt = `Apply angle for ${job.title} at ${job.company}: highlight ${resumeFocus(job).join(", ")}. Match score ${job.score}%. Source: ${job.url}`;
  navigator.clipboard?.writeText(prompt).catch(() => {});
}

function compactLocation(location = "") {
  if (/remote/i.test(location)) return "Remote";
  if (/hồ chí minh|ho chi minh|hcm|tphcm/i.test(location)) return "HCM";
  return location || "Chưa xác định địa điểm";
}

function compactWorkMode(mode = "") {
  if (/hybrid/i.test(mode)) return "Hybrid";
  if (/remote/i.test(mode)) return "Remote";
  if (/contract/i.test(mode)) return "Contract";
  if (/full/i.test(mode)) return "Full-time";
  return mode || "Full-time";
}

function icon(name) {
  return ICONS[name] || "";
}

function dateLabel(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function dateTimeLabel(value) {
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function toTitleCase(text = "") {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s/(-])\p{L}/gu, (match) => match.toUpperCase());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}
