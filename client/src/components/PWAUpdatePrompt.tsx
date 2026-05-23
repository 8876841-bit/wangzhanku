import { useEffect, useState, useRef } from "react";
import { trpc } from "@/lib/trpc";

declare const __APP_BUILD_TIME__: string;

// Get the build time baked in at compile time
const CLIENT_BUILD_TIME = typeof __APP_BUILD_TIME__ !== "undefined"
  ? __APP_BUILD_TIME__
  : new Date().toISOString();

export function PWAUpdatePrompt() {
  const [showBanner, setShowBanner] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const checkedRef = useRef(false);

  const { data } = trpc.version.check.useQuery(undefined, {
    // Check once on mount, then every 2 minutes
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!data) return;
    
    const serverBuildTime = data.buildTime;
    
    // Compare: if server has a newer build time than client
    if (serverBuildTime && serverBuildTime !== CLIENT_BUILD_TIME) {
      if (!dismissed) {
        setShowBanner(true);
      }
    }
  }, [data, dismissed]);

  const handleUpdate = () => {
    // Clear all caches and reload
    const doReload = () => window.location.reload();
    if ("caches" in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      }).then(doReload, doReload);
    } else {
      doReload();
    }
  };

  if (!showBanner || dismissed) return null;

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
            onClick={() => setDismissed(true)}
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
