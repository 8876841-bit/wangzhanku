import { router, publicProcedure } from "./_core/trpc";
import { readFileSync } from "fs";
import { join } from "path";

// Read build time from a file written during deployment, or use a fixed env var
// This must be STABLE across server restarts for the same deployment
function getDeploymentBuildTime(): string {
  // Try to read from a build-time file
  try {
    const buildInfoPath = join(process.cwd(), "dist/public/build-info.json");
    const content = readFileSync(buildInfoPath, "utf-8");
    const info = JSON.parse(content) as { buildTime: string };
    return info.buildTime;
  } catch {}

  // Fallback: use BUILD_TIME env var (set during deployment)
  if (process.env.BUILD_TIME) return process.env.BUILD_TIME;

  // Last resort: use a fixed string that changes only when code changes
  // This is set at module load time (server start), stable until next deploy
  return STABLE_BUILD_ID;
}

// This is evaluated once when the module loads.
// In production, each deployment creates a new server process, so this changes per deploy.
// In development, it stays the same until server restart.
const STABLE_BUILD_ID = new Date().toISOString();

export const versionRouter = router({
  check: publicProcedure.query(() => {
    return {
      buildTime: getDeploymentBuildTime(),
    };
  }),
});
