const state = {
  jobs: [],
  actions: readActions(),
  activeTab: "all",
  query: "",
  sortBy: "score"
};

const syncIntervalMs = 60 * 60 * 1000;
const els = {
  list: document.querySelector("#jobList"),
  template: document.querySelector("#jobCardTemplate"),
  tabs: [...document.querySelectorAll(".tab")],
  search: document.querySelector("#searchBox"),
  sort: document.querySelector("#sortBy"),
  syncNow: document.querySelector("#syncNow"),
  totalJobs: document.querySelector("#totalJobs"),
  appliedCount: document.querySelector("#appliedCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  lastSync: document.querySelector("#lastSync")
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
      els.tabs.forEach((item) => item.classList.toggle("active", item === tab));
      render();
    });
  });

  els.search.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  els.sort.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    render();
  });

  els.syncNow.addEventListener("click", syncJobs);
}

async function syncJobs() {
  els.syncNow.disabled = true;
  els.syncNow.textContent = "Đang sync...";

  try {
    const localJobs = await fetchJson("./data/jobs.json");
    const remoteJobs = await fetchRemoteJobs();
    state.jobs = mergeJobs(localJobs, remoteJobs).filter((job) => job.score >= 50);
    localStorage.setItem("lastSyncAt", new Date().toISOString());
  } catch (error) {
    console.error(error);
  } finally {
    els.syncNow.disabled = false;
    els.syncNow.textContent = "Sync ngay";
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
  els.list.innerHTML = "";

  if (!jobs.length) {
    els.list.innerHTML = `<div class="empty">Không có job trong tab này.</div>`;
    return;
  }

  jobs.forEach((job) => {
    const node = els.template.content.cloneNode(true);
    const card = node.querySelector(".job-card");
    const status = getStatus(job.id);
    card.dataset.status = status;

    node.querySelector(".rank").textContent = `#${job.rank || "-"}`;
    node.querySelector(".job-title").textContent = job.title;
    node.querySelector(".source-badge").textContent = job.source;
    node.querySelector(".company").textContent = job.company;
    node.querySelector(".score").textContent = `${job.score}%`;
    node.querySelector(".summary-text").textContent = job.summary;
    node.querySelector(".application-angle").textContent = `Góc apply: ${job.applicationAngle}`;
    node.querySelector(".source-note").textContent = `Nguồn: ${job.source} | Trạng thái: ${job.openStatus}`;

    const applyLink = node.querySelector(".actions a");
    applyLink.href = job.url;
    applyLink.textContent = "Apply / Source";

    const meta = node.querySelector(".meta");
    addMeta(meta, job.location);
    addMeta(meta, job.workMode);
    addMeta(meta, job.openStatus);
    if (job.isNew) addMeta(meta, "Mới", "status-favorite");
    if (status !== "none") addMeta(meta, labelForStatus(status), `status-${status}`);

    fillList(node.querySelector(".match-list"), job.match);
    fillList(node.querySelector(".risk-list"), job.risks);

    node.querySelectorAll(".actions button").forEach((button) => {
      button.classList.toggle("active", status === button.dataset.action);
      button.addEventListener("click", () => toggleAction(job.id, button.dataset.action));
    });

    els.list.appendChild(node);
  });
}

function renderSummary() {
  const applied = Object.values(state.actions).filter((item) => item === "applied").length;
  const favorite = Object.values(state.actions).filter((item) => item === "favorite").length;
  const lastSync = localStorage.getItem("lastSyncAt");

  els.totalJobs.textContent = state.jobs.length;
  els.appliedCount.textContent = applied;
  els.favoriteCount.textContent = favorite;
  els.lastSync.textContent = lastSync ? new Date(lastSync).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "Chưa sync";
}

function filteredJobs() {
  return state.jobs
    .filter((job) => {
      const status = getStatus(job.id);
      if (state.activeTab === "new" && !job.isNew) return false;
      if (["applied", "rejected", "favorite"].includes(state.activeTab) && status !== state.activeTab) return false;
      if (!state.query) return true;
      return [job.title, job.company, job.location, job.summary, job.source].join(" ").toLowerCase().includes(state.query);
    })
    .sort((a, b) => {
      if (state.sortBy === "company") return a.company.localeCompare(b.company);
      if (state.sortBy === "status") return getStatus(a.id).localeCompare(getStatus(b.id));
      return b.score - a.score;
    });
}

function toggleAction(jobId, action) {
  state.actions[jobId] = state.actions[jobId] === action ? "none" : action;
  if (state.actions[jobId] === "none") delete state.actions[jobId];
  localStorage.setItem("jobActions", JSON.stringify(state.actions));
  syncAction(jobId, state.actions[jobId] || "none");
  render();
}

function syncAction(jobId, action) {
  fetch("./api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, action, updatedAt: new Date().toISOString() })
  }).catch(() => {});
}

function readActions() {
  try {
    return JSON.parse(localStorage.getItem("jobActions") || "{}");
  } catch {
    return {};
  }
}

function getStatus(jobId) {
  return state.actions[jobId] || "none";
}

function labelForStatus(status) {
  if (status === "applied") return "Đã nộp";
  if (status === "rejected") return "Từ chối";
  if (status === "favorite") return "Ưa thích";
  return "";
}

function fillList(list, items = []) {
  list.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
}

function addMeta(container, text, className = "") {
  if (!text) return;
  const span = document.createElement("span");
  span.textContent = text;
  if (className) span.classList.add(className);
  container.appendChild(span);
}
