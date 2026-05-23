import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

const navItems = [
  { path: "/", icon: "🏠", label: "首页" },
  { path: "/upload", icon: "📷", label: "记录" },
  { path: "/library", icon: "📚", label: "知识库" },
  { path: "/graph", icon: "🕸️", label: "关联图" },
  { path: "/settings", icon: "⚙️", label: "设置" },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <span className="font-semibold text-foreground text-lg tracking-tight">第二大脑</span>
          </div>
          {user && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-xs">
                {user.name?.[0] || "U"}
              </div>
              <span className="hidden sm:block">{user.name || "用户"}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 pb-24">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-around h-16">
            {navItems.map((item) => {
              const isActive = location === item.path;
              return (
                <Link key={item.path} href={item.path}>
                  <button
                    className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all ${
                      isActive
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="text-xl leading-none">{item.icon}</span>
                    <span className="text-[11px] font-medium">{item.label}</span>
                  </button>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}
