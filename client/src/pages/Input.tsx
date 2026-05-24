import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";

type InputMode = "image" | "text" | "video";
type ProcessingMode = "recognize_only" | "organize" | "archive" | "deepdive";
type SourceType = "manual_note" | "screenshot" | "text" | "voice" | "douyin" | "xiaohongshu" | "bilibili" | "podcast" | "article" | "github" | "other";

interface ImageItem {
  id: string;
  preview: string;
  base64: string;
  type: string;
  status: "pending" | "uploading" | "analyzing" | "done" | "error";
  entryId?: number;
  errorMessage?: string;
}

const PROCESSING_MODE_CONFIG: Record<ProcessingMode, { label: string; desc: string; icon: string; active: string }> = {
  recognize_only: { label: "只识别", desc: "只还原文字，不分析不入库", icon: "👁", active: "border-gray-400 bg-gray-50 text-gray-700" },
  organize:       { label: "识别整理", desc: "判断意图+分类+下一步建议", icon: "🗂", active: "border-blue-400 bg-blue-50 text-blue-700" },
  archive:        { label: "分类入库", desc: "生成结构化内容，等待确认", icon: "📥", active: "border-green-400 bg-green-50 text-green-700" },
  deepdive:       { label: "深挖这个", desc: "完整深度分析，定义/案例/行动", icon: "🔭", active: "border-purple-400 bg-purple-50 text-purple-700" },
};

const SOURCE_TYPES = [
  { key: "screenshot", label: "截图", icon: "📸" },
  { key: "text", label: "文字", icon: "💬" },
  { key: "manual_note", label: "手写", icon: "✏️" },
  { key: "douyin", label: "抖音", icon: "🎵" },
  { key: "xiaohongshu", label: "小红书", icon: "📕" },
  { key: "bilibili", label: "B站", icon: "📺" },
  { key: "podcast", label: "播客", icon: "🎧" },
  { key: "article", label: "文章", icon: "📄" },
  { key: "github", label: "GitHub", icon: "💻" },
  { key: "other", label: "其他", icon: "🔗" },
] as const;

const DOUYIN_QUICK_TAGS = [
  "技能酷", "模式可参考", "表达好", "文案好",
  "可落地", "商业机会", "账号值得拆", "内容结构值得学",
];

function readFileAsBase64(file: File): Promise<{ preview: string; base64: string; type: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      resolve({ preview: result, base64: result.split(",")[1], type: file.type || "image/jpeg" });
    };
    reader.readAsDataURL(file);
  });
}

export default function Input() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();

  const [inputMode, setInputMode] = useState<InputMode>("image");
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("organize");
  const [sourceType, setSourceType] = useState<SourceType>("screenshot");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [attentionPoint, setAttentionPoint] = useState("");
  const [selectedDouyinTags, setSelectedDouyinTags] = useState<string[]>([]);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [textContent, setTextContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [doneEntryIds, setDoneEntryIds] = useState<number[]>([]);
  const [allDone, setAllDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const submitMutation = trpc.entries.submit.useMutation();

  const buildAttentionPoint = () => {
    const parts: string[] = [];
    if (attentionPoint.trim()) parts.push(attentionPoint.trim());
    if (selectedDouyinTags.length > 0) parts.push("关注点：" + selectedDouyinTags.join("、"));
    return parts.join("；") || undefined;
  };

  const handleFilesChange = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: ImageItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const { preview, base64, type } = await readFileAsBase64(file);
      newItems.push({ id: Date.now() + "-" + Math.random(), preview, base64, type, status: "pending" });
    }
    setImages((prev) => [...prev, ...newItems]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFilesChange(e.dataTransfer.files);
  }, [handleFilesChange]);

  const handleSubmit = async () => {
    if (inputMode === "image" && images.length === 0) { toast.error("请先选择图片"); return; }
    if (inputMode === "text" && !textContent.trim()) { toast.error("请输入内容"); return; }
    if (inputMode === "video" && !sourceUrl.trim()) { toast.error("请输入视频链接"); return; }

    setIsSubmitting(true);
    const fullAttentionPoint = buildAttentionPoint();

    try {
      if (inputMode === "text") {
        const result = await submitMutation.mutateAsync({
          textContent,
          processingMode,
          sourceType,
          sourceName: sourceName || undefined,
          sourceUrl: sourceUrl || undefined,
          attentionPoint: fullAttentionPoint,
        });
        toast.success("提交成功，AI 正在处理...");
        navigate("/review/" + result.entryId);
        return;
      }

      if (inputMode === "video") {
        const content = textContent
          ? textContent + "\n\n来源：" + sourceUrl + (sourceName ? "\n账号：" + sourceName : "")
          : "来源：" + sourceUrl + (sourceName ? "\n账号：" + sourceName : "");
        const result = await submitMutation.mutateAsync({
          textContent: content,
          processingMode,
          sourceType: "douyin",
          sourceName: sourceName || undefined,
          sourceUrl: sourceUrl || undefined,
          attentionPoint: fullAttentionPoint,
        });
        toast.success("提交成功，AI 正在处理...");
        navigate("/review/" + result.entryId);
        return;
      }

      // Image mode
      const entryIds: number[] = [];
      for (const img of images) {
        setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: "analyzing" } : i));
        try {
          const result = await submitMutation.mutateAsync({
            imageBase64: img.base64,
            imageType: img.type,
            processingMode,
            sourceType,
            sourceName: sourceName || undefined,
            sourceUrl: sourceUrl || undefined,
            attentionPoint: fullAttentionPoint,
          });
          setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: "done", entryId: result.entryId } : i));
          entryIds.push(result.entryId);
        } catch (err: any) {
          const message = err?.message || "图片识别失败";
          setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: "error", errorMessage: message } : i));
          toast.error(message);
        }
      }

      if (entryIds.length === 1) {
        navigate("/review/" + entryIds[0]);
      } else if (entryIds.length > 1) {
        setDoneEntryIds(entryIds);
        setAllDone(true);
      }
    } catch (err: any) {
      toast.error(err?.message || "提交失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthenticated) return null;

  if (allDone && doneEntryIds.length > 0) {
    return (
      <AppLayout>
        <div className="p-4 space-y-3">
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✅</div>
            <p className="font-medium text-gray-800">{doneEntryIds.length} 张图片处理完成</p>
          </div>
          {images.filter(i => i.status === "done").map((img, idx) => (
            <button key={img.id} onClick={() => img.entryId && navigate("/review/" + img.entryId)}
              className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200 text-left">
              <img src={img.preview} className="w-12 h-12 rounded-lg object-cover" alt="" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">图片 {idx + 1}</p>
                <p className="text-xs text-green-600">已完成 → 点击校正</p>
              </div>
              <span className="text-gray-400">›</span>
            </button>
          ))}
          <button onClick={() => { setImages([]); setAllDone(false); setDoneEntryIds([]); }}
            className="w-full py-3 text-sm text-gray-500 border border-dashed border-gray-300 rounded-xl">
            继续输入
          </button>
        </div>
      </AppLayout>
    );
  }

  const showDouyinTags = inputMode === "video" || sourceType === "douyin";
  const showSourceFields = sourceType !== "text" && sourceType !== "manual_note" && inputMode !== "video";
  const doneCount = images.filter(i => i.status === "done").length;

  return (
    <AppLayout>
      <div className="p-4 space-y-4 pb-32">

        {/* Input mode tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
          {[
            { key: "image" as InputMode, label: "📷 图片" },
            { key: "text" as InputMode, label: "✏️ 文字" },
            { key: "video" as InputMode, label: "🎵 视频" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => {
              setInputMode(key);
              if (key === "image") setSourceType("screenshot");
              if (key === "text") setSourceType("text");
              if (key === "video") setSourceType("douyin");
            }}
              className={"flex-1 py-2 text-sm font-medium rounded-lg transition-all " + (inputMode === key ? "bg-white shadow text-gray-900" : "text-gray-500")}>
              {label}
            </button>
          ))}
        </div>

        {/* Processing mode */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">处理方式</p>
          <div className="grid grid-cols-2 gap-2">
            {(Object.entries(PROCESSING_MODE_CONFIG) as [ProcessingMode, typeof PROCESSING_MODE_CONFIG[ProcessingMode]][]).map(([key, cfg]) => (
              <button key={key} onClick={() => setProcessingMode(key)}
                className={"p-3 rounded-xl border-2 text-left transition-all " + (processingMode === key ? cfg.active : "border-gray-200 bg-white text-gray-500")}>
                <div className="text-lg mb-0.5">{cfg.icon}</div>
                <div className="text-sm font-semibold">{cfg.label}</div>
                <div className="text-xs opacity-70 leading-tight mt-0.5">{cfg.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Attention point */}
        <div>
          <label className="text-xs font-medium text-gray-500 block mb-1.5">
            你为什么想存它？<span className="text-gray-400 font-normal ml-1">（可选）</span>
          </label>
          <textarea value={attentionPoint} onChange={e => setAttentionPoint(e.target.value)}
            placeholder="例：我关注的是这个视频的开头表达，不是内容本身。"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none bg-amber-50 placeholder-amber-300" />
        </div>

        {/* Douyin quick tags */}
        {showDouyinTags && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">快速标记关注点</p>
            <div className="flex flex-wrap gap-2">
              {DOUYIN_QUICK_TAGS.map(tag => (
                <button key={tag} onClick={() => setSelectedDouyinTags(prev =>
                  prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                )}
                  className={"px-3 py-1.5 text-xs rounded-full border transition-all " + (selectedDouyinTags.includes(tag) ? "bg-orange-100 border-orange-400 text-orange-700 font-medium" : "bg-white border-gray-200 text-gray-600")}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Source type (image/text mode) */}
        {inputMode !== "video" && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">来源类型</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {SOURCE_TYPES.map(({ key, label, icon }) => (
                <button key={key} onClick={() => setSourceType(key as SourceType)}
                  className={"flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all " + (sourceType === key ? "bg-blue-100 border-blue-400 text-blue-700 font-medium" : "bg-white border-gray-200 text-gray-500")}>
                  <span>{icon}</span><span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Source name/URL */}
        {showSourceFields && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">来源名称</label>
              <input value={sourceName} onChange={e => setSourceName(e.target.value)}
                placeholder="例：@某某账号"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">来源链接</label>
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
        )}

        {/* Image input */}
        {inputMode === "image" && (
          <div className="space-y-3">
            {images.length === 0 ? (
              <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-all"
                onClick={() => fileInputRef.current?.click()}>
                <div className="text-4xl mb-2">📷</div>
                <p className="text-sm font-medium text-gray-600">点击选择图片</p>
                <p className="text-xs text-gray-400 mt-1">支持多选 · 手写笔记 · 截图</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                      <img src={img.preview} className="w-full h-full object-cover" alt="" />
                      <div className={"absolute inset-0 flex items-center justify-center text-xs font-bold text-white " + (img.status === "done" ? "bg-green-500/70" : img.status === "error" ? "bg-red-500/70" : img.status === "analyzing" ? "bg-blue-500/70" : "bg-transparent")}>
                        {img.status === "done" && "✓"}
                        {img.status === "error" && "✗"}
                        {img.status === "analyzing" && "分析中"}
                      </div>
                      {img.status === "pending" && (
                        <button onClick={() => setImages(prev => prev.filter(i => i.id !== img.id))}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/50 text-white rounded-full text-xs flex items-center justify-center">×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-2xl text-gray-400 hover:border-blue-400 transition-all">+</button>
                </div>
                {images.length > 1 && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <span>{doneCount}/{images.length} 完成</span>
                    {isSubmitting && <span className="text-blue-500 animate-pulse ml-auto">处理中...</span>}
                  </div>
                )}
                {images.some(i => i.status === "error" && i.errorMessage) && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    {images.find(i => i.status === "error" && i.errorMessage)?.errorMessage}
                  </div>
                )}
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFilesChange(e.target.files)} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={e => handleFilesChange(e.target.files)} />
            {images.length === 0 && (
              <button onClick={() => cameraInputRef.current?.click()}
                className="w-full py-3 flex items-center justify-center gap-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                📸 直接拍照
              </button>
            )}
          </div>
        )}

        {/* Text input */}
        {inputMode === "text" && (
          <textarea value={textContent} onChange={e => setTextContent(e.target.value)}
            placeholder={"输入你想记录的内容...\n\n可以是：一个词、一句话、一段想法、一个问题、一个人名..."}
            rows={8}
            className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
        )}

        {/* Video input */}
        {inputMode === "video" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">视频链接 *</label>
              <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)}
                placeholder="粘贴抖音/B站/YouTube 链接..."
                className="w-full px-3 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">账号/作者</label>
              <input value={sourceName} onChange={e => setSourceName(e.target.value)}
                placeholder="例：@某某账号"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1.5">我的转发备注</label>
              <textarea value={textContent} onChange={e => setTextContent(e.target.value)}
                placeholder="这个视频为什么吸引你？你想从中学到什么？"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
            </div>
          </div>
        )}

        {/* Submit button */}
        <div className="fixed bottom-20 left-0 right-0 px-4 pb-2 bg-gradient-to-t from-gray-50 pt-4">
          <button onClick={handleSubmit}
            disabled={isSubmitting || (inputMode === "image" && images.length === 0) || (inputMode === "text" && !textContent.trim()) || (inputMode === "video" && !sourceUrl.trim())}
            className={"w-full py-4 rounded-2xl text-white font-semibold text-base transition-all shadow-lg " + (isSubmitting ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 active:scale-98")}>
            {isSubmitting
              ? PROCESSING_MODE_CONFIG[processingMode].icon + " " + PROCESSING_MODE_CONFIG[processingMode].label + "中..."
              : PROCESSING_MODE_CONFIG[processingMode].icon + " " + PROCESSING_MODE_CONFIG[processingMode].label}
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
