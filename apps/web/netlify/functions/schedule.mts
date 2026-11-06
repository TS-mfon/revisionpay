export default async function schedule() {
  if (
    process.env.CONTEXT !== "production" ||
    !process.env.APP_URL ||
    !process.env.CRON_SECRET
  )
    return new Response(null, { status: 204 });
  await fetch(process.env.APP_URL + "/.netlify/functions/resume-background", {
    method: "POST",
    headers: { Authorization: "Bearer " + process.env.CRON_SECRET },
    signal: AbortSignal.timeout(10000),
  });
  return new Response(null, { status: 204 });
}
export const config = { schedule: "*/5 * * * *" };
