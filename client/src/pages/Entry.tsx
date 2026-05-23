import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, STATUS_LABELS, STATUS_COLORS } from "@/lib/entryUtils";
import type { EntryCategory, EntryStatus } from "@/lib/entryUtils";
import { toast } from "sonner";
import { useState } from "react";

export default function Entry() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const [showDelete, setShowDelete] = useState(false);
  const entryId = parseInt(id || "0");

  const { data, isLoading } = trpc.entries.getById.useQuery(
    { id: entryId },
    { enabled: isAuthenticated && entryId > 0 }
  );

  const deleteMutation = trpc.entries.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); navigate("/library"); },
    onError: (err) => toast.error(`删除失败: ${err.message}`),
  });

  if (isLoading) {
    return <AppLayout><div className="max-w-2xl mx-auto space-y-4 animate-pulse"><div className="h-6 bg-muted rounded w-1/3" /><div className="h-40 bg-muted rounded-2xl" /></div></AppLayout>;
  }

  const entry = data?.entry as any;
  const cluster = data?.cluster;
  if (!entry) return null;

  const cat = entry.category as EntryCategory;
  const status = entry.status as EntryStatus;
  const tags = (entry.tags as string[]) || [];
  const suggestions = (entry.researchSuggestions as string[]) || [];

  let noteItems: any[] = [];
  let coreTheme = "";
  let connectionInsight = "";
  try {
    const unpacked = JSON.parse(entry.noteItemsJson || "{}");
    noteItems = unpacked.noteItems || [];
    coreTheme = unpacked.coreTheme || entry.coreTheme || "";
    connectionInsight = unpacked.connectionInsight || entry.connectionInsight || "";
  } catch {}

  let displayAiAnswer = entry.aiAnswer;
  if (displayAiAnswer?.includes("__ITEMS__")) {
    displayAiAnswer = displayAiAnswer.split("__ITEMS__")[0].trim() || null;
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/library"><button className="text-sm text-muted-foreground hover:text-foreground">← 返回</button></Link>
          <div className="flex gap-2">
            {(status === "pending_review" || status === "needs_deepdive") && (
              <Link href={`/review/${entry.id}`}>
                <button className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors">去校正</button>
              </Link>
            )}
            <button onClick={() => setShowDelete(true)} className="text-xs text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-lg transition-colors">删除</button>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{CATEGORY_ICONS[cat]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${CATEGORY_COLORS[cat]}`}>{CATEGORY_LABELS[cat]}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                  {entry.githubSynced === 1 && <span className="text-[10px] text-green-600 font-medium">✓ GitHub</span>}
                </div>
                <h1 className="text-lg font-bold text-foreground leading-snug">{entry.title || "未命名"}</h1>
                {tags.length > 0 && <div className="flex gap-1 mt-2 flex-wrap">{tags.map((t: string) => <span key={t} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">#{t}</span>)}</div>}
              </div>
            </div>
          </div>

          {entry.imageUrl && <div className="border-b border-border"><img src={entry.imageUrl} alt="" className="w-full max-h-64 object-contain bg-gray-50" /></div>}

          {entry.rawText && (
            <div className="p-4 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">原始内容</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{entry.rawText}</p>
            </div>
          )}

          {entry.summary && (
            <div className="p-4 bg-blue-50/30">
              <p className="text-xs font-semibold text-blue-600 mb-1.5">🤖 AI 提炼</p>
              <p className="text-sm text-foreground leading-relaxed">{entry.summary}</p>
            </div>
          )}
        </div>

        {(coreTheme || connectionInsight) && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-100 p-4 space-y-2">
            {coreTheme && <div><p className="text-xs font-semibold text-purple-600 mb-1">🎯 核心命题</p><p className="text-sm font-medium text-foreground">{coreTheme}</p></div>}
            {connectionInsight && <div><p className="text-xs font-semibold text-indigo-600 mb-1">🔮 认知联系</p><p className="text-sm text-foreground leading-relaxed">{connectionInsight}</p></div>}
          </div>
        )}

        {noteItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">逐条分析 ({noteItems.length})</p>
            {noteItems.map((item: any, i: number) => (
              <div key={i} className="bg-white rounded-xl border border-border p-3.5">
                <p className="text-xs text-muted-foreground mb-1">{item.type}</p>
                <p className="text-sm font-semibold text-foreground mb-2">{item.keyword}</p>
                <p className="text-sm text-foreground leading-relaxed">{item.deepAnswer}</p>
                {item.actionable?.length > 0 && (
                  <div className="mt-2 bg-green-50 rounded-lg p-2">
                    <p className="text-xs font-semibold text-green-700 mb-1">⚡ 行动</p>
                    {item.actionable.map((a: string, j: number) => <p key={j} className="text-xs text-green-800">→ {a}</p>)}
                  </div>
                )}
                {item.furtherQuestions?.length > 0 && (
                  <div className="mt-2 bg-amber-50 rounded-lg p-2">
                    <p className="text-xs font-semibold text-amber-700 mb-1">🔍 延伸追问</p>
                    {item.furtherQuestions.map((q: string, j: number) => <p key={j} className="text-xs text-amber-800">? {q}</p>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {displayAiAnswer && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <p className="text-xs font-semibold text-primary mb-2">🤖 AI 回答</p>
            <p className="text-sm text-foreground leading-relaxed">{displayAiAnswer}</p>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <p className="text-sm font-semibold text-foreground mb-2">🔭 延伸研究</p>
            {suggestions.map((s: string, i: number) => <p key={i} className="text-xs text-muted-foreground py-1 border-b border-border/50 last:border-0">{i + 1}. {s}</p>)}
          </div>
        )}

        {cluster && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-center gap-2">
            <span className="text-indigo-500">🧩</span>
            <div>
              <p className="text-xs font-semibold text-indigo-700">知识簇：{cluster.name}</p>
              <p className="text-xs text-indigo-600">{cluster.entryCount} 条 · {cluster.status === "upgraded" ? "已建模" : cluster.status === "upgradeable" ? "可升级" : "积累中"}</p>
            </div>
          </div>
        )}

        {entry.githubPath && (
          <div className="bg-gray-50 rounded-xl border border-border p-3 flex items-center gap-2">
            <span className="text-sm">📁</span>
            <span className="text-xs text-muted-foreground font-mono truncate">{entry.githubPath}</span>
          </div>
        )}

        {entry.userCorrection && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">✏️ 用户校正</p>
            <p className="text-xs text-amber-800">{entry.userCorrection}</p>
          </div>
        )}

        {/* Delete confirm */}
        {showDelete && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setShowDelete(false)}>
            <div className="bg-white rounded-t-2xl w-full max-w-lg p-5" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px) + 4.5rem)" }} onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">确认删除</h3>
              <p className="text-sm text-muted-foreground mb-5">删除后无法恢复，确定要删除这条内容吗？</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDelete(false)} className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">取消</button>
                <button onClick={() => deleteMutation.mutate({ id: entry.id })} disabled={deleteMutation.isPending} className="flex-1 py-3 rounded-xl bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50">
                  {deleteMutation.isPending ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
