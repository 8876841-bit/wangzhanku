import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, STATUS_LABELS, STATUS_COLORS, NEXT_ACTION_ICONS, NEXT_ACTION_LABELS } from "@/lib/entryUtils";
import type { EntryCategory, EntryStatus } from "@/lib/entryUtils";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";
import { createAudioRecorder } from "@/lib/audioRecorder";

const DENSITY_CONFIG = {
  high:   { label: "高密度", color: "text-red-600 bg-red-50 border-red-200", bar: "bg-red-400", desc: "信息量大，值得深挖" },
  medium: { label: "中密度", color: "text-yellow-600 bg-yellow-50 border-yellow-200", bar: "bg-yellow-400", desc: "有一定价值，可整理" },
  low:    { label: "低密度", color: "text-gray-500 bg-gray-50 border-gray-200", bar: "bg-gray-300", desc: "信息量较少，快速处理" },
};

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
  const [showDetails, setShowDetails] = useState(false);
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

  const correctionMutation = trpc.entries.correct.useMutation({
    onSuccess: () => { refetch(); setIsApplying(false); setTextInstruction(""); toast.success("已更新"); },
    onError: (err) => { toast.error("更新失败: " + err.message); setIsApplying(false); },
  });

  const confirmMutation = trpc.entries.confirm.useMutation({
    onSuccess: (result) => {
      toast.success(result.githubSynced ? "已入库并同步 GitHub" : "已入库");
      navigate("/");
    },
    onError: (err) => toast.error("入库失败: " + err.message),
  });

  const updateStatusMutation = trpc.entries.updateStatus.useMutation({
    onSuccess: (_, vars) => {
      const labels: Record<string, string> = { parked: "已暂存", discarded: "已放弃", needs_deepdive: "已标记深挖" };
      toast.success(labels[vars.status] || "已更新");
      navigate("/");
    },
    onError: (err) => toast.error("操作失败: " + err.message),
  });

  useEffect(() => {
    if (data) {
      const entry = data as any;
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
        setIsRecording(false);
        setIsProcessing(true);
        transcribeMutation.mutate({ audioBase64: result.base64, mimeType: result.mimeType });
      },
      () => { setIsRecording(false); setIsProcessing(false); toast.error("录音失败"); }
    );
    recorderRef.current = recorder;
    await recorder.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (recorderRef.current && isRecording) recorderRef.current.stop();
  };

  const handleTextSend = () => {
    if (!textInstruction.trim() || isApplying) return;
    setIsApplying(true);
    correctionMutation.mutate({ entryId, instruction: textInstruction });
  };

  const handleConfirm = () => {
    confirmMutation.mutate({ entryId, clusterName: clusterName || undefined });
  };

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-48">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">AI 分析中...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="p-4 text-center text-gray-500">
          <p>条目不存在</p>
          <button onClick={() => navigate("/")} className="mt-3 text-blue-500 text-sm">返回首页</button>
        </div>
      </AppLayout>
    );
  }

  const entry = data as any;
  let unpacked: any = {};
  try { unpacked = JSON.parse(entry.noteItemsJson || "{}"); } catch {}

  const cat = (entry.category || "Idea") as EntryCategory;
  const status = (entry.status || "pending_review") as EntryStatus;
  const tags = (entry.tags as string[]) || [];
  const noteItems = unpacked.noteItems || [];
  const coreTheme = entry.coreTheme || unpacked.coreTheme || "";
  const connectionInsight = entry.connectionInsight || unpacked.connectionInsight || "";
  const needsDeepDive = unpacked.needsDeepDive || entry.needsDeepDive;
  const deepDiveReason = unpacked.deepDiveReason || "";
  const nextActionType = unpacked.nextActionType || entry.nextActionType || "parked";
  const nextAction = unpacked.nextAction || entry.nextAction || "";
  const aiInterpretation = unpacked.aiInterpretation || entry.aiInterpretation || "";
  const densityLevel = entry.densityLevel || unpacked.densityLevel || "medium";
  const densityScore = entry.densityScore ?? unpacked.densityScore ?? 5;
  const densityReason = entry.densityReason || unpacked.densityReason || "";
  const researchSuggestions = (entry.researchSuggestions as string[]) || [];
  const attentionPoint = entry.attentionPoint || "";
  const sourceType = entry.sourceType || "";
  const sourceName = entry.sourceName || "";
  const processingMode = entry.processingMode || "organize";

  const densityCfg = DENSITY_CONFIG[densityLevel as keyof typeof DENSITY_CONFIG] || DENSITY_CONFIG.medium;
  const isWorking = isRecording || isProcessing || isApplying;
  const modeLabels: Record<string, string> = {
    recognize_only: "只识别", organize: "识别整理", archive: "分类入库", deepdive: "深挖",
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-3 p-4 pb-40">

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{CATEGORY_ICONS[cat]}</span>
            <div>
              <span className={"text-xs px-2 py-0.5 rounded-full border font-medium " + CATEGORY_COLORS[cat]}>
                {CATEGORY_LABELS[cat]}
              </span>
              {processingMode && processingMode !== "organize" && (
                <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  {modeLabels[processingMode] || processingMode}
                </span>
              )}
            </div>
          </div>
          <span className={"text-xs px-2.5 py-1 rounded-full font-medium " + STATUS_COLORS[status]}>
            {STATUS_LABELS[status]}
          </span>
        </div>

        <h1 className="text-lg font-bold text-gray-900 leading-snug">{entry.title || "未命名"}</h1>

        {tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {tags.map((t: string) => (
              <span key={t} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{"#" + t}</span>
            ))}
          </div>
        )}

        <div className={"flex items-center gap-3 px-3 py-2.5 rounded-xl border " + densityCfg.color}>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold">{densityCfg.label}</span>
              <span className="text-xs opacity-70">{densityCfg.desc}</span>
            </div>
            <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
              <div className={"h-full rounded-full transition-all " + densityCfg.bar}
                style={{ width: ((densityScore / 10) * 100) + "%" }} />
            </div>
          </div>
          <span className="text-sm font-bold opacity-80">{densityScore}/10</span>
        </div>

        {needsDeepDive && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 flex items-start gap-2">
            <span className="text-purple-500 text-lg flex-shrink-0">🔭</span>
            <div>
              <p className="text-xs font-semibold text-purple-700">AI 标记：值得深挖</p>
              {deepDiveReason && <p className="text-xs text-purple-600 mt-0.5">{deepDiveReason}</p>}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {attentionPoint && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-semibold text-amber-600 mb-0.5">你为什么存它</p>
              <p className="text-sm text-amber-800">{attentionPoint}</p>
            </div>
          )}
          {entry.imageUrl && (
            <div className="border-b border-gray-100">
              <img src={entry.imageUrl} alt="原始输入" className="w-full max-h-48 object-contain bg-gray-50" />
            </div>
          )}
          {aiInterpretation && (
            <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100">
              <p className="text-xs font-semibold text-blue-600 mb-1">AI 理解</p>
              <p className="text-sm text-gray-800 leading-relaxed">{aiInterpretation}</p>
              <p className="text-xs text-blue-500 mt-1.5">如果理解有偏差，在底部输入框说出来</p>
            </div>
          )}
          {entry.summary && (
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">提炼</p>
              <p className="text-sm text-gray-800 leading-relaxed">{entry.summary}</p>
            </div>
          )}
          {coreTheme && (
            <div className="px-4 py-3 bg-purple-50/40 border-t border-purple-100">
              <p className="text-xs font-semibold text-purple-600 mb-1">核心命题</p>
              <p className="text-sm font-medium text-gray-800">{coreTheme}</p>
            </div>
          )}
          {nextAction && (
            <div className="px-4 py-3 bg-green-50/40 border-t border-green-100">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{NEXT_ACTION_ICONS[nextActionType] || "⚡"}</span>
                <p className="text-xs font-semibold text-green-700">下一步</p>
                <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full">
                  {NEXT_ACTION_LABELS[nextActionType] || nextActionType}
                </span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{nextAction}</p>
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1.5">归入知识簇（可选）</label>
          <input value={clusterName} onChange={e => setClusterName(e.target.value)}
            placeholder="例：产品思维、表达技巧..." list="cluster-suggestions"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <datalist id="cluster-suggestions">
            {clusters?.map((c: any) => <option key={c.id} value={c.name} />)}
          </datalist>
        </div>

        <button onClick={() => setShowDetails(!showDetails)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-100 transition-all">
          <span className="font-medium">{showDetails ? "收起详情" : "展开详情"}</span>
          <span className="text-gray-400">{showDetails ? "▲" : "▼"}</span>
        </button>

        {showDetails && (
          <div className="space-y-3">
            {entry.rawText && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-400 mb-2">原始内容</p>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{entry.rawText}</p>
              </div>
            )}
            {connectionInsight && (
              <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-4">
                <p className="text-xs font-semibold text-indigo-600 mb-1">认知联系</p>
                <p className="text-sm text-gray-800 leading-relaxed">{connectionInsight}</p>
              </div>
            )}
            {densityReason && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 mb-1">信息密度说明</p>
                <p className="text-sm text-gray-700">{densityReason}</p>
              </div>
            )}
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
                        {item.actionable.map((a: string, j: number) => (
                          <p key={j} className="text-xs text-green-800">{"→ " + a}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {researchSuggestions.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs font-semibold text-gray-500 mb-2">延伸研究方向</p>
                <div className="space-y-1">
                  {researchSuggestions.map((s: string, i: number) => (
                    <p key={i} className="text-sm text-gray-700">{(i + 1) + ". " + s}</p>
                  ))}
                </div>
              </div>
            )}
            {(sourceType || sourceName) && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-400 mb-1">来源信息</p>
                <div className="flex gap-3 text-xs text-gray-600">
                  {sourceType && <span>{"类型：" + sourceType}</span>}
                  {sourceName && <span>{"来源：" + sourceName}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="h-36" />
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-lg"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4rem)" }}>
        <div className="max-w-2xl mx-auto px-4 pt-3 pb-2 space-y-2">
          {isWorking && (
            <div className="flex items-center gap-2 px-1">
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-blue-600 font-medium">
                {isRecording ? "录音中，松开停止..." : isProcessing ? "语音识别中..." : "AI 更新中..."}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onPointerDown={startRecording} onPointerUp={stopRecording} onPointerLeave={stopRecording}
              disabled={isProcessing || isApplying}
              className={"w-11 h-11 rounded-full flex items-center justify-center transition-all select-none flex-shrink-0 " + (isRecording ? "bg-red-500 text-white scale-110 shadow-md" : isProcessing || isApplying ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95")}>
              {isRecording ? <span className="text-base">⏹</span> :
               isProcessing || isApplying ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> :
               <span className="text-base">🎤</span>}
            </button>
            <input type="text" value={textInstruction} onChange={e => setTextInstruction(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleTextSend()}
              placeholder="一句话告诉 AI 哪里不对..." disabled={isWorking}
              className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-blue-400 focus:bg-white transition-all disabled:opacity-50" />
            <button onClick={handleTextSend} disabled={!textInstruction.trim() || isWorking}
              className="px-3 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-medium disabled:opacity-40 hover:bg-gray-200 transition-colors flex-shrink-0">
              发送
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={handleConfirm} disabled={confirmMutation.isPending || isWorking}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-all shadow-md active:scale-98 disabled:opacity-50">
              {confirmMutation.isPending ? "入库中..." : "确认入库" + (clusterName ? " · " + clusterName : "")}
            </button>
            <button onClick={() => updateStatusMutation.mutate({ entryId, status: "parked" })}
              disabled={updateStatusMutation.isPending || isWorking}
              className="px-3 py-3 rounded-xl bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex-shrink-0">
              暂存
            </button>
            <button onClick={() => updateStatusMutation.mutate({ entryId, status: "discarded" })}
              disabled={updateStatusMutation.isPending || isWorking}
              className="px-3 py-3 rounded-xl bg-red-50 text-red-400 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50 flex-shrink-0">
              放弃
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
