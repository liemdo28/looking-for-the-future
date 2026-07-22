import assert from "node:assert/strict";
import worker from "../src/worker.js";

class MemoryKv {
  constructor() {
    this.map = new Map();
  }
  async get(key, type) {
    const value = this.map.get(key);
    if (value == null) return null;
    return type === "json" ? JSON.parse(value) : value;
  }
  async put(key, value) {
    this.map.set(key, value);
  }
  async delete(key) {
    this.map.delete(key);
  }
  async list({ prefix = "" } = {}) {
    return {
      list_complete: true,
      keys: [...this.map.keys()].filter((name) => name.startsWith(prefix)).map((name) => ({ name }))
    };
  }
}

const sourceGroups = [
  {
    group: "F1. Official HCMC Career Sources v2 - Grade A",
    sources: [
      "Acme SaaS | Technology | Custom | HCMC sales operations roles | https://example.com/careers | fixture source"
    ]
  }
];

const env = {
  JOB_ACTIONS_KV: new MemoryKv(),
  STATIC: {
    async fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/data/sources.json") return Response.json(sourceGroups);
      if (url.pathname === "/data/jobs.json") return Response.json([]);
      return new Response("not found", { status: 404 });
    }
  }
};

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  if (url.href === "https://example.com/careers") {
    return new Response('<a href="/jobs/sales-operations-specialist">Sales Operations Specialist</a>', {
      headers: { "Content-Type": "text/html" }
    });
  }
  return originalFetch(input);
};

const pending = [];
const ctx = {
  waitUntil(promise) {
    pending.push(promise);
  }
};

const startResponse = await worker.fetch(new Request("https://app.local/api/sync", {
  method: "POST",
  body: JSON.stringify({ mode: "due_sources", tiers: ["A"], maxSources: 1, force: true }),
  headers: { "Content-Type": "application/json" }
}), env, ctx);
assert.equal(startResponse.status, 202);
const startPayload = await startResponse.json();
assert.equal(startPayload.status, "queued");
assert.ok(startPayload.syncRunId);

await Promise.all(pending);

const statusResponse = await worker.fetch(new Request(`https://app.local/api/sync/${startPayload.syncRunId}`), env, ctx);
const statusPayload = await statusResponse.json();
assert.equal(statusPayload.status, "completed");
assert.equal(statusPayload.totalSources, 1);
assert.equal(statusPayload.newJobs, 1);

const sourceResponse = await worker.fetch(new Request(`https://app.local/api/sync/${startPayload.syncRunId}/sources`), env, ctx);
const sourcePayload = await sourceResponse.json();
assert.equal(sourcePayload.sources.length, 1);
assert.equal(sourcePayload.sources[0].status, "success");
assert.equal(sourcePayload.sources[0].jobsFetched, 1);

const jobsResponse = await worker.fetch(new Request("https://app.local/api/sync"), env, ctx);
const jobsPayload = await jobsResponse.json();
assert.equal(jobsPayload.jobs.length, 1);
assert.equal(jobsPayload.jobs[0].title, "Sales Operations Specialist");

globalThis.fetch = originalFetch;
console.log("sync-api integration tests passed");
