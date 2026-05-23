import { router, publicProcedure } from "./_core/trpc";

// Server build time - set at process start, changes every deployment
const SERVER_BUILD_TIME = new Date().toISOString();

export const versionRouter = router({
  check: publicProcedure.query(() => {
    return {
      buildTime: SERVER_BUILD_TIME,
      serverTime: new Date().toISOString(),
    };
  }),
});
