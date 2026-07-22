const ACTION_STORE_KEY = "actions:v1:shared-dashboard";

export async function onRequestGet({ env }) {
  return Response.json(await readActionStore(env));
}

export async function onRequestPost({ request, env }) {
  const payload = await request.json().catch(() => ({}));
  return Response.json(await updateActionStore(env, payload));
}

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
