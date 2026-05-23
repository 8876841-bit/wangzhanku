import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { AppLayout } from "@/components/AppLayout";
import { CATEGORY_ICONS, CATEGORY_LABELS, STATUS_COLORS, STATUS_LABELS, NEXT_ACTION_ICONS, NEXT_ACTION_LABELS, formatRelativeTime } from "@/lib/entryUtils";
import type { EntryCategory, EntryStatus } from "@/lib/entryUtils";

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
          <p className="text-muted-foreground mb-2 text-sm font-medium">随手丢进去 · AI 帮你判断 · 一句话校正 · 自动沉淀</p>
          <p className="text-muted-foreground mb-8 text-xs leading-relaxed">
            11类分类 · 完整生命周期 · GitHub自动入库 · 认知模型升级
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

  const needsAction = (stats?.pending_review || 0) + (stats?.needs_deepdive || 0);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
        {/* Header strip */}
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
            <div className={`rounded-xl p-2.5 text-center ${needsAction > 0 ? "bg-amber-400/30" : "bg-white/15"}`}>
              <div className="text-xl font-bold">{needsAction}</div>
              <div className="text-[11px] text-white/70">需处理</div>
            </div>
          </div>
        </div>

        {/* 4 core entrances */}
        <div className="grid grid-cols-2 gap-3">
          {/* 1. 快速输入 */}
          <Link href="/input">
            <button className="w-full rounded-2xl bg-primary text-white p-4 flex items-center gap-3 hover:bg-primary/90 transition-all text-left active:scale-[0.98] shadow-lg shadow-primary/20 col-span-2">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center text-2xl flex-shrink-0">📥</div>
              <div>
                <div className="font-bold text-base">快速输入</div>
                <div className="text-xs text-white/75">拍照 / 截图 / 文字，随手丢进来</div>
              </div>
            </button>
          </Link>

          {/* 2. 等我确认 */}
          <Link href="/library?status=pending_review">
            <button className={`w-full rounded-2xl border p-4 flex items-center gap-3 hover:shadow-md transition-all text-left active:scale-[0.98] ${(stats?.pending_review || 0) > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-border"}`}>
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-xl flex-shrink-0">✏️</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-foreground">等我确认</div>
                <div className="text-xs text-muted-foreground">一句话校正后入库</div>
              </div>
              {(stats?.pending_review || 0) > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                  {stats?.pending_review}
                </span>
              )}
            </button>
          </Link>

          {/* 3. 值得深挖 */}
          <Link href="/library?status=needs_deepdive">
            <button className={`w-full rounded-2xl border p-4 flex items-center gap-3 hover:shadow-md transition-all text-left active:scale-[0.98] ${(stats?.needs_deepdive || 0) > 0 ? "bg-purple-50 border-purple-200" : "bg-white border-border"}`}>
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-xl flex-shrink-0">🔭</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-foreground">值得深挖</div>
                <div className="text-xs text-muted-foreground">AI 标记值得深入研究</div>
              </div>
              {(stats?.needs_deepdive || 0) > 0 && (
                <span className="bg-purple-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                  {stats?.needs_deepdive}
                </span>
              )}
            </button>
          </Link>

          {/* 4. 我的模型 */}
          <Link href="/clusters">
            <button className="w-full rounded-2xl bg-white border border-border p-4 flex items-center gap-3 hover:shadow-md hover:border-teal-200 transition-all text-left active:scale-[0.98] col-span-2">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-xl flex-shrink-0">🧩</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-foreground">我的模型</div>
                <div className="text-xs text-muted-foreground">
                  {(stats?.upgradeable || 0) > 0
                    ? `${stats?.upgradeable} 个知识簇可升级为认知模型`
                    : `${stats?.models || 0} 个认知模型已建立`}
                </div>
              </div>
              {(stats?.upgradeable || 0) > 0 && (
                <span className="bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                  {stats?.upgradeable} 可升级
                </span>
              )}
            </button>
          </Link>
        </div>

        {/* Recent entries */}
        {recentEntries && recentEntries.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground text-sm">最近输入</h2>
              <Link href="/library?status=all">
                <span className="text-xs text-primary cursor-pointer">全部 →</span>
              </Link>
            </div>
            <div className="space-y-2">
              {recentEntries.map((entry) => {
                const cat = entry.category as EntryCategory;
                const status = entry.status as EntryStatus;
                const isActionable = status === "pending_review" || status === "needs_deepdive";
                const unpacked = (() => {
                  try { return JSON.parse((entry as any).noteItemsJson || "{}"); } catch { return {}; }
                })();
                const nextActionType = unpacked.nextActionType || (entry as any).nextActionType;
                const nextAction = unpacked.nextAction || (entry as any).nextAction;

                return (
                  <Link key={entry.id} href={isActionable ? `/review/${entry.id}` : `/entry/${entry.id}`}>
                    <div className={`bg-white rounded-xl border p-3.5 hover:shadow-sm transition-all cursor-pointer active:scale-[0.99] ${isActionable ? "border-amber-200" : "border-border hover:border-primary/20"}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5 flex-shrink-0">{CATEGORY_ICONS[cat]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                            <span className="text-xs text-muted-foreground ml-auto">{formatRelativeTime(entry.createdAt)}</span>
                          </div>
                          <p className="text-sm font-semibold text-foreground truncate">
                            {entry.title || entry.rawText?.slice(0, 40) || "处理中..."}
                          </p>
                          {/* Next action */}
                          {nextAction && status === "archived" && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-xs">{NEXT_ACTION_ICONS[nextActionType] || "⚡"}</span>
                              <span className="text-xs text-muted-foreground truncate">{nextAction}</span>
                            </div>
                          )}
                        </div>
                        {isActionable && <span className="text-amber-500 text-sm flex-shrink-0 mt-1">→</span>}
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
            <h2 className="text-lg font-semibold text-foreground mb-2">随手丢进来</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto leading-relaxed">
              拍照、截图或输入文字，AI 自动识别分类，你只需一句话确认
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
