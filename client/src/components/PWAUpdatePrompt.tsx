import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      // Check for updates every 60 seconds when app is open
      if (r) {
        setInterval(() => r.update(), 60 * 1000);
      }
    },
  });

  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when a new update is detected
  useEffect(() => {
    if (needRefresh) setDismissed(false);
  }, [needRefresh]);

  if (!needRefresh || dismissed) return null;

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
            onClick={() => updateServiceWorker(true)}
            className="bg-white text-primary text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-white/90 transition-colors"
          >
            立即更新
          </button>
        </div>
      </div>
    </div>
  );
}
