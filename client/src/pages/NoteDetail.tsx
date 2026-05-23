import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { getCategoryBadgeClass, getCategoryLabel, getCategoryIcon, formatDate } from "@/lib/noteUtils";
import { toast } from "sonner";
import { useState } from "react";

interface NoteItem {
  keyword: string;
  type: "question" | "concept" | "person" | "todo" | "insight" | "data";
  deepAnswer: string;
  actionable: string[];
  furtherQuestions: string[];
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  question: "❓ 问题",
  concept: "💡 概念",
  person: "👤 人物",
  todo: "✅ 待办",
  insight: "✨ 洞察",
  data: "📊 数据",
};

const ITEM_TYPE_COLORS: Record<string, string> = {
  question: "bg-blue-50 border-blue-100 text-blue-700",
  concept: "bg-amber-50 border-amber-100 text-amber-700",
  person: "bg-green-50 border-green-100 text-green-700",
  todo: "bg-orange-50 border-orange-100 text-orange-700",
  insight: "bg-purple-50 border-purple-100 text-purple-700",
  data: "bg-gray-50 border-gray-200 text-gray-700",
};

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set([0]));

  const noteId = parseInt(id || "0");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.notes.getById.useQuery(
    { id: noteId },
    { enabled: isAuthenticated && noteId > 0 }
  );

  const syncMutation = trpc.notes.syncToGithub.useMutation({
    onSuccess: (result) => {
      if (result.success) {
        toast.success("已同步到 GitHub！");
        utils.notes.getById.invalidate({ id: noteId });
      } else {
        toast.error(`同步失败: ${result.error}`);
      }
    },
    onError: (err) => toast.error(`同步失败: ${err.message}`),
  });

  const deleteMutation = trpc.notes.delete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      navigate("/library");
    },
    onError: (err) => toast.error(`删除失败: ${err.message}`),
  });

  const toggleItem = (index: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded-2xl" />
          <div className="h-24 bg-muted rounded-2xl" />
          <div className="h-48 bg-muted rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="text-center py-16">
          <p className="text-muted-foreground">笔记不存在或已被删除</p>
          <Link href="/library">
            <button className="mt-4 text-primary text-sm hover:underline">返回知识库</button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  const { note, relatedNotes } = data;
  const tags = (note.tags as string[]) || [];
  const suggestions = (note.researchSuggestions as string[]) || [];
  // Try to parse noteItems from the note (stored as part of aiAnswer or a separate field)
  let noteItems: NoteItem[] = [];
  let coreTheme = "";
  let connectionInsight = "";
  let displayAiAnswer: string | null = null;
  try {
    const rawAiAnswer = note.aiAnswer || "";
    const itemsMarker = "__ITEMS__";
    const markerIdx = rawAiAnswer.indexOf(itemsMarker);
    if (markerIdx !== -1) {
      // Has structured data
      const textPart = rawAiAnswer.slice(0, markerIdx).trim();
      const jsonPart = rawAiAnswer.slice(markerIdx + itemsMarker.length);
      displayAiAnswer = textPart || null;
      const parsed = JSON.parse(jsonPart);
      noteItems = parsed.noteItems || [];
      coreTheme = parsed.coreTheme || "";
      connectionInsight = parsed.connectionInsight || "";
    } else {
      displayAiAnswer = rawAiAnswer || null;
    }
  } catch {
    displayAiAnswer = note.aiAnswer;
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in pb-4">
        {/* Back + Actions */}
        <div className="flex items-center justify-between">
          <Link href="/library">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              ← 返回
            </button>
          </Link>
          <div className="flex items-center gap-2">
            {note.githubSynced === 0 && note.status === "done" && (
              <button
                onClick={() => syncMutation.mutate({ noteId: note.id })}
                disabled={syncMutation.isPending}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {syncMutation.isPending ? "同步中..." : "⬆ 同步 GitHub"}
              </button>
            )}
            {note.githubSynced === 1 && (
              <span className="text-xs text-green-600 font-medium bg-green-50 px-2.5 py-1.5 rounded-lg border border-green-100">
                ✓ 已同步 GitHub
              </span>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="text-xs text-destructive hover:bg-destructive/10 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              删除
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-border">
            <div className="flex items-start gap-3">
              <span className="text-3xl">{getCategoryIcon(note.category)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${getCategoryBadgeClass(note.category)}`}>
                    {getCategoryLabel(note.category)}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(note.createdAt)}</span>
                </div>
                <h1 className="text-lg font-bold text-foreground leading-snug">
                  {note.title || "未命名"}
                </h1>
              </div>
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {tags.map((tag) => (
                  <span key={tag} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Original Image */}
          {note.imageUrl && (
            <div className="border-b border-border">
              <img src={note.imageUrl} alt="原始笔记" className="w-full max-h-72 object-contain bg-gray-50" />
            </div>
          )}

          {/* Raw Text */}
          {note.rawText && (
            <div className="p-5 border-b border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">原始记录</h3>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{note.rawText}</p>
            </div>
          )}

          {/* AI Summary */}
          {note.summary && (
            <div className="p-5 bg-blue-50/30">
              <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">🤖 AI 摘要</h3>
              <p className="text-sm text-foreground leading-relaxed">{note.summary}</p>
            </div>
          )}
        </div>

        {/* Core Theme + Connection Insight */}
        {(coreTheme || connectionInsight) && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-100 p-5 space-y-3">
            {coreTheme && (
              <div>
                <h3 className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1.5">🎯 核心命题</h3>
                <p className="text-sm font-medium text-foreground leading-relaxed">{coreTheme}</p>
              </div>
            )}
            {connectionInsight && (
              <div>
                <h3 className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">🔮 内在联系</h3>
                <p className="text-sm text-foreground leading-relaxed">{connectionInsight}</p>
              </div>
            )}
          </div>
        )}

        {/* Deep Analysis: Note Items */}
        {noteItems.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <span>🧠</span> 逐条深度分析
              <span className="text-xs text-muted-foreground font-normal">({noteItems.length} 条)</span>
            </h3>
            {noteItems.map((item, i) => {
              const isExpanded = expandedItems.has(i);
              const typeColor = ITEM_TYPE_COLORS[item.type] || ITEM_TYPE_COLORS.concept;
              const typeLabel = ITEM_TYPE_LABELS[item.type] || item.type;
              return (
                <div key={i} className="bg-white rounded-xl border border-border overflow-hidden">
                  {/* Item Header - always visible */}
                  <button
                    onClick={() => toggleItem(i)}
                    className="w-full p-4 flex items-start gap-3 text-left hover:bg-muted/30 transition-colors"
                  >
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 mt-0.5 ${typeColor}`}>
                      {typeLabel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-snug">{item.keyword}</p>
                      {!isExpanded && item.deepAnswer && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.deepAnswer}</p>
                      )}
                    </div>
                    <span className="text-muted-foreground text-xs flex-shrink-0 mt-0.5">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/50">
                      {/* Deep Answer */}
                      <div className="pt-3">
                        <p className="text-sm text-foreground leading-relaxed">{item.deepAnswer}</p>
                      </div>

                      {/* Actionable */}
                      {item.actionable && item.actionable.length > 0 && (
                        <div className="bg-green-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-green-700 mb-2">⚡ 可落地行动</p>
                          <ul className="space-y-1.5">
                            {item.actionable.map((a, j) => (
                              <li key={j} className="flex items-start gap-2 text-xs text-green-800">
                                <span className="flex-shrink-0 mt-0.5">→</span>
                                <span>{a}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Further Questions */}
                      {item.furtherQuestions && item.furtherQuestions.length > 0 && (
                        <div className="bg-amber-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-amber-700 mb-2">🔍 延伸追问</p>
                          <ul className="space-y-1.5">
                            {item.furtherQuestions.map((q, j) => (
                              <li key={j} className="flex items-start gap-2 text-xs text-amber-800">
                                <span className="flex-shrink-0 mt-0.5">?</span>
                                <span>{q}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* AI Answer (综合回答) */}
        {displayAiAnswer && (
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl border border-primary/20 p-5">
            <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
              <span>🤖</span> AI 综合回答
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{displayAiAnswer}</p>
          </div>
        )}

        {/* Research Suggestions */}
        {suggestions.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span>🔭</span> 延伸研究方向
            </h3>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2.5 p-3 bg-muted/50 rounded-xl">
                  <span className="text-xs font-bold text-primary mt-0.5 flex-shrink-0">{i + 1}</span>
                  <p className="text-sm text-foreground leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Related Notes */}
        {relatedNotes && relatedNotes.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <span>🔗</span> 关联卡片
              <span className="text-xs text-muted-foreground font-normal">({relatedNotes.length})</span>
            </h3>
            <div className="space-y-2">
              {relatedNotes.map((rn) => (
                <Link key={rn.id} href={`/note/${rn.id}`}>
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl hover:bg-muted transition-colors cursor-pointer">
                    <span className="text-lg flex-shrink-0">{getCategoryIcon(rn.category)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{rn.title || "未命名"}</p>
                      <p className="text-xs text-muted-foreground">{getCategoryLabel(rn.category)}</p>
                    </div>
                    <span className="text-muted-foreground text-sm flex-shrink-0">→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* GitHub Path */}
        {note.githubPath && (
          <div className="bg-gray-50 rounded-xl border border-border p-3 flex items-center gap-2">
            <span className="text-sm">📁</span>
            <span className="text-xs text-muted-foreground font-mono truncate">{note.githubPath}</span>
          </div>
        )}

        {/* Delete Confirm */}
        {showDeleteConfirm && (
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <div
              className="bg-white rounded-t-2xl w-full max-w-lg p-5 pb-safe"
              style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px) + 4.5rem)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
              <h3 className="font-semibold text-foreground mb-2">确认删除</h3>
              <p className="text-sm text-muted-foreground mb-5">删除后无法恢复，确定要删除这条记录吗？</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => deleteMutation.mutate({ id: note.id })}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-3 rounded-xl bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
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
