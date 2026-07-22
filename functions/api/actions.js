export async function onRequestPost({ request, env }) {
  const action = await request.json();
  const payload = {
    ...action,
    updatedAt: action.updatedAt || new Date().toISOString()
  };

  if (env.JOB_ACTIONS_KV) {
    await env.JOB_ACTIONS_KV.put(payload.jobId, JSON.stringify(payload));
  }

  return Response.json({ ok: true, action: payload });
}
