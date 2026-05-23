import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";

type UploadMode = "image" | "text";

interface ImageItem {
  id: string;
  preview: string;
  base64: string;
  type: string;
  status: "pending" | "uploading" | "analyzing" | "done" | "error";
  noteId?: number;
  errorMsg?: string;
}

function readFileAsBase64(file: File): Promise<{ preview: string; base64: string; type: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      resolve({
        preview: result,
        base64: result.split(",")[1],
        type: file.type || "image/jpeg",
      });
    };
    reader.readAsDataURL(file);
  });
}

export default function Upload() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<UploadMode>("image");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [textContent, setTextContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [doneNoteIds, setDoneNoteIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.notes.uploadAndAnalyze.useMutation();

  const handleFilesChange = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newItems: ImageItem[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const { preview, base64, type } = await readFileAsBase64(file);
      newItems.push({
        id: `${Date.now()}-${Math.random()}`,
        preview,
        base64,
        type,
        status: "pending",
      });
    }
    setImages((prev) => [...prev, ...newItems]);
  }, []);

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFilesChange(e.dataTransfer.files);
  }, [handleFilesChange]);

  const handleSubmit = async () => {
    if (mode === "image" && images.length === 0) {
      toast.error("请先选择至少一张图片");
      return;
    }
    if (mode === "text" && !textContent.trim()) {
      toast.error("请输入文字内容");
      return;
    }

    setIsSubmitting(true);
    setAllDone(false);

    if (mode === "text") {
      try {
        const result = await uploadMutation.mutateAsync({ textContent });
        toast.success("分析完成！请校准内容后再存档");
        navigate(`/calibrate/${result.note.id}`);
      } catch (err: any) {
        toast.error(`分析失败: ${err.message}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Multi-image: process sequentially
    const completedIds: number[] = [];

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      // Mark as uploading
      setImages((prev) =>
        prev.map((item) => item.id === img.id ? { ...item, status: "uploading" } : item)
      );

      await new Promise((r) => setTimeout(r, 300)); // slight delay for UX

      setImages((prev) =>
        prev.map((item) => item.id === img.id ? { ...item, status: "analyzing" } : item)
      );

      try {
        const result = await uploadMutation.mutateAsync({
          imageBase64: img.base64,
          imageType: img.type,
        });
        completedIds.push(result.note.id);
        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id ? { ...item, status: "done", noteId: result.note.id } : item
          )
        );
      } catch (err: any) {
        setImages((prev) =>
          prev.map((item) =>
            item.id === img.id ? { ...item, status: "error", errorMsg: err.message } : item
          )
        );
      }
    }

    setDoneNoteIds(completedIds);
    setAllDone(true);
    setIsSubmitting(false);

    if (completedIds.length === 1) {
      // Single success: go directly to calibrate
      toast.success("分析完成！请校准内容后再存档");
      setTimeout(() => navigate(`/calibrate/${completedIds[0]}`), 600);
    } else if (completedIds.length > 1) {
      toast.success(`${completedIds.length} 张图片分析完成！请逐一校准`);
    }
  };

  const pendingCount = images.filter((i) => i.status === "pending").length;
  const doneCount = images.filter((i) => i.status === "done").length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const totalCount = images.length;

  const statusIcon = (status: ImageItem["status"]) => {
    if (status === "pending") return <span className="text-muted-foreground text-xs">待处理</span>;
    if (status === "uploading") return <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />;
    if (status === "analyzing") return <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />;
    if (status === "done") return <span className="text-green-500 text-base">✓</span>;
    if (status === "error") return <span className="text-destructive text-base">✕</span>;
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <h1 className="text-xl font-bold text-foreground">新建记录</h1>

        {/* Mode Toggle */}
        <div className="bg-muted rounded-xl p-1 flex gap-1">
          <button
            onClick={() => setMode("image")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "image" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            📷 拍照/上传图片
          </button>
          <button
            onClick={() => setMode("text")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === "text" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            ✍️ 文字输入
          </button>
        </div>

        {/* Image Upload Area */}
        {mode === "image" && (
          <>
            {/* Hidden inputs */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFilesChange(e.target.files)}
              className="hidden"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => handleFilesChange(e.target.files)}
              className="hidden"
            />

            {/* Image Grid */}
            {images.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <div key={img.id} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                      <img src={img.preview} alt="" className="w-full h-full object-cover" />
                      {/* Status overlay */}
                      <div className={`absolute inset-0 flex items-center justify-center ${
                        img.status === "done" ? "bg-green-500/20" :
                        img.status === "error" ? "bg-destructive/20" :
                        img.status !== "pending" ? "bg-black/30" : ""
                      }`}>
                        {img.status !== "pending" && (
                          <div className="bg-white/90 rounded-full p-1.5">
                            {statusIcon(img.status)}
                          </div>
                        )}
                      </div>
                      {/* Remove button (only when pending) */}
                      {img.status === "pending" && !isSubmitting && (
                        <button
                          onClick={() => removeImage(img.id)}
                          className="absolute top-1 right-1 bg-black/60 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add more button */}
                  {!isSubmitting && !allDone && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary/40 bg-muted/50 flex flex-col items-center justify-center gap-1 transition-all"
                    >
                      <span className="text-2xl text-muted-foreground">+</span>
                      <span className="text-[10px] text-muted-foreground">添加</span>
                    </button>
                  )}
                </div>

                {/* Progress bar when submitting */}
                {isSubmitting && totalCount > 1 && (
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-primary">
                        正在分析 {doneCount + errorCount + 1} / {totalCount}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {doneCount} 完成 {errorCount > 0 ? `· ${errorCount} 失败` : ""}
                      </span>
                    </div>
                    <div className="h-1.5 bg-primary/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${((doneCount + errorCount) / totalCount) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">gpt-4o 看图识字 → o3 深度分析，每张约 45-90 秒</p>
                  </div>
                )}

                {/* All done: show calibrate links */}
                {allDone && doneNoteIds.length > 1 && (
                  <div className="bg-green-50 border border-green-100 rounded-xl p-3.5">
                    <p className="text-sm font-semibold text-green-700 mb-2">✅ 全部分析完成！</p>
                    <p className="text-xs text-green-600 mb-3">请逐一进入校准界面确认内容后存档：</p>
                    <div className="space-y-1.5">
                      {images.filter((i) => i.status === "done" && i.noteId).map((img, idx) => (
                        <button
                          key={img.id}
                          onClick={() => navigate(`/calibrate/${img.noteId}`)}
                          className="w-full flex items-center gap-2 p-2 bg-white rounded-lg border border-green-100 hover:border-green-300 transition-colors text-left"
                        >
                          <img src={img.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          <span className="text-xs text-foreground font-medium">第 {idx + 1} 张 → 去校准</span>
                          <span className="ml-auto text-green-500 text-sm">→</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Empty state */
              <div
                className="rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-all"
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              >
                <div className="p-8 flex flex-col items-center gap-4">
                  <span className="text-5xl">🖼️</span>
                  <div className="text-center">
                    <p className="font-medium text-foreground">选择图片来源</p>
                    <p className="text-sm mt-1 text-muted-foreground">支持同时选择多张图片批量分析</p>
                  </div>
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 flex flex-col items-center gap-2 py-4 bg-white rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-[0.97]"
                    >
                      <span className="text-2xl">📷</span>
                      <span className="text-xs font-medium text-foreground">拍照</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex flex-col items-center gap-2 py-4 bg-white rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-[0.97]"
                    >
                      <span className="text-2xl">🖼️</span>
                      <span className="text-xs font-medium text-foreground">从相册选择</span>
                      <span className="text-[10px] text-muted-foreground">可多选</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Text Input Area */}
        {mode === "text" && (
          <div className="bg-white rounded-2xl border border-border p-4">
            <textarea
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
              placeholder="输入你想记录的内容...

可以是：
• 一个突然的灵感
• 一个想搞清楚的问题
• 一个人名或技能词
• 一件要做的事
• 一段经历或感悟"
              className="w-full h-52 text-sm text-foreground placeholder:text-muted-foreground/60 resize-none outline-none leading-relaxed"
            />
            <div className="flex justify-end mt-2">
              <span className="text-xs text-muted-foreground">{textContent.length} 字</span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        {!allDone && (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`w-full py-4 rounded-2xl font-semibold text-base transition-all ${
              isSubmitting
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-[0.98]"
            }`}
          >
            {isSubmitting
              ? `分析中... (${doneCount}/${totalCount})`
              : mode === "image" && images.length > 1
              ? `🤖 AI 分析 ${images.length} 张图片`
              : "🤖 AI 分析记录（多模型流水线）"}
          </button>
        )}

        {/* Tips */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
          <p className="text-xs text-amber-800 font-medium mb-1.5">💡 使用技巧</p>
          <ul className="text-xs text-amber-700 space-y-1">
            <li>• 从相册选图时可以长按多选，一次上传多张</li>
            <li>• 每张图片独立分析，完成后逐一进入校准界面</li>
            <li>• 每张约需 45-90 秒，多张会依次处理</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
