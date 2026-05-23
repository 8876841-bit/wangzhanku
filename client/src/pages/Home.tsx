import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { AppLayout } from "@/components/AppLayout";
import { CATEGORY_ICONS, CATEGORY_LABELS, STATUS_COLORS, formatRelativeTime } from "@/lib/entryUtils";
import type { EntryCategory, EntryStatus } from "@/lib/entryUtils";

interface DashboardView {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  href: string;
}

const DASHBOARD_VIEWS: DashboardView[] = [
  { key: "processing",     label: "处理中",   icon: "⏳", color: "bg-gray-50 border-gray-200",    description: "AI 正在分析",          href: "/library?status=processing" },
  { key: "pending_review", label: "待校正",   icon: "✏️", color: "bg-amber-50 border-amber-200",  description: "等待你一句话确认",      href: "/library?status=pending_review" },
  { key: "needs_deepdive", label: "待深挖",   icon: "🔭", color: "bg-purple-50 border-purple-200", description: "AI 标记值得深入研究",   href: "/library?status=needs_deepdive" },
  { key: "archived",       label: "已入库",   icon: "✅", color: "bg-green-50 border-green-200",  description: "已确认并推送 GitHub",   href: "/library?status=archived" },
  { key: "upgradeable",    label: "可升级模型", icon: "🧩", color: "bg-indigo-50 border-indigo-200", description: "积累 3+ 条，可建模",   href: "/clusters" },
  { key: "duplicate",      label: "重复聚合", icon: "🔄", color: "bg-orange-50 border-orange-200", description: "与已有内容高度相似",    href: "/library?status=duplicate" },
  { key: "models",         label: "我的模型", icon: "🧠", color: "bg-teal-50 border-teal-200",    description: "已升级的认知框架",      href: "/clusters?status=upgraded" },
];

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const { data: stats } = trpc.entries.dashboardStats.useQuery(undefined, { enabled: isAuthenticated });
  const { data: recentEntries } = trpc.entries.list.useQuery(
    { status: "all", limit: 5, offset: 0 },
    { enabled: isAuthenticated }
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center"><div className="text-5xl mb-4">🧠</div><p className="text-muted-foreground">加载中...</p></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background">
        <div className="text-center px-6 max-w-sm">
          <div className="text-7xl mb-6">🧠</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">认知处理系统</h1>
          <p className="text-muted-foreground mb-2 text-sm font-medium">低摩擦输入 → AI识别 → 用户校正 → 自动入库</p>
          <p className="text-muted-foreground mb-8 text-xs leading-relaxed">
            11类分类体系 · 完整生命周期 · GitHub自动入库 · 认知模型升级
          </p>
          <a href={getLoginUrl()}>
            <button className="bg-primary text-white px-8 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 w-full">
              登录开始使用
            </button>
          </a>
        </div>
      </div>
    );
  }

  const statsMap: Record<string, number> = {
    processing: stats?.processing || 0,
    pending_review: stats?.pending_review || 0,
    needs_deepdive: stats?.needs_deepdive || 0,
    archived: stats?.archived || 0,
    upgradeable: stats?.upgradeable || 0,
    duplicate: stats?.duplicate || 0,
    models: stats?.models || 0,
  };

  const urgentCount = (stats?.pending_review || 0) + (stats?.needs_deepdive || 0);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
        {/* Header */}
        <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-white shadow-lg shadow-primary/20">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🧠</span>
            <div>
              <h1 className="text-lg font-bold">认知处理系统</h1>
              <p className="text-white/70 text-xs">你好，{user?.name || "朋友"}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold">{stats?.total ?? 0}</div>
              <div className="text-[11px] text-white/70">总条目</div>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold">{stats?.archived ?? 0}</div>
              <div className="text-[11px] text-white/70">已入库</div>
            </div>
            <div className={`rounded-xl p-2.5 text-center ${urgentCount > 0 ? "bg-amber-400/30" : "bg-white/15"}`}>
              <div className="text-xl font-bold">{urgentCount}</div>
              <div className="text-[11px] text-white/70">待处理</div>
            </div>
          </div>
        </div>

        {/* Quick input */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/input">
            <button className="w-full rounded-2xl bg-white border border-border p-4 flex items-center gap-3 hover:shadow-md hover:border-primary/30 transition-all text-left active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl flex-shrink-0">📷</div>
              <div>
                <div className="font-semibold text-sm text-foreground">拍照输入</div>
                <div className="text-xs text-muted-foreground">支持批量多图</div>
              </div>
            </button>
          </Link>
          <Link href="/input?mode=text">
            <button className="w-full rounded-2xl bg-white border border-border p-4 flex items-center gap-3 hover:shadow-md hover:border-primary/30 transition-all text-left active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">✍️</div>
              <div>
                <div className="font-semibold text-sm text-foreground">文字输入</div>
                <div className="text-xs text-muted-foreground">直接输入内容</div>
              </div>
            </button>
          </Link>
        </div>

        {/* 7-view Dashboard */}
        <div>
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-3">处理流水线</h2>
          <div className="grid grid-cols-2 gap-2">
            {DASHBOARD_VIEWS.map((view) => {
              const count = statsMap[view.key] || 0;
              const isUrgent = (view.key === "pending_review" || view.key === "needs_deepdive") && count > 0;
              return (
                <Link key={view.key} href={view.href}>
                  <div className={`rounded-xl border p-3.5 hover:shadow-sm transition-all cursor-pointer active:scale-[0.98] ${view.color} ${isUrgent ? "ring-2 ring-amber-400/50" : ""}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xl">{view.icon}</span>
                      <span className={`text-lg font-bold ${count > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                        {count}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{view.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{view.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent entries */}
        {recentEntries && recentEntries.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">最近输入</h2>
              <Link href="/library?status=all">
                <span className="text-sm text-primary cursor-pointer">全部 →</span>
              </Link>
            </div>
            <div className="space-y-2">
              {recentEntries.map((entry) => {
                const cat = entry.category as EntryCategory;
                const status = entry.status as EntryStatus;
                return (
                  <Link key={entry.id} href={`/entry/${entry.id}`}>
                    <div className="bg-white rounded-xl border border-border p-3.5 hover:shadow-sm hover:border-primary/20 transition-all cursor-pointer active:scale-[0.99]">
                      <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5 flex-shrink-0">{CATEGORY_ICONS[cat]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>
                              {STATUS_LABELS[status]}
                            </span>
                            <span className="text-xs text-muted-foreground ml-auto">{formatRelativeTime(entry.createdAt)}</span>
                          </div>
                          <p className="text-sm font-semibold text-foreground truncate">
                            {entry.title || entry.rawText?.slice(0, 40) || "处理中..."}
                          </p>
                          {entry.summary && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.summary}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {(!recentEntries || recentEntries.length === 0) && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📥</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">开始你的第一条输入</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto leading-relaxed">
              拍照或输入文字，AI 会自动识别分类，你只需一句话校正确认
            </p>
            <Link href="/input">
              <button className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">
                开始输入 →
              </button>
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  processing: "处理中", pending_review: "待校正", confirmed: "已确认",
  archived: "已入库", needs_deepdive: "待深挖", duplicate: "重复",
  upgradeable: "可升级", model: "已建模",
};
