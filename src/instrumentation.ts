// Next.js calls register() once when the server starts. The in-process job
// worker runs only where a process actually stays alive — local dev or a
// single long-running node server. On serverless (Vercel) there is no such
// process: /api/jobs/tick is driven by cron instead (see vercel.json).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startInProcessWorker } = await import("@/server/jobs/worker");
    startInProcessWorker();
  }
}
