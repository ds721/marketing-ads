// Next.js calls register() once when the server starts. That's where the
// in-process job worker is switched on (JOBS_ENABLED=true) so scheduled posts
// go out without a separate process — fine for development and small
// deployments. Multi-instance production should drive /api/jobs/tick from a
// cron instead and leave JOBS_ENABLED unset.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startInProcessWorker } = await import("@/server/jobs/worker");
    startInProcessWorker();
  }
}
