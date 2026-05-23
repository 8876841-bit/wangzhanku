import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";

type InputMode = "image" | "text";

interface ImageItem {
  id: string;
  preview: string;
  base64: string;
  type: string;
  status: "pending" | "uploading" | "analyzing" | "done" | "error";
  entryId?: number;
}

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
  const [mode, setMode] = useState<InputMode>("image");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [textContent, setTextContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const submitMutation = trpc.entries.submit.useMutation();

  const handleFilesChange = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: ImageItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const { preview, base64, type } = await readFileAsBase64(file);
      newItems.push({ id: `${Date.now()}-${Math.random()}`, preview, base64, type, status: "pending" });
    }
    setImages((prev) => [...prev, ...newItems]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFilesChange(e.dataTransfer.files);
  }, [handleFilesChange]);

  const handleSubmit = async () => {
    if (mode === "image" && images.length === 0) { toast.error("请先选择图片"); return; }
    if (mode === "text" && !textContent.trim()) { toast.error("请输入内容"); return; }

    setIsSubmitting(true);
    setAllDone(false);

    if (mode === "text") {
      try {
        const result = await submitMutation.mutateAsync({ textContent });
        toast.success("已提交，跳转校正...");
        navigate(`/review/${result.entry.id}`);
      } catch (err: any) {
        toast.error(`提交失败: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Multi-image sequential processing
    const doneIds: number[] = [];
    for (const img of images) {
      setImages((prev) => prev.map((i) => i.id === img.id ? { ...i, status: "uploading" } : i));
      await new Promise((r) => setTimeout(r, 200));
      setImages((prev) => prev.map((i) => i.id === img.id ? { ...i, status: "analyzing" } : i));
      try {
        const result = await submitMutation.mutateAsync({ imageBase64: img.base64, imageType: img.type });
        doneIds.push(result.entry.id);
        setImages((prev) => prev.map((i) => i.id === img.id ? { ...i, status: "done", entryId: result.entry.id } : i));
      } catch {
        setImages((prev) => prev.map((i) => i.id === img.id ? { ...i, status: "error" } : i));
      }
    }

    setAllDone(true);
    setIsSubmitting(false);

    if (doneIds.length === 1) {
      toast.success("分析完成，进入校正");
      setTimeout(() => navigate(`/review/${doneIds[0]}`), 500);
    } else if (doneIds.length > 1) {
      toast.success(`${doneIds.length} 条分析完成，请逐一校正`);
    }
  };

  const doneCount = images.filter((i) => i.status === "done").length;
  const totalCount = images.length;

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-foreground">输入</h1>
          <p className="text-xs text-muted-foreground mt-0.5">低摩擦输入 → AI 识别分类 → 你一句话校正</p>
        </div>

        {/* Mode Toggle */}
        <div className="bg-muted rounded-xl p-1 flex gap-1">
          <button onClick={() => setMode("image")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "image" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
            📷 图片/截图
          </button>
          <button onClick={() => setMode("text")} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "text" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground"}`}>
            ✍️ 文字
          </button>
        </div>

        {/* Image mode */}
        {mode === "image" && (
          <>
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={(e) => handleFilesChange(e.target.files)} className="hidden" />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleFilesChange(e.target.files)} className="hidden" />

            {images.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                      <img src={img.preview} alt="" className="w-full h-full object-cover" />
                      <div className={`absolute inset-0 flex items-center justify-center ${img.status === "done" ? "bg-green-500/20" : img.status === "error" ? "bg-red-500/20" : img.status !== "pending" ? "bg-black/30" : ""}`}>
                        {img.status === "uploading" && <div className="bg-white/90 rounded-full p-1.5"><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}
                        {img.status === "analyzing" && <div className="bg-white/90 rounded-full p-1.5"><div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>}
                        {img.status === "done" && <div className="bg-white/90 rounded-full p-1.5"><span className="text-green-500 text-base">✓</span></div>}
                        {img.status === "error" && <div className="bg-white/90 rounded-full p-1.5"><span className="text-red-500 text-base">✕</span></div>}
                      </div>
                      {img.status === "pending" && !isSubmitting && (
                        <button onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))} className="absolute top-1 right-1 bg-black/60 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">✕</button>
                      )}
                    </div>
                  ))}
                  {!isSubmitting && !allDone && (
                    <button onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-muted/50 flex flex-col items-center justify-center gap-1 transition-all">
                      <span className="text-2xl text-muted-foreground">+</span>
                      <span className="text-[10px] text-muted-foreground">添加</span>
                    </button>
                  )}
                </div>

                {isSubmitting && totalCount > 1 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs font-medium text-primary">分析中 {doneCount}/{totalCount}</span>
                      <span className="text-xs text-muted-foreground">gpt-4o 看图 → o3 深度分析</span>
                    </div>
                    <div className="h-1.5 bg-primary/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${(doneCount / totalCount) * 100}%` }} />
                    </div>
                  </div>
                )}

                {allDone && doneCount > 1 && (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-3.5">
                    <p className="text-sm font-semibold text-green-700 mb-2">✅ 全部分析完成</p>
                    <div className="space-y-1.5">
                      {images.filter((i) => i.status === "done" && i.entryId).map((img, idx) => (
                        <button key={img.id} onClick={() => navigate(`/review/${img.entryId}`)} className="w-full flex items-center gap-2 p-2 bg-white rounded-lg border border-green-100 hover:border-green-300 transition-colors text-left">
                          <img src={img.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          <span className="text-xs text-foreground font-medium">第 {idx + 1} 张 → 去校正</span>
                          <span className="ml-auto text-green-500 text-sm">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-border hover:border-primary/40 transition-all" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
                <div className="p-8 flex flex-col items-center gap-4">
                  <span className="text-5xl">📷</span>
                  <div className="text-center">
                    <p className="font-medium text-foreground">选择图片来源</p>
                    <p className="text-sm mt-1 text-muted-foreground">支持手写笔记、截图、便利贴，可多选</p>
                  </div>
                  <div className="flex gap-3 w-full">
                    <button onClick={() => cameraInputRef.current?.click()} className="flex-1 flex flex-col items-center gap-2 py-4 bg-white rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-[0.97]">
                      <span className="text-2xl">📷</span>
                      <span className="text-xs font-medium text-foreground">拍照</span>
                    </button>
                    <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex flex-col items-center gap-2 py-4 bg-white rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-[0.97]">
                      <span className="text-2xl">🖼️</span>
                      <span className="text-xs font-medium text-foreground">从相册</span>
                      <span className="text-[10px] text-muted-foreground">可多选</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Text mode */}
        {mode === "text" && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="输入任何内容：一个词、一句话、一个问题、一段感悟...

AI 会自动判断它属于哪一类：
Concept / Person / Case / Question / Insight
Idea / Skill / Action / Model / Trigger / Positioning"
              className="w-full h-52 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none outline-none leading-relaxed"
            />
            <div className="flex justify-end mt-2">
              <span className="text-xs text-muted-foreground">{textContent.length} 字</span>
            </div>
          </div>
        )}

        {/* Submit */}
        {!allDone && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full py-4 rounded-2xl font-semibold text-base transition-all ${isSubmitting ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-[0.98]"}`}
          >
            {isSubmitting
              ? `AI 分析中... (${doneCount}/${totalCount || 1})`
              : mode === "image" && images.length > 1
              ? `🤖 提交 ${images.length} 张图片`
              : "🤖 提交 → AI 分析"}
          </button>
        )}

        <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground">
          <p className="font-medium mb-1">⚡ 处理流程</p>
          <p>提交 → gpt-4o 识别内容 → o3 深度分析 → 你一句话校正 → 确认入库 → 自动推送 GitHub</p>
        </div>
      </div>
    </AppLayout>
  );
}
