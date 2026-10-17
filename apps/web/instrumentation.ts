/**
 * Server startup hook.
 *
 * Next.js loads .env files from its own project root (apps/web), but this repo
 * keeps a single .env at the monorepo root. Without this, any route that does
 * not happen to import @repo/database would see an empty process.env -- which
 * is how the GitHub OAuth route ended up reporting "sign-in not configured"
 * with valid credentials sitting in the root .env.
 *
 * instrumentation runs once per server process, so the environment is loaded
 * before any route handler executes.
 */

export async function register() {
  // Only the Node.js runtime needs this; the edge runtime cannot read the
  // filesystem, and middleware runs on the edge.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { loadRepoEnv } = await import("@repo/database");
  loadRepoEnv();
}
