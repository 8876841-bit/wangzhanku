import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if dismissed before
    if (localStorage.getItem("pwa-install-dismissed")) return;

    // Detect iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(ios);

    // Listen for Android/Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("pwa-install-dismissed", "1");
  };

  // Don't show if already dismissed or already installed
  if (dismissed) return null;

  // Android/Chrome: show native install button
  if (installPrompt) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-40 animate-fade-in">
        <div className="bg-gray-900 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3">
          <img src="/icon-192.png" alt="App Icon" className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">安装到桌面</p>
            <p className="text-xs text-white/70 mt-0.5">像 App 一样使用，更方便</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={handleDismiss}
              className="text-white/60 hover:text-white text-xs px-2 py-1"
            >
              忽略
            </button>
            <button
              onClick={handleInstall}
              className="bg-white text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-white/90 transition-colors"
            >
              安装
            </button>
          </div>
        </div>
      </div>
    );
  }

  // iOS: show manual guide
  if (isIOS && !showIOSGuide) {
    return (
      <div className="fixed bottom-20 left-4 right-4 z-40 animate-fade-in">
        <div className="bg-gray-900 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3">
          <img src="/icon-192.png" alt="App Icon" className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">添加到主屏幕</p>
            <p className="text-xs text-white/70 mt-0.5">像 App 一样使用</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={handleDismiss} className="text-white/60 text-xs px-2 py-1">忽略</button>
            <button
              onClick={() => setShowIOSGuide(true)}
              className="bg-white text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-lg"
            >
              如何操作
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isIOS && showIOSGuide) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-end p-4" onClick={() => setShowIOSGuide(false)}>
        <div
          className="bg-white rounded-2xl p-5 w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="font-bold text-foreground mb-4 text-center">添加到 iPhone 主屏幕</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
              <p className="text-sm text-foreground pt-0.5">点击 Safari 底部的 <strong>分享按钮</strong>（方框加箭头图标 ⬆）</p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
              <p className="text-sm text-foreground pt-0.5">在菜单中向下滑动，找到 <strong>「添加到主屏幕」</strong></p>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
              <p className="text-sm text-foreground pt-0.5">点击右上角的 <strong>「添加」</strong>，图标就会出现在桌面</p>
            </div>
          </div>
          <button
            onClick={() => { setShowIOSGuide(false); handleDismiss(); }}
            className="w-full mt-5 py-3 bg-primary text-white rounded-xl font-medium text-sm"
          >
            知道了
          </button>
        </div>
      </div>
    );
  }

  return null;
}
