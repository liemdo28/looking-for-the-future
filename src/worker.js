import { INDEX_HTML } from "./generated-index.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const noStoreHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-AIJH-Version": "AIJH-AUDIT-FIX-20260722-1430"
    };

    if ((url.pathname === "/" || url.pathname === "/index.html") && request.method === "GET") {
      return new Response(INDEX_HTML, {
        headers: {
          ...noStoreHeaders,
          "Content-Type": "text/html; charset=utf-8"
        }
      });
    }

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

    const response = await env.STATIC.fetch(request);
    const headers = new Headers(response.headers);
    Object.entries(noStoreHeaders).forEach(([key, value]) => headers.set(key, value));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
