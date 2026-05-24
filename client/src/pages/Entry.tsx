import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, STATUS_LABELS, STATUS_COLORS, NEXT_ACTION_ICONS, NEXT_ACTION_LABELS } from "@/lib/entryUtils";
import type { EntryCategory, EntryStatus } from "@/lib/entryUtils";
import { toast } from "sonner";
import { useState } from "react";

const DENSITY_CONFIG = {
  high:   { label: "高密度", color: "text-red-600 bg-red-50 border-red-200", bar: "bg-red-400", desc: "信息量大，值得深挖" },
  medium: { label: "中密度", color: "text-yellow-600 bg-yellow-50 border-yellow-200", bar: "bg-yellow-400", desc: "有一定价值，可整理" },
  low:    { label: "低密度", color: "text-gray-500 bg-gray-50 border-gray-200", bar: "bg-gray-300", desc: "信息量较少，快速处理" },
};

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
  const { data: relatedEntries } = trpc.entries.getRelated.useQuery(
    { id: entryId, limit: 5 },
    { enabled: isAuthenticated && entryId > 0 }
  );

  const deleteMutation = trpc.entries.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); navigate("/library"); },
    onError: (err) => toast.error("删除失败: " + err.message),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-4 p-4 animate-pulse">
          <div className="h-6 bg-gray-100 rounded w-1/3" />
          <div className="h-40 bg-gray-100 rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  const entry = data as any;
  const cluster = (data as any)?.cluster;
  if (!entry) return null;

  const cat = entry.category as EntryCategory;
  const status = entry.status as EntryStatus;
  const tags = (entry.tags as string[]) || [];
  const suggestions = (entry.researchSuggestions as string[]) || [];

  let noteItems: any[] = [];
  let coreTheme = "";
  let connectionInsight = "";
  let nextActionType = "";
  let nextAction = "";
  try {
    const unpacked = JSON.parse(entry.noteItemsJson || "{}");
    noteItems = unpacked.noteItems || [];
    coreTheme = unpacked.coreTheme || entry.coreTheme || "";
    connectionInsight = unpacked.connectionInsight || entry.connectionInsight || "";
    nextActionType = unpacked.nextActionType || entry.nextActionType || "";
    nextAction = unpacked.nextAction || entry.nextAction || "";
  } catch {}

  const densityLevel = entry.densityLevel || "medium";
  const densityScore = entry.densityScore ?? 5;
  const densityReason = entry.densityReason || "";
  const attentionPoint = entry.attentionPoint || "";
  const sourceType = entry.sourceType || "";
  const sourceName = entry.sourceName || "";
  const sourceUrl = entry.sourceUrl || "";
  const densityCfg = DENSITY_CONFIG[densityLevel as keyof typeof DENSITY_CONFIG] || DENSITY_CONFIG.medium;

  let displayAiAnswer = entry.aiAnswer;
  if (displayAiAnswer?.includes("__ITEMS__")) {
    displayAiAnswer = displayAiAnswer.split("__ITEMS__")[0].trim() || null;
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 p-4 pb-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/library">
            <button className="text-sm text-gray-500 hover:text-gray-800">← 返回</button>
          </Link>
          <div className="flex gap-2">
            {(status === "pending_review" || status === "needs_deepdive") && (
              <Link href={"/review/" + entry.id}>
                <button className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded-lg hover:bg-amber-600 transition-colors">去校正</button>
              </Link>
            )}
            <button onClick={() => setShowDelete(true)} className="text-xs text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors">删除</button>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{CATEGORY_ICONS[cat]}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={"text-xs px-2.5 py-1 rounded-full border font-medium " + CATEGORY_COLORS[cat]}>{CATEGORY_LABELS[cat]}</span>
                  <span className={"text-[10px] px-1.5 py-0.5 rounded-full font-medium " + STATUS_COLORS[status]}>{STATUS_LABELS[status]}</span>
                  {entry.githubSynced === 1 && <span className="text-[10px] text-green-600 font-medium">GitHub</span>}
                </div>
                <h1 className="text-base font-bold text-gray-900 leading-snug">{entry.title || "未命名"}</h1>
                {tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {tags.map((t: string) => <span key={t} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{"#" + t}</span>)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {entry.imageUrl && (
            <div className="border-b border-gray-100">
              <img src={entry.imageUrl} alt="原始输入" className="w-full max-h-56 object-contain bg-gray-50" />
            </div>
          )}

          {attentionPoint && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-semibold text-amber-600 mb-0.5">你为什么存它</p>
              <p className="text-sm text-amber-800">{attentionPoint}</p>
            </div>
          )}

          {entry.rawText && (
            <div className="p-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 mb-1.5">原始内容</p>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{entry.rawText}</p>
            </div>
          )}

          {entry.summary && (
            <div className="p-4 bg-blue-50/30">
              <p className="text-xs font-semibold text-blue-600 mb-1.5">AI 提炼</p>
              <p className="text-sm text-gray-800 leading-relaxed">{entry.summary}</p>
            </div>
          )}
        </div>

        {/* Information density card */}
        <div className={"rounded-2xl border p-4 " + densityCfg.color}>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold">信息密度</p>
              <p className="text-xs opacity-70 mt-0.5">{densityCfg.desc}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-bold">{densityScore}</span>
              <span className="text-sm opacity-60">/10</span>
            </div>
          </div>
          <div className="h-2 bg-white/60 rounded-full overflow-hidden">
            <div className={"h-full rounded-full transition-all " + densityCfg.bar}
              style={{ width: ((densityScore / 10) * 100) + "%" }} />
          </div>
          {densityReason && (
            <p className="text-xs opacity-70 mt-2 leading-relaxed">{densityReason}</p>
          )}
        </div>

        {/* Core theme + connection */}
        {(coreTheme || connectionInsight) && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-100 p-4 space-y-3">
            {coreTheme && (
              <div>
                <p className="text-xs font-semibold text-purple-600 mb-1">核心命题</p>
                <p className="text-sm font-medium text-gray-800">{coreTheme}</p>
              </div>
            )}
            {connectionInsight && (
              <div>
                <p className="text-xs font-semibold text-indigo-600 mb-1">认知联系</p>
                <p className="text-sm text-gray-700 leading-relaxed">{connectionInsight}</p>
              </div>
            )}
          </div>
        )}

        {/* Next action */}
        {nextAction && (
          <div className="bg-green-50 rounded-xl border border-green-100 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{NEXT_ACTION_ICONS[nextActionType] || "⚡"}</span>
              <p className="text-xs font-semibold text-green-700">下一步</p>
              {nextActionType && (
                <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">
                  {NEXT_ACTION_LABELS[nextActionType] || nextActionType}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-800 leading-relaxed">{nextAction}</p>
          </div>
        )}

        {/* Note items */}
        {noteItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-gray-700">逐条分析 ({noteItems.length})</p>
            {noteItems.map((item: any, i: number) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-3.5">
                <p className="text-xs text-gray-400 mb-1">{item.type}</p>
                <p className="text-sm font-semibold text-gray-800 mb-2">{item.keyword}</p>
                <p className="text-sm text-gray-700 leading-relaxed">{item.deepAnswer}</p>
                {item.actionable?.length > 0 && (
                  <div className="mt-2 bg-green-50 rounded-lg p-2">
                    <p className="text-xs font-semibold text-green-700 mb-1">行动</p>
                    {item.actionable.map((a: string, j: number) => <p key={j} className="text-xs text-green-800">{"→ " + a}</p>)}
                  </div>
                )}
                {item.furtherQuestions?.length > 0 && (
                  <div className="mt-2 bg-amber-50 rounded-lg p-2">
                    <p className="text-xs font-semibold text-amber-700 mb-1">延伸追问</p>
                    {item.furtherQuestions.map((q: string, j: number) => <p key={j} className="text-xs text-amber-800">{"? " + q}</p>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {displayAiAnswer && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <p className="text-xs font-semibold text-blue-600 mb-2">AI 回答</p>
            <p className="text-sm text-gray-800 leading-relaxed">{displayAiAnswer}</p>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">延伸研究方向</p>
            {suggestions.map((s: string, i: number) => (
              <p key={i} className="text-xs text-gray-500 py-1 border-b border-gray-100 last:border-0">{(i + 1) + ". " + s}</p>
            ))}
          </div>
        )}

        {/* Related nodes */}
        {relatedEntries && relatedEntries.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">相关节点</p>
            <div className="space-y-2">
              {relatedEntries.map((rel: any) => {
                const relCat = rel.category as EntryCategory;
                return (
                  <Link key={rel.id} href={"/entry/" + rel.id}>
                    <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 hover:shadow-sm transition-all cursor-pointer">
                      <span className="text-lg flex-shrink-0">{CATEGORY_ICONS[relCat]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-400">{CATEGORY_LABELS[relCat]}</p>
                        <p className="text-sm font-medium text-gray-800 truncate">{rel.title || "未命名"}</p>
                      </div>
                      {rel.densityLevel === "high" && (
                        <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full flex-shrink-0">高密度</span>
                      )}
                      <span className="text-gray-300 flex-shrink-0">›</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {cluster && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex items-center gap-2">
            <span className="text-indigo-500">🧩</span>
            <div>
              <p className="text-xs font-semibold text-indigo-700">{"知识簇：" + cluster.name}</p>
              <p className="text-xs text-indigo-600">{cluster.entryCount + " 条 · " + (cluster.status === "upgraded" ? "已建模" : cluster.status === "upgradeable" ? "可升级" : "积累中")}</p>
            </div>
          </div>
        )}

        {/* Source info */}
        {(sourceType || sourceName || sourceUrl) && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
            <p className="text-xs font-semibold text-gray-400 mb-2">来源信息</p>
            <div className="space-y-1 text-xs text-gray-600">
              {sourceType && <p>{"类型：" + sourceType}</p>}
              {sourceName && <p>{"来源：" + sourceName}</p>}
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline block truncate">
                  {sourceUrl}
                </a>
              )}
            </div>
          </div>
        )}

        {entry.githubPath && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex items-center gap-2">
            <span className="text-sm">📁</span>
            <span className="text-xs text-gray-500 font-mono truncate">{entry.githubPath}</span>
          </div>
        )}

        {entry.userCorrection && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-700 mb-1">用户校正</p>
            <p className="text-xs text-amber-800">{entry.userCorrection}</p>
          </div>
        )}

        {/* Delete confirm */}
        {showDelete && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setShowDelete(false)}>
            <div className="bg-white rounded-t-2xl w-full max-w-lg p-5" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px) + 4.5rem)" }} onClick={(e) => e.stopPropagation()}>
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
              <h3 className="font-semibold text-gray-800 mb-2">确认删除</h3>
              <p className="text-sm text-gray-500 mb-5">删除后无法恢复，确定要删除这条内容吗？</p>
              <div className="flex gap-3">
                <button onClick={() => setShowDelete(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-colors">取消</button>
                <button onClick={() => deleteMutation.mutate({ id: entry.id })} disabled={deleteMutation.isPending}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50">
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
