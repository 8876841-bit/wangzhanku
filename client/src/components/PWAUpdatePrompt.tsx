import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

const KNOWN_VERSION_KEY = "app_known_build_time";

export function PWAUpdatePrompt() {
  const [showBanner, setShowBanner] = useState(false);
  const [latestBuildTime, setLatestBuildTime] = useState<string | null>(null);

  const { data } = trpc.version.check.useQuery(undefined, {
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!data?.buildTime) return;

    const serverBuildTime = data.buildTime;
    const knownBuildTime = localStorage.getItem(KNOWN_VERSION_KEY);

    if (!knownBuildTime) {
      // First visit: record this version as known, don't show banner
      localStorage.setItem(KNOWN_VERSION_KEY, serverBuildTime);
      return;
    }

    if (serverBuildTime !== knownBuildTime) {
      // Server has a newer version than what user last saw
      setLatestBuildTime(serverBuildTime);
      setShowBanner(true);
    }
  }, [data]);

  const handleUpdate = () => {
    // Record the new version BEFORE reloading, so after reload it won't trigger again
    if (latestBuildTime) {
      localStorage.setItem(KNOWN_VERSION_KEY, latestBuildTime);
    }

    // Clear caches then reload
    const doReload = () => window.location.reload();
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      }).then(doReload, doReload);
    } else {
      doReload();
    }
  };

  const handleDismiss = () => {
    // User dismisses: record the new version so it won't show again until next update
    if (latestBuildTime) {
      localStorage.setItem(KNOWN_VERSION_KEY, latestBuildTime);
    }
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] animate-fade-in">
      <div className="bg-primary text-white px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg flex-shrink-0">🔄</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">有新版本可用</p>
            <p className="text-xs text-white/75 mt-0.5">点击立即更新，获取最新功能</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleDismiss}
            className="text-white/60 hover:text-white text-xs px-2 py-1 transition-colors"
          >
            稍后
          </button>
          <button
            onClick={handleUpdate}
            className="bg-white text-primary text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-white/90 transition-colors"
          >
            立即更新
          </button>
        </div>
      </div>
    </div>
  );
}
