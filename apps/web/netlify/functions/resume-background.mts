// The scheduler only dispatches. This background function can wait for bounded
// workflow steps without exceeding Netlify's 30-second scheduler limit.
export default async function resume(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== "Bearer " + process.env.CRON_SECRET
  )
    return new Response("Unauthorized", { status: 401 });
  const origin = process.env.APP_URL;
  if (!origin || process.env.CONTEXT !== "production")
    return new Response(null, { status: 204 });
  for (let step = 0; step < 6; step++) {
    const response = await fetch(origin + "/api/internal/tick", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.CRON_SECRET },
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) break;
    const result = await response.json();
    if (!result.progressed) break;
    await new Promise((resolve) => setTimeout(resolve, 2200));
  }
  return new Response(null, { status: 204 });
}
