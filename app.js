const state = {
  jobs: [],
  sources: [],
  actions: readActions(),
  view: "inbox",
  matchFilter: "all",
  query: "",
  sortBy: "score",
  pageSize: 20,
  currentPage: 1,
  loadState: "loading",
  jobsError: "",
  sourcesError: "",
  newJobsFound: 0,
  lastSyncAt: localStorage.getItem("lastSyncAt") || ""
};

const syncIntervalMs = 60 * 60 * 1000;
const els = {
  list: document.querySelector("#jobList"),
  template: document.querySelector("#jobCardTemplate"),
  tabs: [...document.querySelectorAll(".primary-tabs .tab")],
  search: document.querySelector("#searchBox"),
  matchFilter: document.querySelector("#matchFilter"),
  sort: document.querySelector("#sortBy"),
  pageSize: document.querySelector("#pageSize"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  pageInfo: document.querySelector("#pageInfo"),
  syncNow: document.querySelector("#syncNow"),
  syncStatus: document.querySelector("#syncStatus"),
  inboxCount: document.querySelector("#inboxCount"),
  excellentCount: document.querySelector("#excellentCount"),
  pipelineCount: document.querySelector("#pipelineCount"),
  newFoundCount: document.querySelector("#newFoundCount"),
  recommendationPanel: document.querySelector("#recommendationPanel"),
  recommendationText: document.querySelector("#recommendationText"),
  sourceGroups: document.querySelector("#sourceGroups"),
  sourceCount: document.querySelector("#sourceCount")
};

init();

async function init() {
  bindEvents();
  render();
  await syncJobs();
  setInterval(syncJobs, syncIntervalMs);
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      state.currentPage = 1;
      els.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      render();
    });
  });

  els.matchFilter.addEventListener("change", (event) => {
    state.matchFilter = event.target.value;
    state.currentPage = 1;
    render();
  });

  els.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    state.currentPage = 1;
    render();
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
      state.newJobsFound = state.jobs.filter((job) => job.isNew && !previousIds.has(job.id)).length || state.jobs.filter((job) => job.isNew).length;
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
    map.set(id, { ...job, id });
  });
  return [...map.values()];
}

function makeId(job) {
  return `${job.company || ""}-${job.title || ""}-${job.url || ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function isValidJob(job) {
  return Boolean(job && job.id && job.title && job.company && job.url && Number.isFinite(Number(job.score)));
}

function render() {
  renderSummary();
  renderRecommendation();
  renderSyncState();

  if (state.loadState === "loading" && !state.jobs.length) {
    renderPagination(0, 1);
    els.list.innerHTML = stateMessage("Loading", "Loading jobs and sources from production...", "loading");
    return;
  }

  if (state.loadState === "failed" && !state.jobs.length) {
    renderPagination(0, 1);
    els.list.innerHTML = stateMessage("Data load failed", state.jobsError || "Could not load job data.", "error");
    return;
  }

  if (state.loadState === "loaded" && !state.jobs.length) {
    renderPagination(0, 1);
    els.list.innerHTML = stateMessage("No jobs in database", "data/jobs.json and the sync API returned no valid jobs.", "empty-db");
    return;
  }

  const jobs = filteredJobs();
  const totalPages = Math.max(1, Math.ceil(jobs.length / state.pageSize));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * state.pageSize;
  const visibleJobs = jobs.slice(start, start + state.pageSize);
  renderPagination(jobs.length, totalPages);
  els.list.innerHTML = "";

  if (!visibleJobs.length) {
    els.list.innerHTML = stateMessage("No matches for current filters", "No jobs match this view, match filter, and search query.", "no-match");
    return;
  }

  visibleJobs.forEach((job) => renderJob(job));
}

function renderJob(job) {
  if (!isValidJob(job)) return;

  const node = els.template.content.cloneNode(true);
  const card = node.querySelector(".job-card");
  const action = getAction(job.id);
  const status = getStatus(job.id);
  const match = matchLabel(job.score);

  card.dataset.status = status;
  node.querySelector(".rank").textContent = `#${job.rank || "-"}`;
  node.querySelector(".ai-label").textContent = `${match.label} match`;
  node.querySelector(".score").textContent = `${job.score}%`;
  node.querySelector(".pipeline-status").textContent = statusLabel(status, action);
  node.querySelector(".pipeline-status").classList.add(`status-${status}`);
  node.querySelector(".job-title").textContent = toTitleCase(job.title);
  node.querySelector(".company").textContent = job.company;
  node.querySelector(".title-location").textContent = compactLocation(job.location);
  node.querySelector(".work-mode").textContent = compactWorkMode(job.workMode);
  node.querySelector(".source-badge").textContent = job.source || "Source";
  node.querySelector(".open-status").textContent = job.openStatus || "Check source";
  node.querySelector(".summary-text").textContent = aiSummary(job);
  node.querySelector(".application-angle").textContent = `Application angle: ${job.applicationAngle || "Highlight relevant operations, reporting, CRM, and stakeholder work."}`;
  node.querySelector(".source-note").textContent = `Source: ${job.source || "Unknown"} | Status: ${job.openStatus || "Check source"}`;

  renderFocus(node.querySelector(".resume-focus"), resumeFocus(job));
  fillList(node.querySelector(".match-list"), shortList(job.match));
  fillList(node.querySelector(".risk-list"), shortList(job.risks));
  node.querySelector(".copy-prompt").addEventListener("click", () => copyPrompt(job));
  renderActions(node.querySelector(".actions"), job, status);
  renderInternalActions(node.querySelector(".internal-actions"), job, status);

  els.list.appendChild(node);
}

function renderActions(container, job, status) {
  container.innerHTML = "";
  addLink(container, "Open application", job.url);

  if (["none", "interested", "later"].includes(status)) {
    addButton(container, "Interested", "interested", job);
    addButton(container, "Later", "later", job);
    addButton(container, "Not fit", "rejected", job);
    return;
  }

  if (status === "applied") {
    addButton(container, "Interview", "interview", job);
    addButton(container, "Offer", "offer", job);
    addButton(container, "Reject", "rejected", job);
    return;
  }

  if (status === "interview") {
    addButton(container, "Offer", "offer", job);
    addButton(container, "Reject", "rejected", job);
    return;
  }

  if (status === "offer") {
    addButton(container, "Archive", "archived", job);
    return;
  }

  addButton(container, "Restore", "none", job);
}

function renderInternalActions(container, job, status) {
  container.innerHTML = "";
  if (["none", "interested", "later"].includes(status)) {
    addOverflow(container, [
      ["Mark internally as Applied", "applied"],
      ["Archive", "archived"]
    ], job);
    return;
  }
  if (["applied", "interview", "rejected"].includes(status)) {
    addOverflow(container, [["Archive", "archived"]], job);
    return;
  }
  if (["archived", "offer"].includes(status)) {
    addOverflow(container, [["Restore to Inbox", "none"]], job);
  }
}

function addLink(container, label, url) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = label;
  container.appendChild(link);
}

function addButton(container, label, action, job) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => setAction(job.id, action, job.source));
  container.appendChild(button);
}

function addOverflow(container, actions, job) {
  const details = document.createElement("details");
  details.className = "overflow-menu";
  const summary = document.createElement("summary");
  summary.textContent = "More";
  details.appendChild(summary);
  actions.forEach(([label, action]) => addButton(details, label, action, job));
  container.appendChild(details);
}

function renderPagination(total, totalPages) {
  const start = total ? (state.currentPage - 1) * state.pageSize + 1 : 0;
  const end = Math.min(total, state.currentPage * state.pageSize);
  els.pageInfo.textContent = `Page ${state.currentPage}/${totalPages} · ${start}-${end}/${total}`;
  els.prevPage.disabled = state.currentPage <= 1;
  els.nextPage.disabled = state.currentPage >= totalPages;
}

function renderSummary() {
  const inboxJobs = state.jobs.filter((job) => shouldShowInInbox(job));
  const pipelineJobs = state.jobs.filter((job) => ["applied", "interview", "offer"].includes(getStatus(job.id)));
  els.inboxCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : inboxJobs.length;
  els.excellentCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : inboxJobs.filter((job) => job.score >= 85).length;
  els.pipelineCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : pipelineJobs.length;
  els.newFoundCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : state.newJobsFound;
}

function renderRecommendation() {
  const inboxJobs = state.jobs.filter((job) => shouldShowInInbox(job));
  if (!inboxJobs.length || state.loadState !== "loaded") {
    els.recommendationPanel.classList.add("is-hidden");
    els.recommendationText.textContent = "";
    return;
  }

  const best = [...inboxJobs].sort((a, b) => b.score - a.score)[0];
  els.recommendationPanel.classList.remove("is-hidden");
  els.recommendationText.textContent = `Apply first: ${toTitleCase(best.title)} at ${best.company}. ${best.score}% match, ${compactLocation(best.location)}, source ${best.source || "unknown"}.`;
}

function renderSyncState() {
  els.syncNow.textContent = state.loadState === "loading" || state.loadState === "refreshing" ? "Syncing..." : "Sync jobs";
  if (state.loadState === "failed") {
    els.syncStatus.textContent = "Sync failed. Retry.";
    els.syncStatus.className = "sync-error";
    return;
  }
  els.syncStatus.className = "";
  if (state.loadState === "loading") {
    els.syncStatus.textContent = "Loading data...";
  } else if (state.loadState === "refreshing") {
    els.syncStatus.textContent = "Refreshing data...";
  } else {
    els.syncStatus.textContent = `Last sync ${state.lastSyncAt ? dateTimeLabel(state.lastSyncAt) : "not yet"} · ${state.newJobsFound} new found`;
  }
}

function renderSources() {
  const total = state.sources.reduce((sum, group) => sum + asArray(group.sources).length, 0);
  els.sourceCount.textContent = `${total} sources`;
  els.sourceGroups.innerHTML = "";

  if (state.sourcesError) {
    els.sourceGroups.innerHTML = stateMessage("Source load failed", state.sourcesError, "error");
    return;
  }

  if (!state.sources.length) {
    els.sourceGroups.innerHTML = stateMessage("No source pool", "data/sources.json has no configured sources.", "empty-db");
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

function stateMessage(title, detail, type) {
  return `<div class="state-message ${type}">
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(detail)}</p>
  </div>`;
}

function filteredJobs() {
  return state.jobs
    .filter(isValidJob)
    .filter((job) => {
      const status = getStatus(job.id);
      const bucket = matchLabel(job.score).bucket;

      if (state.view === "inbox" && !shouldShowInInbox(job)) return false;
      if (state.view === "pipeline" && !["applied", "interview", "offer"].includes(status)) return false;
      if (state.view === "archive" && !["rejected", "archived"].includes(status)) return false;
      if (state.matchFilter !== "all" && bucket !== state.matchFilter) return false;
      if (!state.query) return true;
      return [job.title, job.company, job.location, job.summary, job.source, job.openStatus].join(" ").toLowerCase().includes(state.query);
    })
    .sort((a, b) => {
      if (state.sortBy === "company") return a.company.localeCompare(b.company);
      if (state.sortBy === "status") return getStatus(a.id).localeCompare(getStatus(b.id));
      return b.score - a.score;
    });
}

function shouldShowInInbox(job) {
  const action = getAction(job.id);
  if (["applied", "interview", "offer", "rejected", "archived"].includes(action.status)) return false;
  if (action.status === "later" && action.snoozedUntil && new Date(action.snoozedUntil) > new Date()) return false;
  return ["none", "interested", "later"].includes(action.status);
}

function setAction(jobId, status, source) {
  if (status === "none") {
    delete state.actions[jobId];
  } else {
    state.actions[jobId] = status === "later"
      ? { status, updatedAt: new Date().toISOString(), source, snoozedUntil: addDays(3).toISOString() }
      : { status, updatedAt: new Date().toISOString(), source };
  }

  persistActions();
  syncAction(jobId, state.actions[jobId] || { status: "none" });
  render();
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

function getAction(jobId) {
  return normalizeAction(state.actions[jobId]);
}

function getStatus(jobId) {
  return getAction(jobId).status || "none";
}

function statusLabel(status, action) {
  if (status === "none") return "New";
  if (status === "interested") return "Interested";
  if (status === "applied") return `Applied · ${dateLabel(action.updatedAt)} · ${action.source || "source"}`;
  if (status === "interview") return "Interview";
  if (status === "offer") return "Offer";
  if (status === "later") return `Later · ${dateLabel(action.snoozedUntil)}`;
  if (status === "rejected") return "Not fit";
  if (status === "archived") return "Archived";
  return status;
}

function matchLabel(score) {
  if (score >= 85) return { bucket: "excellent", label: "Excellent" };
  if (score >= 70) return { bucket: "good", label: "Good" };
  return { bucket: "possible", label: "Possible" };
}

function aiSummary(job) {
  const focus = resumeFocus(job).slice(0, 3).join(", ");
  const gap = shortList(job.risks)[0] || "minor gaps to review";
  return `Strong fit: ${focus}. Gap: ${gap.replace(/\.$/, "")}.`;
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
  return location || "Location TBD";
}

function compactWorkMode(mode = "") {
  if (/hybrid/i.test(mode)) return "Hybrid";
  if (/remote/i.test(mode)) return "Remote";
  if (/contract/i.test(mode)) return "Contract";
  if (/full/i.test(mode)) return "Full-time";
  return mode || "Full-time";
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
