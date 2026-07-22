const APP_VERSION = "AIJH-AUTOAPPLY-20260722-0520";
const AI_LOCATION_DISCLAIMER = "AI suggestion. This location was inferred from public information and may not be the exact workplace for this role. Verify it in the job description or official company website before applying.";
const AI_CONTENT_DISCLAIMER = "AI-generated content. Review match reasoning, cover letter, and recommendations before using them in an application.";
const APPROVED_RESUMES = {
  "cindy-sales-ops-resume": "Cindy Sales Ops Resume"
};
const BLACKLISTED_COMPANIES = [];

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
  lastSyncAt: localStorage.getItem("lastSyncAt") || "",
  settings: readSettings(),
  reviewJobId: ""
};

const syncIntervalMs = 60 * 60 * 1000;
const els = {
  list: document.querySelector("#jobList"),
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
  sourceCount: document.querySelector("#sourceCount"),
  autoApplyThreshold: document.querySelector("#autoApplyThreshold"),
  approvedResume: document.querySelector("#approvedResume"),
  cityPreference: document.querySelector("#cityPreference"),
  workModePreference: document.querySelector("#workModePreference"),
  reviewDialog: document.querySelector("#autoApplyDialog"),
  reviewTitle: document.querySelector("#reviewTitle"),
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
    applicationLink: job.applicationLink || job.url
  };
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

  const card = createJobCard();
  const action = getAction(job.id);
  const status = getStatus(job.id);
  const match = matchLabel(job.score);

  card.dataset.status = status;
  card.querySelector(".rank").textContent = `#${job.rank || "-"}`;
  card.querySelector(".ai-label").textContent = `${match.label} match`;
  card.querySelector(".score").textContent = `${job.score}%`;
  card.querySelector(".pipeline-status").textContent = statusLabel(status, action);
  card.querySelector(".pipeline-status").classList.add(`status-${status}`);
  card.querySelector(".job-title").textContent = toTitleCase(job.title);
  card.querySelector(".company").textContent = job.company;
  card.querySelector(".title-location").textContent = compactLocation(job.locationDetails.city || job.location);
  card.querySelector(".work-mode").textContent = compactWorkMode(job.locationDetails.workMode);
  card.querySelector(".location-badge").textContent = locationStatusLabel(job.locationDetails);
  card.querySelector(".location-badge").classList.add(`location-${job.locationDetails.verificationStatus}`);
  card.querySelector(".source-badge").textContent = job.source || "Source";
  card.querySelector(".open-status").textContent = job.openStatus || "Check source";
  card.querySelector(".summary-text").textContent = aiSummary(job);
  card.querySelector(".application-angle").textContent = `Application angle: ${job.applicationAngle || "Highlight relevant operations, reporting, CRM, and stakeholder work."}`;
  card.querySelector(".source-note").textContent = `Source: ${job.source || "Unknown"} | Status: ${job.openStatus || "Check source"}`;
  card.querySelector(".location-detail").innerHTML = locationDetailHtml(job.locationDetails);
  card.querySelector(".ai-disclaimer").textContent = AI_CONTENT_DISCLAIMER;

  renderFocus(card.querySelector(".resume-focus"), resumeFocus(job));
  fillList(card.querySelector(".match-list"), shortList(job.match));
  fillList(card.querySelector(".risk-list"), shortList(job.risks));
  card.querySelector(".copy-prompt").addEventListener("click", () => copyPrompt(job));
  renderActions(card.querySelector(".actions"), job, status);
  renderInternalActions(card.querySelector(".internal-actions"), job, status);

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
        <span class="dot">·</span>
        <span class="title-location"></span>
        <span class="dot">·</span>
        <span class="work-mode"></span>
        <span class="location-badge"></span>
      </p>
      <p class="source-line">
        <span class="source-badge"></span>
        <span class="dot">·</span>
        <span class="open-status"></span>
      </p>
    </div>
    <div class="ai-summary">
      <strong>AI says</strong>
      <p class="summary-text"></p>
    </div>
    <div class="focus-block">
      <div>
        <strong>Resume focus</strong>
        <div class="resume-focus"></div>
      </div>
      <button type="button" class="copy-prompt">Copy prompt</button>
    </div>
    <div class="actions" aria-label="Job actions"></div>
    <div class="quick-preview">
      <strong>Quick preview</strong>
      <div class="details-grid">
        <div>
          <h4>Why match</h4>
          <ul class="match-list"></ul>
        </div>
        <div>
          <h4>Gap</h4>
          <ul class="risk-list"></ul>
        </div>
      </div>
    </div>
    <details class="detail-toggle">
      <summary>More detail</summary>
      <div class="internal-actions"></div>
      <div class="location-detail"></div>
      <p class="ai-disclaimer"></p>
      <p class="application-angle"></p>
      <p class="source-note"></p>
    </details>
  `;
  return card;
}

function renderActions(container, job, status) {
  container.innerHTML = "";
  const eligibility = autoApplyEligibility(job, status);

  if (["none", "interested", "later"].includes(status)) {
    if (eligibility.eligible) {
      addButton(container, "Review Auto Apply", "review-auto-apply", job);
    } else {
      addLink(container, "Open application", job.url);
    }
    addButton(container, "Interested", "interested", job);
    addButton(container, "Later", "later", job);
    addButton(container, "Not fit", "rejected", job);
    return;
  }

  addLink(container, "Open application", job.url);

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
    const blockers = autoApplyEligibility(job, status).blockers;
    addOverflow(container, [
      ["Mark internally as Applied", "applied"],
      ["Archive", "archived"]
    ], job);
    if (blockers.length) {
      const note = document.createElement("p");
      note.className = "eligibility-note";
      note.textContent = `Auto Apply hidden: ${blockers.join("; ")}.`;
      container.appendChild(note);
    }
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
  if (action === "review-auto-apply") {
    button.className = "auto-apply-button";
    button.addEventListener("click", () => openAutoApplyReview(job));
  } else {
    button.addEventListener("click", () => setAction(job.id, action, job.source));
  }
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
  const inboxNewJobs = inboxJobs.filter((job) => job.isNew).length;
  els.inboxCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : inboxJobs.length;
  els.excellentCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : inboxJobs.filter((job) => job.score >= 85).length;
  els.pipelineCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : pipelineJobs.length;
  els.newFoundCount.textContent = state.loadState === "loading" && !state.jobs.length ? "-" : inboxNewJobs;
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
  els.recommendationText.textContent = `Apply first: ${toTitleCase(best.title)} at ${best.company}. ${best.score}% match, ${compactLocation(best.locationDetails.city || best.location)}, source ${best.source || "unknown"}. ${AI_CONTENT_DISCLAIMER}`;
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

function renderSettings() {
  els.autoApplyThreshold.value = state.settings.autoApplyThreshold;
  els.approvedResume.value = state.settings.approvedResume;
  els.cityPreference.value = state.settings.cityPreference;
  els.workModePreference.value = state.settings.workModePreference;
}

function openAutoApplyReview(job) {
  const status = getStatus(job.id);
  const eligibility = autoApplyEligibility(job, status);
  state.reviewJobId = job.id;
  els.reviewTitle.textContent = `${toTitleCase(job.title)} at ${job.company}`;
  els.reviewOpenLink.href = job.url;
  els.confirmAutoApply.disabled = !eligibility.eligible;
  els.reviewContent.innerHTML = reviewHtml(job, eligibility);
  els.reviewDialog.showModal();
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
    applicationMethod: "Auto Apply",
    submittedAt: new Date().toISOString(),
    locationVerificationStatus: locationStatusLabel(job.locationDetails)
  });
  els.reviewDialog.close();
}

function autoApplyEligibility(job, status) {
  const blockers = [];
  const threshold = state.settings.autoApplyThreshold;
  const location = job.locationDetails;
  if (threshold === "disabled") blockers.push("Auto Apply disabled");
  if (threshold !== "disabled" && Number(job.score) < Number(threshold)) blockers.push(`match below ${threshold}%`);
  if (!isValidApplicationLink(job.url)) blockers.push("unsafe or invalid application link");
  if (!isActiveJob(job)) blockers.push("job is not active");
  if (["applied", "interview", "offer"].includes(status)) blockers.push("already applied");
  if (!locationMeetsPreferences(location)) blockers.push("location or work mode outside preferences");
  if (!state.settings.approvedResume || !APPROVED_RESUMES[state.settings.approvedResume]) blockers.push("no approved resume selected");
  if (hasUnresolvedMandatoryQuestions(job)) blockers.push("unresolved mandatory questions");
  if (hasMissingRequiredDocuments(job)) blockers.push("missing required documents");
  if (hasUnsafeQuestions(job)) blockers.push("screening question needs manual review");
  if (BLACKLISTED_COMPANIES.includes(job.company)) blockers.push("blacklisted company");
  return { eligible: blockers.length === 0, blockers };
}

function reviewHtml(job, eligibility) {
  const location = job.locationDetails;
  const questions = asArray(job.mandatoryQuestions);
  const questionList = questions.length
    ? `<ul>${questions.map((question) => `<li>${escapeHtml(question.label || question)}</li>`).join("")}</ul>`
    : "<p>No unresolved mandatory questions detected.</p>";
  const blockers = eligibility.blockers.length
    ? `<div class="review-blockers"><strong>Cannot submit automatically</strong><ul>${eligibility.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
    : "<div class=\"review-ready\"><strong>Ready for explicit confirmation</strong><p>No blocking rule was triggered. Confirm only after reviewing the generated content.</p></div>";
  return `
    <div class="review-grid">
      <section>
        <strong>Job</strong>
        <p>${escapeHtml(toTitleCase(job.title))}</p>
        <p>${escapeHtml(job.company)} · ${escapeHtml(job.score)}% match</p>
      </section>
      <section>
        <strong>Work location</strong>
        <p>${escapeHtml(displayAddress(location))}</p>
        <p>${escapeHtml(locationStatusLabel(location))} · ${escapeHtml(location.locationSourceLabel)}</p>
      </section>
      <section>
        <strong>Selected resume</strong>
        <p>${escapeHtml(selectedResumeName() || "No approved resume selected")}</p>
      </section>
      <section>
        <strong>Required questions</strong>
        ${questionList}
      </section>
    </div>
    ${location.verificationStatus === "ai-suggested" ? `<p class="ai-warning">${escapeHtml(AI_LOCATION_DISCLAIMER)}</p>` : ""}
    <section class="cover-letter">
      <strong>Generated cover letter</strong>
      <p>${escapeHtml(generateCoverLetter(job))}</p>
      <p class="ai-warning">${escapeHtml(AI_CONTENT_DISCLAIMER)}</p>
    </section>
    ${blockers}
  `;
}

function generateCoverLetter(job) {
  const focus = resumeFocus(job).join(", ");
  return `I am interested in the ${toTitleCase(job.title)} role at ${job.company}. My background aligns with ${focus}, and I can contribute through Sales/Commercial Operations execution, CRM data quality, KPI reporting, contract and billing follow-up, and cross-functional coordination.`;
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

function setAction(jobId, status, source, extra = {}) {
  if (status === "none") {
    delete state.actions[jobId];
  } else {
    state.actions[jobId] = status === "later"
      ? { status, updatedAt: new Date().toISOString(), source, snoozedUntil: addDays(3).toISOString(), ...extra }
      : { status, updatedAt: new Date().toISOString(), source, ...extra };
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

function normalizeLocationDetails(job) {
  const raw = job.workLocation || job.location || "";
  const sourceType = locationSourceType(job);
  const city = detectCity(raw);
  const district = detectDistrict(raw);
  const workMode = job.workMode || inferWorkMode(raw);
  const verificationStatus = locationVerificationStatus(raw, sourceType);
  return {
    jobWorkAddress: raw || "",
    companyOfficeAddress: job.companyOfficeAddress || "",
    city,
    district,
    workMode,
    locationSource: sourceType,
    locationSourceLabel: locationSourceLabel(sourceType),
    verificationStatus
  };
}

function locationSourceType(job) {
  if (job.locationSource) return job.locationSource;
  const source = String(job.source || "").toLowerCase();
  if (/careers|company career|grab careers|sanofi careers|pmax careers|dat bike careers/.test(source)) return "official-company-career-page";
  if (job.location) return "job-description";
  return "ai-inference";
}

function locationVerificationStatus(raw, sourceType) {
  if (!raw) return "unknown";
  if (/\/| and | hoặc |, vietnam/i.test(raw) && /vietnam|hưng yên|remote|\/|metropolitan/i.test(raw)) return "multiple-offices";
  if (sourceType === "ai-inference") return "ai-suggested";
  if (sourceType === "job-description") return "from-job-description";
  if (["official-company-career-page", "official-company-website"].includes(sourceType)) return "verified";
  return "unknown";
}

function locationStatusLabel(location) {
  const labels = {
    "verified": "Verified",
    "from-job-description": "From job description",
    "ai-suggested": "AI suggested",
    "unknown": "Unknown",
    "multiple-offices": "Multiple offices"
  };
  return labels[location.verificationStatus] || "Unknown";
}

function locationSourceLabel(source) {
  const labels = {
    "job-description": "Job description",
    "official-company-career-page": "Official company career page",
    "official-company-website": "Official company website",
    "job-platform": "Job platform",
    "ai-inference": "AI inference"
  };
  return labels[source] || "Job platform";
}

function locationDetailHtml(location) {
  const rows = [
    ["Job work address", location.jobWorkAddress || "Unknown"],
    ["Company office address", location.companyOfficeAddress || "Unknown"],
    ["City", location.city || "Unknown"],
    ["District", location.district || "Unknown"],
    ["Work mode", compactWorkMode(location.workMode)],
    ["Location source", location.locationSourceLabel],
    ["Verification", locationStatusLabel(location)]
  ];
  return `<div class="location-detail-grid">${rows.map(([label, value]) => `<p><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></p>`).join("")}</div>${location.verificationStatus === "ai-suggested" ? `<p class="ai-warning">${escapeHtml(AI_LOCATION_DISCLAIMER)}</p>` : ""}`;
}

function displayAddress(location) {
  return location.jobWorkAddress || location.companyOfficeAddress || location.city || "Unknown";
}

function detectCity(value = "") {
  if (/remote/i.test(value)) return "Remote";
  if (/hồ chí minh|ho chi minh|hcm|tphcm/i.test(value)) return "Ho Chi Minh City";
  if (/hà nội|ha noi|hanoi/i.test(value)) return "Ha Noi";
  if (/hưng yên|hung yen/i.test(value)) return "Hung Yen";
  if (/vietnam/i.test(value)) return "Vietnam";
  return value || "Unknown";
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
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !/linkedin\.com\/jobs\/search/i.test(parsed.href);
  } catch {
    return false;
  }
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
