// This component injects the build time into the DOM so the server can read it
// It's used by the version check API to compare client vs server build times

declare const __APP_BUILD_TIME__: string;

export function BuildTimeInjector() {
  // This is a no-op component - the build time is injected via the define config
  // and read directly from the __APP_BUILD_TIME__ global in PWAUpdatePrompt
  return null;
}
