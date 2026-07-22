const state = {
  jobs: [],
  sources: [],
  actions: readActions(),
  activeTab: "inbox",
  query: "",
  sortBy: "score",
  pageSize: 20,
  currentPage: 1
};

const syncIntervalMs = 60 * 60 * 1000;
const els = {
  list: document.querySelector("#jobList"),
  template: document.querySelector("#jobCardTemplate"),
  tabs: [...document.querySelectorAll(".tab")],
  search: document.querySelector("#searchBox"),
  sort: document.querySelector("#sortBy"),
  pageSize: document.querySelector("#pageSize"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  pageInfo: document.querySelector("#pageInfo"),
  syncNow: document.querySelector("#syncNow"),
  totalJobs: document.querySelector("#totalJobs"),
  excellentCount: document.querySelector("#excellentCount"),
  appliedCount: document.querySelector("#appliedCount"),
  needReviewCount: document.querySelector("#needReviewCount"),
  sourceGroups: document.querySelector("#sourceGroups"),
  sourceCount: document.querySelector("#sourceCount")
};

init();

async function init() {
  bindEvents();
  await syncJobs();
  setInterval(syncJobs, syncIntervalMs);
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeTab = tab.dataset.tab;
      state.currentPage = 1;
      els.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      render();
    });
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
  els.syncNow.textContent = "Đang sync...";

  try {
    const [localJobs, sources] = await Promise.all([
      fetchJson("./data/jobs.json"),
      fetchJson("./data/sources.json")
    ]);
    const remoteJobs = await fetchRemoteJobs();
    state.jobs = mergeJobs(localJobs, remoteJobs).filter((job) => job.score >= 50);
    state.sources = sources;
    localStorage.setItem("lastSyncAt", new Date().toISOString());
  } catch (error) {
    console.error(error);
  } finally {
    els.syncNow.disabled = false;
    els.syncNow.textContent = "Sync ngay";
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
  if (!response.ok) throw new Error(`Cannot load ${url}`);
  return response.json();
}

function mergeJobs(localJobs, remoteJobs) {
  const map = new Map();
  [...localJobs, ...remoteJobs].forEach((job) => {
    map.set(job.id || makeId(job), { ...job, id: job.id || makeId(job) });
  });
  return [...map.values()];
}

function makeId(job) {
  return `${job.company}-${job.title}-${job.url}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function render() {
  renderSummary();
  const jobs = filteredJobs();
  const totalPages = Math.max(1, Math.ceil(jobs.length / state.pageSize));
  state.currentPage = Math.min(state.currentPage, totalPages);
  const start = (state.currentPage - 1) * state.pageSize;
  const visibleJobs = jobs.slice(start, start + state.pageSize);
  renderPagination(jobs.length, totalPages);
  els.list.innerHTML = "";

  if (!visibleJobs.length) {
    els.list.innerHTML = `<div class="empty">Không có job trong filter này.</div>`;
    return;
  }

  visibleJobs.forEach((job) => {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector(".job-card");
    const action = getAction(job.id);
    const status = getStatus(job.id);
    const match = matchLabel(job.score);
    card.dataset.status = status;

    node.querySelector(".rank").textContent = `#${job.rank || "-"}`;
    node.querySelector(".ai-label").textContent = `${match.label} Match`;
    node.querySelector(".score").textContent = `${job.score}%`;
    node.querySelector(".pipeline-status").textContent = statusLabel(status, action);
    node.querySelector(".pipeline-status").classList.add(`status-${status}`);
    node.querySelector(".job-title").textContent = toTitleCase(job.title);
    node.querySelector(".company").textContent = job.company;
    node.querySelector(".title-location").textContent = compactLocation(job.location);
    node.querySelector(".work-mode").textContent = compactWorkMode(job.workMode);
    node.querySelector(".source-badge").textContent = job.source;
    node.querySelector(".open-status").textContent = job.openStatus;
    node.querySelector(".summary-text").textContent = aiSummary(job);
    node.querySelector(".application-angle").textContent = `Góc apply: ${job.applicationAngle}`;
    node.querySelector(".source-note").textContent = `Nguồn: ${job.source} | Trạng thái: ${job.openStatus}`;

    const applyLink = node.querySelector(".actions a");
    applyLink.href = job.url;

    renderFocus(node.querySelector(".resume-focus"), resumeFocus(job));
    fillList(node.querySelector(".match-list"), shortList(job.match));
    fillList(node.querySelector(".risk-list"), shortList(job.risks));

    node.querySelector(".copy-prompt").addEventListener("click", () => copyPrompt(job));

    node.querySelectorAll(".actions button").forEach((button) => {
      button.classList.toggle("active", status === button.dataset.action);
      button.addEventListener("click", () => setAction(job.id, button.dataset.action, job.source));
    });

    els.list.appendChild(node);
  });
}

function renderPagination(total, totalPages) {
  const start = total ? (state.currentPage - 1) * state.pageSize + 1 : 0;
  const end = Math.min(total, state.currentPage * state.pageSize);
  els.pageInfo.textContent = `Trang ${state.currentPage}/${totalPages} · ${start}-${end}/${total}`;
  els.prevPage.disabled = state.currentPage <= 1;
  els.nextPage.disabled = state.currentPage >= totalPages;
}

function renderSummary() {
  const visible = state.jobs.filter((job) => shouldShowInInbox(job));
  els.totalJobs.textContent = visible.length;
  els.excellentCount.textContent = state.jobs.filter((job) => job.score >= 85 && shouldShowInInbox(job)).length;
  els.appliedCount.textContent = Object.values(state.actions).filter((item) => normalizeAction(item).status === "applied").length;
  els.needReviewCount.textContent = state.jobs.filter((job) => job.score >= 75 && shouldShowInInbox(job)).length;
}

function renderSources() {
  const total = state.sources.reduce((sum, group) => sum + group.sources.length, 0);
  els.sourceCount.textContent = `${total} nguồn`;
  els.sourceGroups.innerHTML = "";

  state.sources.forEach((group) => {
    const section = document.createElement("section");
    section.className = "source-group";

    const title = document.createElement("h3");
    title.textContent = group.group;
    section.appendChild(title);

    const list = document.createElement("div");
    list.className = "source-chip-list";
    group.sources.forEach((source) => {
      const chip = document.createElement("span");
      chip.textContent = source;
      list.appendChild(chip);
    });

    section.appendChild(list);
    els.sourceGroups.appendChild(section);
  });
}

function filteredJobs() {
  return state.jobs
    .filter((job) => {
      const action = getAction(job.id);
      const status = action.status;
      const bucket = matchLabel(job.score).bucket;

      if (state.activeTab === "inbox" && !shouldShowInInbox(job)) return false;
      if (["excellent", "good", "possible"].includes(state.activeTab) && bucket !== state.activeTab) return false;
      if (["interested", "applied", "interview", "offer", "later", "rejected", "archived"].includes(state.activeTab) && status !== state.activeTab) return false;
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
  const hidden = ["applied", "interview", "offer", "rejected", "archived"].includes(action.status);
  if (hidden) return false;
  if (action.status === "later" && action.snoozedUntil && new Date(action.snoozedUntil) > new Date()) return false;
  return ["none", "interested", "later"].includes(action.status);
}

function setAction(jobId, status, source) {
  const next = status === "later"
    ? { status, updatedAt: new Date().toISOString(), source, snoozedUntil: addDays(3).toISOString() }
    : { status, updatedAt: new Date().toISOString(), source };

  const current = getAction(jobId);
  if (current.status === status) {
    delete state.actions[jobId];
  } else {
    state.actions[jobId] = next;
  }

  localStorage.setItem("jobActions", JSON.stringify(state.actions));
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
    return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, normalizeAction(value)]));
  } catch {
    return {};
  }
}

function normalizeAction(value) {
  if (!value) return { status: "none" };
  if (typeof value === "string") {
    if (value === "favorite") return { status: "interested" };
    return { status: value };
  }
  if (value.status === "favorite") return { ...value, status: "interested" };
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
  if (status === "rejected") return "Rejected";
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
  const gap = shortList(job.risks)[0] || "Minor gaps to review";
  return `Strong fit: ${focus}. Gap: ${gap.replace(/\.$/, "")}.`;
}

function resumeFocus(job) {
  const text = `${job.title} ${job.summary} ${(job.match || []).join(" ")}`.toLowerCase();
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
  return items.slice(0, 2).map((item) => item.replace(/^Có tín hiệu liên quan /, "").replace(/^Được tìm lại trong /, ""));
}

function fillList(list, items = []) {
  list.innerHTML = "";
  items.forEach((item) => {
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
  return new Date(value).toLocaleDateString("vi-VN", { day: "2-digit", month: "short" });
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function toTitleCase(text) {
  if (text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s/(-])\p{L}/gu, (match) => match.toUpperCase());
}
