import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { getCategoryBadgeClass, getCategoryLabel, getCategoryIcon } from "@/lib/noteUtils";
import { toast } from "sonner";
import { useState, useRef, useEffect } from "react";

interface NoteItem {
  keyword: string;
  type: string;
  deepAnswer: string;
  actionable: string[];
  furtherQuestions: string[];
}

const ITEM_TYPE_COLORS: Record<string, string> = {
  question: "bg-blue-50 border-blue-100 text-blue-700",
  concept: "bg-amber-50 border-amber-100 text-amber-700",
  person: "bg-green-50 border-green-100 text-green-700",
  todo: "bg-orange-50 border-orange-100 text-orange-700",
  insight: "bg-purple-50 border-purple-100 text-purple-700",
  data: "bg-gray-50 border-gray-200 text-gray-700",
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  question: "❓ 问题", concept: "💡 概念", person: "👤 人物",
  todo: "✅ 待办", insight: "✨ 洞察", data: "📊 数据",
};

type RecordingState = "idle" | "recording" | "processing";

// ── Inline voice input component for each card ──
function InlineVoiceInput({
  context,
  onInstruction,
  isApplying,
}: {
  context: string;       // the keyword/title of the card for context
  onInstruction: (text: string) => void;
  isApplying: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [textInput, setTextInput] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const transcribeMutation = trpc.notes.transcribeVoice.useMutation({
    onSuccess: (result) => {
      if (result.text.trim()) {
        // Prepend context so AI knows which item to modify
        onInstruction(`关于「${context}」这条：${result.text}`);
        setOpen(false);
      }
      setRecordingState("idle");
    },
    onError: () => {
      toast.error("语音识别失败，请重试");
      setRecordingState("idle");
    },
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          setRecordingState("processing");
          transcribeMutation.mutate({ audioBase64: base64, mimeType: "audio/webm" });
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      setRecordingState("recording");
    } catch {
      toast.error("无法访问麦克风，请检查权限设置");
    }
  };

  const stopRecording = () => mediaRecorderRef.current?.stop();

  const handleTextSend = () => {
    if (!textInput.trim()) return;
    onInstruction(`关于「${context}」这条：${textInput}`);
    setTextInput("");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full py-1.5 rounded-lg border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-1.5"
      >
        <span>🎙️</span> 需要调整这条？点此语音说明
      </button>
    );
  }

  return (
    <div className="mt-2 bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary">调整「{context}」</p>
        <button onClick={() => setOpen(false)} className="text-muted-foreground text-xs hover:text-foreground">✕ 关闭</button>
      </div>

      {/* Voice button */}
      <div className="flex items-center gap-3">
        <button
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          disabled={recordingState === "processing" || isApplying}
          className={`w-12 h-12 rounded-full flex flex-col items-center justify-center gap-0.5 transition-all flex-shrink-0 select-none ${
            recordingState === "recording"
              ? "bg-red-500 text-white scale-110 shadow-md"
              : recordingState === "processing" || isApplying
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-white hover:bg-primary/90 shadow-sm active:scale-95"
          }`}
        >
          {recordingState === "recording" ? (
            <span className="text-lg">⏹</span>
          ) : recordingState === "processing" || isApplying ? (
            <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-lg">🎙️</span>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">
            {recordingState === "recording" ? "🔴 录音中，松开停止..." :
             recordingState === "processing" ? "识别中..." :
             isApplying ? "AI 更新中..." :
             "按住麦克风说出你的修改意见"}
          </p>
        </div>
      </div>

      {/* Text fallback */}
      <div className="flex gap-2">
        <input
          type="text"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
          placeholder="或打字输入修改意见..."
          className="flex-1 px-3 py-2 bg-white border border-border rounded-lg text-xs outline-none focus:border-primary/50 transition-all"
        />
        <button
          onClick={handleTextSend}
          disabled={!textInput.trim() || isApplying}
          className="px-3 py-2 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          发送
        </button>
      </div>
    </div>
  );
}

export default function Calibrate() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const noteId = parseInt(id || "0");
  const utils = trpc.useUtils();

  const [isApplying, setIsApplying] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set([0]));
  const [topicName, setTopicName] = useState("");

  const { data, isLoading, refetch } = trpc.notes.getById.useQuery(
    { id: noteId },
    { enabled: isAuthenticated && noteId > 0 }
  );

  const { data: topicsData } = trpc.notes.listTopics.useQuery(undefined, { enabled: isAuthenticated });

  const calibrateMutation = trpc.notes.applyCalibration.useMutation({
    onSuccess: () => {
      refetch();
      setIsApplying(false);
      toast.success("已更新分析内容");
    },
    onError: (err) => {
      toast.error(`更新失败: ${err.message}`);
      setIsApplying(false);
    },
  });

  const confirmMutation = trpc.notes.confirmDraft.useMutation({
    onSuccess: () => {
      toast.success("已确认存档！");
      navigate(`/note/${noteId}`);
    },
    onError: (err) => toast.error(`存档失败: ${err.message}`),
  });

  const applyInstruction = (instruction: string) => {
    setIsApplying(true);
    calibrateMutation.mutate({ noteId, instruction });
  };

  const handleConfirm = () => {
    confirmMutation.mutate({
      noteId,
      topicName: topicName.trim() || undefined,
    });
  };

  // Parse note data
  let noteItems: NoteItem[] = [];
  let coreTheme = "";
  let connectionInsight = "";
  let suggestedTopicName = "";
  let suggestedTopicReason = "";

  if (data?.note) {
    const note = data.note as any;
    try {
      const raw = note.noteItemsJson || note.aiAnswer || "";
      const markerIdx = raw.indexOf("__ITEMS__");
      const jsonStr = markerIdx !== -1 ? raw.slice(markerIdx + 9) : raw;
      const parsed = JSON.parse(jsonStr);
      noteItems = parsed.noteItems || [];
      coreTheme = parsed.coreTheme || note.coreTheme || "";
      connectionInsight = parsed.connectionInsight || note.connectionInsight || "";
      suggestedTopicName = parsed.suggestedTopicName || "";
      suggestedTopicReason = parsed.suggestedTopicReason || "";
    } catch {}
  }

  useEffect(() => {
    if (suggestedTopicName && !topicName) {
      setTopicName(suggestedTopicName);
    }
  }, [suggestedTopicName]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3" />
          <div className="h-40 bg-muted rounded-2xl" />
          <div className="h-32 bg-muted rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  const note = data?.note as any;
  if (!note) return null;
  const tags = (note.tags as string[]) || [];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">校准分析结果</h1>
            <p className="text-xs text-muted-foreground mt-0.5">每条内容下方可单独语音调整，满意后点「确认存档」</p>
          </div>
          <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200 font-medium">草稿</span>
        </div>

        {/* Note Header */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">{getCategoryIcon(note.category)}</span>
            <div className="flex-1 min-w-0">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getCategoryBadgeClass(note.category)}`}>
                {getCategoryLabel(note.category)}
              </span>
              <h2 className="text-base font-bold text-foreground mt-1.5 leading-snug">{note.title || "未命名"}</h2>
              {tags.length > 0 && (
                <div className="flex gap-1 mt-2 flex-wrap">
                  {tags.map((t: string) => (
                    <span key={t} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">#{t}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {/* Inline voice for overall note */}
          <InlineVoiceInput
            context="整体内容"
            onInstruction={applyInstruction}
            isApplying={isApplying}
          />
        </div>

        {/* Original Image */}
        {note.imageUrl && (
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <img src={note.imageUrl} alt="原始笔记" className="w-full max-h-60 object-contain bg-gray-50" />
          </div>
        )}

        {/* Core Theme + Connection */}
        {(coreTheme || connectionInsight) && (
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl border border-purple-100 p-4 space-y-3">
            {coreTheme && (
              <div>
                <p className="text-xs font-semibold text-purple-600 mb-1">🎯 AI 识别的核心命题</p>
                <p className="text-sm font-medium text-foreground">{coreTheme}</p>
              </div>
            )}
            {connectionInsight && (
              <div>
                <p className="text-xs font-semibold text-indigo-600 mb-1">🔮 内在逻辑链条</p>
                <p className="text-sm text-foreground leading-relaxed">{connectionInsight}</p>
              </div>
            )}
            <InlineVoiceInput
              context="核心命题和逻辑链条"
              onInstruction={applyInstruction}
              isApplying={isApplying}
            />
          </div>
        )}

        {/* Note Items — each with inline voice */}
        {noteItems.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">🧠 逐条分析 ({noteItems.length} 条)</p>
            {noteItems.map((item, i) => {
              const isExpanded = expandedItems.has(i);
              const typeColor = ITEM_TYPE_COLORS[item.type] || ITEM_TYPE_COLORS.concept;
              return (
                <div key={i} className="bg-white rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => setExpandedItems((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      return next;
                    })}
                    className="w-full p-3.5 flex items-start gap-2.5 text-left hover:bg-muted/20 transition-colors"
                  >
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 mt-0.5 ${typeColor}`}>
                      {ITEM_TYPE_LABELS[item.type] || item.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{item.keyword}</p>
                      {!isExpanded && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.deepAnswer}</p>}
                    </div>
                    <span className="text-muted-foreground text-xs flex-shrink-0">{isExpanded ? "▲" : "▼"}</span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-2.5 border-t border-border/50 pt-3">
                      <p className="text-sm text-foreground leading-relaxed">{item.deepAnswer}</p>
                      {item.actionable?.length > 0 && (
                        <div className="bg-green-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-green-700 mb-1.5">⚡ 可落地行动</p>
                          {item.actionable.map((a, j) => (
                            <p key={j} className="text-xs text-green-800 flex gap-1.5"><span>→</span><span>{a}</span></p>
                          ))}
                        </div>
                      )}
                      {item.furtherQuestions?.length > 0 && (
                        <div className="bg-amber-50 rounded-xl p-3">
                          <p className="text-xs font-semibold text-amber-700 mb-1.5">🔍 延伸追问</p>
                          {item.furtherQuestions.map((q, j) => (
                            <p key={j} className="text-xs text-amber-800 flex gap-1.5"><span>?</span><span>{q}</span></p>
                          ))}
                        </div>
                      )}
                      {/* ── Inline voice adjustment for this item ── */}
                      <InlineVoiceInput
                        context={item.keyword}
                        onInstruction={applyInstruction}
                        isApplying={isApplying}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* AI Summary */}
        {note.summary && (
          <div className="bg-blue-50/50 rounded-2xl border border-blue-100 p-4">
            <p className="text-xs font-semibold text-blue-600 mb-1.5">🤖 AI 摘要</p>
            <p className="text-sm text-foreground leading-relaxed">{note.summary}</p>
            <InlineVoiceInput
              context="AI 摘要"
              onInstruction={applyInstruction}
              isApplying={isApplying}
            />
          </div>
        )}

        {/* Topic Assignment */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">📚 归入知识主题</p>
            {suggestedTopicName && (
              <span className="text-xs text-muted-foreground">AI 建议：{suggestedTopicName}</span>
            )}
          </div>
          <input
            type="text"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            placeholder="输入主题名称（如「AI Agent」），留空则不归类"
            className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
          />
          {suggestedTopicReason && topicName === suggestedTopicName && (
            <p className="text-xs text-muted-foreground mt-1.5">💡 {suggestedTopicReason}</p>
          )}
          {topicsData && topicsData.length > 0 && (
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {topicsData.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTopicName(t.name)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    topicName === t.name
                      ? "bg-primary text-white border-primary"
                      : "bg-muted text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {t.name} ({t.noteCount})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={confirmMutation.isPending || isApplying}
          className="w-full py-4 rounded-2xl bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
        >
          {confirmMutation.isPending ? "存档中..." : isApplying ? "AI 更新中，请稍候..." : "✅ 确认存档"}
        </button>
        <p className="text-xs text-muted-foreground text-center -mt-2">
          确认后内容将保存到知识库{topicName ? `，归入「${topicName}」主题` : ""}
        </p>
      </div>
    </AppLayout>
  );
}
