export async function onRequestGet(context) {
  const jobs = [];

  if (context.env.JOB_SEARCH_ENDPOINT) {
    try {
      const response = await fetch(context.env.JOB_SEARCH_ENDPOINT, {
        headers: { "Accept": "application/json" }
      });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload.jobs)) jobs.push(...payload.jobs);
      }
    } catch {
      // Keep the dashboard usable when the optional search provider is unavailable.
    }
  }

  return Response.json({
    checkedAt: new Date().toISOString(),
    syncIntervalMinutes: 60,
    jobs
  });
}
