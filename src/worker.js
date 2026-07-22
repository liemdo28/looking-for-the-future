export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/sync" && request.method === "GET") {
      return Response.json({
        checkedAt: new Date().toISOString(),
        syncIntervalMinutes: 60,
        jobs: []
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

    return env.STATIC.fetch(request);
  }
};
