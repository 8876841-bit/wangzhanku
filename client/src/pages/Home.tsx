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
  const { data: topActions } = trpc.entries.topNextActions.useQuery(undefined, { enabled: isAuthenticated });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🧠</div>
          <p className="text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-white">
        <div className="text-center px-6 max-w-sm">
          <div className="text-7xl mb-6">🧠</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">认知处理系统</h1>
          <p className="text-gray-500 mb-2 text-sm font-medium">随手丢进去 · AI 帮你判断 · 一句话校正 · 自动沉淀</p>
          <p className="text-gray-400 mb-8 text-xs leading-relaxed">
            11类分类 · 完整生命周期 · GitHub自动入库 · 认知模型升级
          </p>
          <a href={getLoginUrl()}>
            <button className="bg-blue-600 text-white px-8 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-lg w-full">
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
      <div className="max-w-2xl mx-auto space-y-4 p-4">

        {/* Header strip */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-500 p-5 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🧠</span>
            <div>
              <h1 className="text-lg font-bold">认知处理系统</h1>
              <p className="text-white/70 text-xs">你好，{user?.name || "朋友"}</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold">{stats?.total ?? 0}</div>
              <div className="text-[10px] text-white/70">总条目</div>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold">{stats?.archived ?? 0}</div>
              <div className="text-[10px] text-white/70">已入库</div>
            </div>
            <div className={"rounded-xl p-2.5 text-center " + (needsAction > 0 ? "bg-amber-400/30" : "bg-white/15")}>
              <div className="text-xl font-bold">{needsAction}</div>
              <div className="text-[10px] text-white/70">待处理</div>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold">{stats?.models ?? 0}</div>
              <div className="text-[10px] text-white/70">认知模型</div>
            </div>
          </div>
        </div>

        {/* 5 core entrances */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/input">
            <button className="w-full rounded-2xl bg-blue-600 text-white p-4 flex items-center gap-3 hover:bg-blue-700 transition-all text-left active:scale-98 shadow-lg col-span-2">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center text-2xl flex-shrink-0">📥</div>
              <div className="flex-1">
                <div className="font-bold text-base">快速输入</div>
                <div className="text-white/70 text-xs">图片 · 文字 · 视频 · 4种处理方式</div>
              </div>
            </button>
          </Link>

          <Link href="/review/pending">
            <button className={"w-full rounded-2xl bg-white border p-4 flex items-center gap-3 hover:shadow-md transition-all text-left active:scale-98 " + (needsAction > 0 ? "border-amber-300" : "border-gray-200")}>
              <div className={"w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 " + (needsAction > 0 ? "bg-amber-50" : "bg-gray-50")}>⏳</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-800">等我确认</div>
                <div className="text-xs text-gray-500">{needsAction > 0 ? needsAction + " 条等待校正" : "暂无待处理"}</div>
              </div>
              {needsAction > 0 && (
                <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">{needsAction}</span>
              )}
            </button>
          </Link>

          <Link href="/library?status=needs_deepdive">
            <button className="w-full rounded-2xl bg-white border border-gray-200 p-4 flex items-center gap-3 hover:shadow-md hover:border-purple-200 transition-all text-left active:scale-98">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-xl flex-shrink-0">🔭</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-800">值得深挖</div>
                <div className="text-xs text-gray-500">
                  {(stats?.needs_deepdive || 0) > 0 ? (stats?.needs_deepdive) + " 条待深挖" : "暂无深挖条目"}
                </div>
              </div>
              {(stats?.needs_deepdive || 0) > 0 && (
                <span className="bg-purple-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">{stats?.needs_deepdive}</span>
              )}
            </button>
          </Link>

          <Link href="/clusters">
            <button className="w-full rounded-2xl bg-white border border-gray-200 p-4 flex items-center gap-3 hover:shadow-md hover:border-teal-200 transition-all text-left active:scale-98 col-span-2">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-xl flex-shrink-0">🧩</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-gray-800">我的模型</div>
                <div className="text-xs text-gray-500">
                  {(stats?.upgradeable || 0) > 0
                    ? (stats?.upgradeable) + " 个知识簇可升级为认知模型"
                    : (stats?.models || 0) + " 个认知模型已建立"}
                </div>
              </div>
              {(stats?.upgradeable || 0) > 0 && (
                <span className="bg-indigo-500 text-white text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0">{stats?.upgradeable} 可升级</span>
              )}
            </button>
          </Link>
        </div>

        {/* TODAY'S TOP 3 NEXT ACTIONS */}
        {topActions && topActions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                <span>⚡</span> 今天最值得推进
              </h2>
              <span className="text-xs text-gray-400">AI 按信息密度排序</span>
            </div>
            <div className="space-y-2">
              {topActions.map((action: any, idx: number) => {
                const cat = action.category as EntryCategory;
                const densityColor = action.densityLevel === "high" ? "border-red-200 bg-red-50" :
                                     action.densityLevel === "medium" ? "border-yellow-200 bg-yellow-50" :
                                     "border-gray-200 bg-gray-50";
                return (
                  <Link key={action.id} href={"/review/" + action.id}>
                    <div className={"rounded-xl border p-3.5 cursor-pointer hover:shadow-sm transition-all active:scale-99 " + densityColor}>
                      <div className="flex items-start gap-3">
                        <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center text-sm font-bold text-gray-500 flex-shrink-0 shadow-sm">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs">{CATEGORY_ICONS[cat]}</span>
                            <span className="text-xs text-gray-500">{CATEGORY_LABELS[cat]}</span>
                            {action.densityLevel === "high" && (
                              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">高密度</span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-gray-800 truncate">{action.title || "未命名"}</p>
                          {action.nextAction && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-xs">{NEXT_ACTION_ICONS[action.nextActionType] || "⚡"}</span>
                              <span className="text-xs text-gray-600 truncate">{action.nextAction}</span>
                            </div>
                          )}
                        </div>
                        <span className="text-gray-400 text-sm flex-shrink-0">→</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent entries */}
        {recentEntries && recentEntries.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800 text-sm">最近输入</h2>
              <Link href="/library?status=all">
                <span className="text-xs text-blue-500 cursor-pointer">全部 →</span>
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
                const densityLevel = (entry as any).densityLevel;
                return (
                  <Link key={entry.id} href={isActionable ? "/review/" + entry.id : "/entry/" + entry.id}>
                    <div className={"bg-white rounded-xl border p-3.5 hover:shadow-sm transition-all cursor-pointer active:scale-99 " + (isActionable ? "border-amber-200" : "border-gray-200 hover:border-blue-200")}>
                      <div className="flex items-start gap-3">
                        <span className="text-xl mt-0.5 flex-shrink-0">{CATEGORY_ICONS[cat]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-gray-500">{CATEGORY_LABELS[cat]}</span>
                            <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium " + STATUS_COLORS[status]}>{STATUS_LABELS[status]}</span>
                            {densityLevel === "high" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">高密度</span>
                            )}
                            <span className="text-xs text-gray-400 ml-auto">{formatRelativeTime(entry.createdAt)}</span>
                          </div>
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {entry.title || entry.rawText?.slice(0, 40) || "处理中..."}
                          </p>
                          {nextAction && status === "archived" && (
                            <div className="flex items-center gap-1 mt-1">
                              <span className="text-xs">{NEXT_ACTION_ICONS[nextActionType] || "⚡"}</span>
                              <span className="text-xs text-gray-500 truncate">{nextAction}</span>
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
            <h2 className="text-lg font-semibold text-gray-800 mb-2">随手丢进来</h2>
            <p className="text-gray-500 text-sm mb-6 max-w-xs mx-auto leading-relaxed">
              拍照、截图或输入文字，AI 自动识别分类，你只需一句话确认
            </p>
            <Link href="/input">
              <button className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-md">
                开始输入 →
              </button>
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
