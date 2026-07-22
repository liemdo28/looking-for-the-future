const ACTION_STORE_KEY = "actions:v1:shared-dashboard";
const ACTION_PREFIX = "action:v1:";
const NOTE_PREFIX = "note:v1:";

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
  const [actions, notes] = await Promise.all([
    readKvPrefix(env.JOB_ACTIONS_KV, ACTION_PREFIX),
    readKvPrefix(env.JOB_ACTIONS_KV, NOTE_PREFIX)
  ]);
  return {
    ...empty,
    ...(stored && typeof stored === "object" ? stored : {}),
    actions: {
      ...((stored && typeof stored === "object" && stored.actions) || {}),
      ...actions
    },
    notes: {
      ...((stored && typeof stored === "object" && stored.notes) || {}),
      ...notes
    },
    ok: true,
    persisted: true
  };
}

async function updateActionStore(env, payload) {
  const now = new Date().toISOString();
  const persisted = Boolean(env.JOB_ACTIONS_KV);

  if (payload.type === "note") {
    if (!payload.jobId) return { ok: false, persisted, error: "Missing jobId" };
    const value = String(payload.note || "").trim();
    const key = `${NOTE_PREFIX}${payload.jobId}`;
    let notePayload = null;
    if (value) {
      notePayload = {
        note: value,
        updatedAt: payload.updatedAt || now
      };
      if (env.JOB_ACTIONS_KV) await env.JOB_ACTIONS_KV.put(key, JSON.stringify(notePayload));
    } else if (env.JOB_ACTIONS_KV) {
      await env.JOB_ACTIONS_KV.delete(key);
    }
    return { ok: true, persisted, jobId: payload.jobId, note: notePayload, updatedAt: now };
  } else {
    if (!payload.jobId) return { ok: false, persisted, error: "Missing jobId" };
    const action = {
      ...payload,
      updatedAt: payload.updatedAt || now
    };
    delete action.type;
    const key = `${ACTION_PREFIX}${payload.jobId}`;
    if (env.JOB_ACTIONS_KV) {
      if (action.status === "none") await env.JOB_ACTIONS_KV.delete(key);
      else await env.JOB_ACTIONS_KV.put(key, JSON.stringify(action));
    }
    return { ok: true, persisted, jobId: payload.jobId, action: action.status === "none" ? null : action, updatedAt: now };
  }
}

async function readKvPrefix(kv, prefix) {
  const rows = {};
  let cursor;
  do {
    const page = await kv.list({ prefix, cursor });
    await Promise.all(page.keys.map(async (item) => {
      const value = await kv.get(item.name, "json").catch(() => null);
      if (value && typeof value === "object") rows[item.name.slice(prefix.length)] = value;
    }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return rows;
  }
