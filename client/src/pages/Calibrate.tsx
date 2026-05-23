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

export default function Calibrate() {
  const { id } = useParams<{ id: string }>();
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const noteId = parseInt(id || "0");
  const utils = trpc.useUtils();

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [transcript, setTranscript] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set([0]));
  const [topicName, setTopicName] = useState("");
  const [showTopicInput, setShowTopicInput] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const { data, isLoading, refetch } = trpc.notes.getById.useQuery(
    { id: noteId },
    { enabled: isAuthenticated && noteId > 0 }
  );

  const { data: topicsData } = trpc.notes.listTopics.useQuery(undefined, { enabled: isAuthenticated });

  const transcribeMutation = trpc.notes.transcribeVoice.useMutation({
    onSuccess: async (result) => {
      setTranscript(result.text);
      // Auto-apply the transcribed instruction
      if (result.text.trim()) {
        await applyInstruction(result.text);
      }
      setRecordingState("idle");
    },
    onError: (err) => {
      toast.error(`语音识别失败: ${err.message}`);
      setRecordingState("idle");
    },
  });

  const calibrateMutation = trpc.notes.applyCalibration.useMutation({
    onSuccess: () => {
      refetch();
      setTranscript("");
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

  const applyInstruction = async (instruction: string) => {
    setIsApplying(true);
    calibrateMutation.mutate({ noteId, instruction });
  };

  // Start recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(",")[1];
          setRecordingState("processing");
          transcribeMutation.mutate({ audioBase64: base64, mimeType: "audio/webm" });
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      setRecordingState("recording");
    } catch {
      toast.error("无法访问麦克风，请检查权限设置");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const handleConfirm = () => {
    if (topicName.trim()) {
      confirmMutation.mutate({ noteId, topicName: topicName.trim() });
    } else {
      confirmMutation.mutate({ noteId });
    }
  };

  // Parse note data
  let noteItems: NoteItem[] = [];
  let coreTheme = "";
  let connectionInsight = "";
  let suggestedTopicName = "";
  let suggestedTopicReason = "";
  let displayAiAnswer: string | null = null;

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
      if (markerIdx !== -1) {
        displayAiAnswer = raw.slice(0, markerIdx).trim() || null;
      }
    } catch {
      displayAiAnswer = data.note.aiAnswer;
    }
    // Pre-fill topic name with AI suggestion
    if (!topicName && suggestedTopicName) {
      setTopicName(suggestedTopicName);
    }
  }

  // Set suggested topic name when data loads
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
            <p className="text-xs text-muted-foreground mt-0.5">用语音告诉 AI 哪里需要修改，满意后点击「确认存档」</p>
          </div>
          <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200 font-medium">
            草稿
          </span>
        </div>

        {/* Note Header Info */}
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
          </div>
        )}

        {/* Note Items */}
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
            placeholder="输入主题名称（如「AI Agent」「认知方法论」），留空则不归类"
            className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
          />
          {suggestedTopicReason && topicName === suggestedTopicName && (
            <p className="text-xs text-muted-foreground mt-1.5">💡 {suggestedTopicReason}</p>
          )}
          {/* Existing topics quick select */}
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

        {/* Voice Calibration Area */}
        <div className="bg-white rounded-2xl border border-border p-4">
          <p className="text-sm font-semibold text-foreground mb-1">🎙️ 语音校准</p>
          <p className="text-xs text-muted-foreground mb-3">
            按住录音，告诉 AI 哪里需要修改。例如：「Karpathy 这条再深入一点，说说他从学术转向工程的过程」
          </p>

          {/* Recording Button */}
          <div className="flex flex-col items-center gap-3">
            <button
              onPointerDown={startRecording}
              onPointerUp={stopRecording}
              onPointerLeave={stopRecording}
              disabled={recordingState === "processing" || isApplying}
              className={`w-20 h-20 rounded-full flex flex-col items-center justify-center gap-1 transition-all select-none ${
                recordingState === "recording"
                  ? "bg-red-500 text-white scale-110 shadow-lg shadow-red-200"
                  : recordingState === "processing" || isApplying
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/20 active:scale-95"
              }`}
            >
              {recordingState === "recording" ? (
                <>
                  <span className="text-2xl">⏹</span>
                  <span className="text-[10px] font-medium">松开停止</span>
                </>
              ) : recordingState === "processing" ? (
                <>
                  <div className="w-5 h-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px]">识别中</span>
                </>
              ) : isApplying ? (
                <>
                  <div className="w-5 h-5 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px]">更新中</span>
                </>
              ) : (
                <>
                  <span className="text-2xl">🎙️</span>
                  <span className="text-[10px] font-medium">按住说话</span>
                </>
              )}
            </button>

            {transcript && (
              <div className="w-full bg-muted/50 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">识别到的指令：</p>
                <p className="text-sm text-foreground">{transcript}</p>
              </div>
            )}
          </div>

          {/* Text fallback */}
          <div className="mt-3 relative">
            <input
              type="text"
              placeholder="或者直接打字输入修改指令..."
              className="w-full px-3 py-2.5 pr-16 bg-muted/30 border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                  applyInstruction((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">回车发送</span>
          </div>
        </div>

        {/* Confirm Button */}
        <button
          onClick={handleConfirm}
          disabled={confirmMutation.isPending}
          className="w-full py-4 rounded-2xl bg-primary text-white font-semibold text-base hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] disabled:opacity-50"
        >
          {confirmMutation.isPending ? "存档中..." : "✅ 确认存档"}
        </button>
        <p className="text-xs text-muted-foreground text-center -mt-2">
          确认后内容将保存到知识库{topicName ? `，归入「${topicName}」主题` : ""}
        </p>
      </div>
    </AppLayout>
  );
}
