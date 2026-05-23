import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { AppLayout } from "@/components/AppLayout";
import { CATEGORY_LABELS, CATEGORY_ICONS, getCategoryBadgeClass, formatRelativeTime } from "@/lib/noteUtils";
import type { NoteCategory } from "@/lib/noteUtils";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const { data: stats } = trpc.notes.stats.useQuery(undefined, { enabled: isAuthenticated });
  const { data: recentNotes } = trpc.notes.list.useQuery({ limit: 6, offset: 0 }, { enabled: isAuthenticated });

  const categoryOrder: NoteCategory[] = ["idea", "question", "skill", "todo", "person", "experience", "quote", "other"];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">🧠</div>
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-background">
        <div className="text-center px-6 max-w-sm">
          <div className="text-7xl mb-6">🧠</div>
          <h1 className="text-2xl font-bold text-foreground mb-2">第二大脑</h1>
          <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
            随手记录灵感、问题、技能……<br />AI 帮你整理分析，同步到 GitHub
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

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
        {/* Welcome Banner */}
        <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-white shadow-lg shadow-primary/20">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-3xl">🧠</span>
            <div>
              <h1 className="text-lg font-bold">你好，{user?.name || "朋友"}</h1>
              <p className="text-white/75 text-xs">随手记录，AI 帮你整理成知识</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold">{stats?.total ?? 0}</div>
              <div className="text-[11px] text-white/75 mt-0.5">总卡片</div>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold">{Object.keys(stats?.byCategory ?? {}).length}</div>
              <div className="text-[11px] text-white/75 mt-0.5">分类数</div>
            </div>
            <div className="bg-white/15 rounded-xl p-2.5 text-center">
              <div className="text-xl font-bold">{stats?.syncedCount ?? 0}</div>
              <div className="text-[11px] text-white/75 mt-0.5">已同步</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/upload">
            <button className="w-full rounded-2xl bg-white border border-border p-4 flex items-center gap-3 hover:shadow-md hover:border-primary/30 transition-all text-left active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-xl flex-shrink-0">📷</div>
              <div>
                <div className="font-semibold text-sm text-foreground">拍照记录</div>
                <div className="text-xs text-muted-foreground">AI 识别分析</div>
              </div>
            </button>
          </Link>
          <Link href="/upload?mode=text">
            <button className="w-full rounded-2xl bg-white border border-border p-4 flex items-center gap-3 hover:shadow-md hover:border-primary/30 transition-all text-left active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl flex-shrink-0">✍️</div>
              <div>
                <div className="font-semibold text-sm text-foreground">文字记录</div>
                <div className="text-xs text-muted-foreground">直接输入内容</div>
              </div>
            </button>
          </Link>
        </div>

        {/* Category Overview */}
        {stats && stats.total > 0 && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <h2 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">分类概览</h2>
            <div className="grid grid-cols-4 gap-1">
              {categoryOrder.map((cat) => {
                const count = stats.byCategory[cat] || 0;
                if (count === 0) return null;
                return (
                  <Link key={cat} href={`/library?category=${cat}`}>
                    <div className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                      <span className="text-xl">{CATEGORY_ICONS[cat]}</span>
                      <span className="text-base font-bold text-foreground">{count}</span>
                      <span className="text-[10px] text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Notes */}
        {recentNotes && recentNotes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">最近记录</h2>
              <Link href="/library">
                <span className="text-sm text-primary hover:underline cursor-pointer">查看全部 →</span>
              </Link>
            </div>
            <div className="space-y-2">
              {recentNotes.map((note) => (
                <Link key={note.id} href={`/note/${note.id}`}>
                  <div className="bg-white rounded-xl border border-border p-3.5 hover:shadow-sm hover:border-primary/20 transition-all cursor-pointer active:scale-[0.99]">
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5 flex-shrink-0">{CATEGORY_ICONS[note.category as NoteCategory]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getCategoryBadgeClass(note.category)}`}>
                            {CATEGORY_LABELS[note.category as NoteCategory]}
                          </span>
                          {note.githubSynced === 1 && (
                            <span className="text-xs text-green-600 flex items-center gap-0.5">
                              <span>✓</span> GitHub
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                            {formatRelativeTime(note.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">
                          {note.title || note.rawText?.slice(0, 40) || "未命名"}
                        </p>
                        {note.summary && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{note.summary}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {(!recentNotes || recentNotes.length === 0) && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📝</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">开始你的第一条记录</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto leading-relaxed">
              拍一张纸质笔记的照片，或者直接输入文字，AI 会帮你整理分析
            </p>
            <Link href="/upload">
              <button className="bg-primary text-white px-6 py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">
                开始记录 →
              </button>
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
