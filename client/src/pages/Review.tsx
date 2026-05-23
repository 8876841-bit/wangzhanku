import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, STATUS_LABELS, STATUS_COLORS, NEXT_ACTION_ICONS, NEXT_ACTION_LABELS } from "@/lib/entryUtils";
import type { EntryCategory, EntryStatus } from "@/lib/entryUtils";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import { createAudioRecorder } from "@/lib/audioRecorder";

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const entryId = parseInt(id || "0");

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [textInstruction, setTextInstruction] = useState("");
  const [clusterName, setClusterName] = useState("");
  const [showQuickActions, setShowQuickActions] = useState(false);
  const recorderRef = useRef<ReturnType<typeof createAudioRecorder> | null>(null);

  const { data, isLoading, refetch } = trpc.entries.getById.useQuery(
    { id: entryId },
    { enabled: isAuthenticated && entryId > 0 }
  );

  const { data: clusters } = trpc.entries.listClusters.useQuery(undefined, { enabled: isAuthenticated });

  const transcribeMutation = trpc.entries.transcribeVoice.useMutation({
    onSuccess: async (result) => {
      if (result.text.trim()) {
        setIsApplying(true);
        correctionMutation.mutate({ entryId, instruction: result.text });
      }
      setIsProcessing(false);
    },
    onError: () => { toast.error("语音识别失败，请重试"); setIsProcessing(false); },
  });

  const correctionMutation = trpc.entries.applyCorrection.useMutation({
    onSuccess: () => { refetch(); setIsApplying(false); toast.success("已更新"); },
    onError: (err) => { toast.error(`更新失败: ${err.message}`); setIsApplying(false); },
  });

  const confirmMutation = trpc.entries.confirm.useMutation({
    onSuccess: (result) => {
      toast.success(result.githubSynced ? "✅ 已入库并同步 GitHub" : "✅ 已入库");
      navigate("/");
    },
    onError: (err) => toast.error(`入库失败: ${err.message}`),
  });

  const setStatusMutation = trpc.entries.setStatus.useMutation({
    onSuccess: (_, vars) => {
      const label = vars.status === "parked" ? "已暂存" : "已放弃";
      toast.success(label);
      navigate("/");
    },
    onError: (err) => toast.error(`操作失败: ${err.message}`),
  });

  // Pre-fill cluster name from AI suggestion
  useEffect(() => {
    if (data?.entry) {
      const entry = data.entry as any;
      try {
        const unpacked = JSON.parse(entry.noteItemsJson || "{}");
        if (unpacked.suggestedClusterName && !clusterName) {
          setClusterName(unpacked.suggestedClusterName);
        }
      } catch {}
    }
  }, [data]);

  const startRecording = async () => {
    const recorder = createAudioRecorder(
      (result) => {
        setIsProcessing(true);
        transcribeMutation.mutate({ audioBase64: result.base64, mimeType: result.mimeType });
      },
      (err) => { toast.error(err); setIsRecording(false); }
    );
    recorderRef.current = recorder;
    await recorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleTextSend = () => {
    if (!textInstruction.trim()) return;
    setIsApplying(true);
    correctionMutation.mutate({ entryId, instruction: textInstruction });
    setTextInstruction("");
  };

  const handleConfirm = () => {
    confirmMutation.mutate({
      entryId,
      clusterName: clusterName.trim() || undefined,
      syncToGithub: true,
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-40 bg-muted rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  const entry = data?.entry as any;
  if (!entry) return null;

  const cat = entry.category as EntryCategory;
  const status = entry.status as EntryStatus;
  const tags = (entry.tags as string[]) || [];
  const suggestions = (entry.researchSuggestions as string[]) || [];

  let noteItems: any[] = [];
  let coreTheme = "";
  let connectionInsight = "";
  let suggestedClusterName = "";
  let needsDeepDive = false;
  let deepDiveReason = "";
  let nextActionType = "";
  let nextAction = "";
  let aiInterpretation = "";

  try {
    const unpacked = JSON.parse(entry.noteItemsJson || "{}");
    noteItems = unpacked.noteItems || [];
    coreTheme = unpacked.coreTheme || entry.coreTheme || "";
    connectionInsight = unpacked.connectionInsight || entry.connectionInsight || "";
    suggestedClusterName = unpacked.suggestedClusterName || "";
    needsDeepDive = unpacked.needsDeepDive || false;
    deepDiveReason = unpacked.deepDiveReason || "";
    nextActionType = unpacked.nextActionType || entry.nextActionType || "";
    nextAction = unpacked.nextAction || entry.nextAction || "";
    aiInterpretation = unpacked.aiInterpretation || entry.aiInterpretation || "";
  } catch {}

  const isWorking = isRecording || isProcessing || isApplying;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">校正</h1>
            <p className="text-xs text-muted-foreground">一句话告诉 AI 哪里不对，满意后确认入库</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[status]}`}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        {/* Deep dive alert */}
        {needsDeepDive && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-start gap-2">
            <span className="text-purple-500 text-lg flex-shrink-0">🔭</span>
            <div>
              <p className="text-xs font-semibold text-purple-700">AI 标记：值得深挖</p>
              <p className="text-xs text-purple-600 mt-0.5">{deepDiveReason}</p>
            </div>
          </div>
        )}

        {/* Entry card */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{CATEGORY_ICONS[cat]}</span>
              <div className="flex-1 min-w-0">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[cat]}`}>
                  {CATEGORY_LABELS[cat]}
                </span>
                <h2 className="text-base font-bold text-foreground mt-1.5 leading-snug">{entry.title || "未命名"}</h2>
                {tags.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {tags.map((t: string) => <span key={t} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">#{t}</span>)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {entry.imageUrl && (
            <div className="border-b border-border">
              <img src={entry.imageUrl} alt="原始输入" className="w-full max-h-56 object-contain bg-gray-50" />
            </div>
          )}

          {entry.rawText && (
            <div className="p-4 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">原始内容</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{entry.rawText}</p>
            </div>
          )}

          {/* AI interpretation (first pass) */}
          {aiInterpretation && (
            <div className="p-4 border-t border-border bg-amber-50/30">
              <p className="text-xs font-semibold text-amber-600 mb-1.5">🤖 AI 初次理解</p>
              <p className="text-sm text-foreground leading-relaxed">{aiInterpretation}</p>
              <p className="text-xs text-amber-600 mt-1.5">如果理解有偏差，在底部输入框说出来</p>
            </div>
          )}

          {entry.summary && (
            <div className="p-4 bg-blue-50/30">
              <p className="text-xs font-semibold text-blue-600 mb-1.5">🤖 AI 提炼</p>
              <p className="text-sm text-foreground leading-relaxed">{entry.summary}</p>
            </div>
          )}
        </div>

        {/* Core theme + connection */}
        {(coreTheme || connectionInsight) && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-100 p-4 space-y-2">
            {coreTheme && <div><p className="text-xs font-semibold text-purple-600 mb-1">🎯 核心命题</p><p className="text-sm font-medium text-foreground">{coreTheme}</p></div>}
            {connectionInsight && <div><p className="text-xs font-semibold text-indigo-600 mb-1">🔮 认知联系</p><p className="text-sm text-foreground leading-relaxed">{connectionInsight}</p></div>}
          </div>
        )}

        {/* Note items */}
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
              </div>
            ))}
          </div>
        )}

        {/* AI answer */}
        {entry.aiAnswer && !entry.aiAnswer.includes("__ITEMS__") && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <p className="text-xs font-semibold text-primary mb-2">🤖 AI 回答</p>
            <p className="text-sm text-foreground leading-relaxed">{entry.aiAnswer}</p>
          </div>
        )}

        {/* Research suggestions */}
        {suggestions.length > 0 && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <p className="text-sm font-semibold text-foreground mb-2">🔭 延伸研究</p>
            {suggestions.map((s: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground py-1 border-b border-border/50 last:border-0">{i + 1}. {s}</p>
            ))}
          </div>
        )}

        {/* Cluster assignment */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">🧩 归入知识簇</p>
            {suggestedClusterName && <span className="text-xs text-muted-foreground">AI 建议：{suggestedClusterName}</span>}
          </div>
          <input
            type="text"
            value={clusterName}
            onChange={(e) => setClusterName(e.target.value)}
            placeholder="输入知识簇名称（积累 3 条可升级为认知模型），留空则不归类"
            className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-all"
          />
          {clusters && clusters.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {clusters.slice(0, 5).map((c) => (
                <button key={c.id} onClick={() => setClusterName(c.name)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${clusterName === c.name ? "bg-primary text-white border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/40"}`}>
                  {c.name} ({c.entryCount})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Next action */}
        {nextAction && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{NEXT_ACTION_ICONS[nextActionType] || "⚡"}</span>
              <p className="text-sm font-semibold text-foreground">下一步动作</p>
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{NEXT_ACTION_LABELS[nextActionType] || nextActionType}</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed">{nextAction}</p>
          </div>
        )}

        {/* Bottom padding so content isn't hidden behind fixed bar */}
        <div className="h-36" />
      </div>

      {/* ── Fixed bottom bar: correction input + confirm ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-border shadow-lg"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4rem)" }}
      >
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-2 space-y-2">
          {/* Status indicator */}
          {isWorking && (
            <div className="flex items-center gap-2 px-1">
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-primary font-medium">
                {isRecording ? "🔴 录音中，松开停止..." : isProcessing ? "语音识别中..." : "AI 更新中，请稍候..."}
              </p>
            </div>
          )}

          {/* Correction row */}
          <div className="flex items-center gap-2">
            {/* Mic button */}
            <button
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              disabled={isProcessing || isApplying}
              className={`w-11 h-11 rounded-full flex flex-col items-center justify-center gap-0.5 transition-all select-none flex-shrink-0 ${
                isRecording ? "bg-red-500 text-white scale-110 shadow-md" :
                isProcessing || isApplying ? "bg-muted text-muted-foreground cursor-not-allowed" :
                "bg-primary/10 text-primary hover:bg-primary/20 active:scale-95"
              }`}
            >
              {isRecording ? <span className="text-base">⏹</span> :
               isProcessing || isApplying ? <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" /> :
               <span className="text-base">🎤</span>}
            </button>

            {/* Text input */}
            <input
              type="text"
              value={textInstruction}
              onChange={(e) => setTextInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
              placeholder="说出或打字修改意见..."
              disabled={isWorking}
              className="flex-1 px-3 py-2.5 bg-muted/60 border border-border rounded-xl text-sm outline-none focus:border-primary/50 focus:bg-white transition-all disabled:opacity-50"
            />

            {/* Send button */}
            <button
              onClick={handleTextSend}
              disabled={!textInstruction.trim() || isWorking}
              className="px-3 py-2.5 bg-muted text-foreground rounded-xl text-xs font-medium disabled:opacity-40 hover:bg-muted/70 transition-colors flex-shrink-0"
            >
              发送
            </button>
          </div>

          {/* Action row: confirm + park + discard */}
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={confirmMutation.isPending || isWorking}
              className="flex-1 py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
            >
              {confirmMutation.isPending ? "入库中..." : `✅ 入库${clusterName ? ` · ${clusterName}` : ""}`}
            </button>
            <button
              onClick={() => setStatusMutation.mutate({ entryId, status: "parked" })}
              disabled={setStatusMutation.isPending || isWorking}
              className="px-3 py-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex-shrink-0"
              title="暂存，以后再看"
            >
              ⏸️暂存
            </button>
            <button
              onClick={() => setStatusMutation.mutate({ entryId, status: "discarded" })}
              disabled={setStatusMutation.isPending || isWorking}
              className="px-3 py-3 rounded-xl bg-red-50 text-red-400 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50 flex-shrink-0"
              title="放弃，不入库"
            >
              🗑️放弃
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
