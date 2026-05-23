import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { getCategoryBadgeClass, getCategoryLabel, getCategoryIcon, formatDate } from "@/lib/noteUtils";
import { toast } from "sonner";
import { useState } from "react";

export default function NoteDetail() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-32 bg-muted rounded-2xl" />
          <div className="h-24 bg-muted rounded-2xl" />
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
              <img src={note.imageUrl} alt="原始笔记" className="w-full max-h-64 object-contain bg-gray-50" />
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
            <div className="p-5 border-b border-border bg-blue-50/30">
              <h3 className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">🤖 AI 摘要</h3>
              <p className="text-sm text-foreground leading-relaxed">{note.summary}</p>
            </div>
          )}
        </div>

        {/* AI Answer (for questions) */}
        {note.aiAnswer && (
          <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl border border-primary/20 p-5">
            <h3 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
              <span>🤖</span> AI 回答
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{note.aiAnswer}</p>
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
          <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
              <h3 className="font-semibold text-foreground mb-2">确认删除</h3>
              <p className="text-sm text-muted-foreground mb-4">删除后无法恢复，确定要删除这条记录吗？</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => deleteMutation.mutate({ id: note.id })}
                  disabled={deleteMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
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
