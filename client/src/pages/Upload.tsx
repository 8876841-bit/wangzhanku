import { useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";

type UploadMode = "image" | "text";
type AnalysisStep = "idle" | "uploading" | "analyzing" | "done" | "error";

const STEP_LABELS: Record<AnalysisStep, string> = {
  idle: "",
  uploading: "上传图片中...",
  analyzing: "AI 正在分析...",
  done: "分析完成！",
  error: "分析失败",
};

export default function Upload() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const [mode, setMode] = useState<UploadMode>("image");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageType, setImageType] = useState("image/jpeg");
  const [textContent, setTextContent] = useState("");
  const [step, setStep] = useState<AnalysisStep>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);       // 相册选图
  const cameraInputRef = useRef<HTMLInputElement>(null);     // 直接拍照

  const uploadMutation = trpc.notes.uploadAndAnalyze.useMutation({
    onSuccess: (data) => {
      setStep("done");
      toast.success("记录成功！AI 分析已完成");
      setTimeout(() => {
        navigate(`/note/${data.note.id}`);
      }, 800);
    },
    onError: (err) => {
      setStep("error");
      toast.error(`分析失败: ${err.message}`);
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageType(file.type || "image/jpeg");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      // Extract base64 data (remove data:image/xxx;base64, prefix)
      const base64 = result.split(",")[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    setImageType(file.type);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setImagePreview(result);
      const base64 = result.split(",")[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = async () => {
    if (mode === "image" && !imageBase64) {
      toast.error("请先选择或拍摄一张图片");
      return;
    }
    if (mode === "text" && !textContent.trim()) {
      toast.error("请输入文字内容");
      return;
    }

    setStep("uploading");
    setTimeout(() => setStep("analyzing"), 1000);

    uploadMutation.mutate({
      imageBase64: mode === "image" ? imageBase64! : undefined,
      imageType: mode === "image" ? imageType : undefined,
      textContent: mode === "text" ? textContent : undefined,
    });
  };

  const isLoading = step === "uploading" || step === "analyzing";

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-4 animate-fade-in">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-xl font-bold text-foreground">新建记录</h1>
        </div>

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
          <div
            className={`relative rounded-2xl border-2 border-dashed transition-all ${
              imagePreview ? "border-primary/30 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/50"
            }`}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            {/* 相册选图（不强制摄像头） */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {/* 直接拍照 */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />

            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full rounded-2xl object-contain max-h-80"
                />
                <button
                  onClick={() => { setImagePreview(null); setImageBase64(null); }}
                  className="absolute top-3 right-3 bg-black/50 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm hover:bg-black/70 transition-colors"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="w-full p-8 flex flex-col items-center gap-4 text-muted-foreground">
                <span className="text-5xl">🖼️</span>
                <div className="text-center">
                  <p className="font-medium text-foreground">选择图片来源</p>
                  <p className="text-sm mt-1 text-muted-foreground">支持手写笔记、印刷文字、便利贴等</p>
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
                  </button>
                </div>
              </div>
            )}
          </div>
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

        {/* Analysis Progress */}
        {isLoading && (
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin flex-shrink-0" />
              <div>
                <p className="font-medium text-primary text-sm">{STEP_LABELS[step]}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step === "uploading" ? "正在安全上传你的图片..." : "AI 正在识别文字、分析内容、生成回答..."}
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-primary/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-1000"
                style={{ width: step === "uploading" ? "30%" : "75%" }}
              />
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={isLoading || step === "done"}
          className={`w-full py-4 rounded-2xl font-semibold text-base transition-all ${
            isLoading || step === "done"
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20 active:scale-[0.98]"
          }`}
        >
          {step === "done" ? "✅ 分析完成，跳转中..." : isLoading ? "分析中..." : "🤖 AI 分析记录"}
        </button>

        {/* Tips */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3.5">
          <p className="text-xs text-amber-800 font-medium mb-1.5">💡 拍照小技巧</p>
          <ul className="text-xs text-amber-700 space-y-1">
            <li>• 确保光线充足，文字清晰可见</li>
            <li>• 支持手写、印刷、便利贴等各种形式</li>
            <li>• 一次可以拍多行内容，AI 会全部识别</li>
          </ul>
        </div>
      </div>
    </AppLayout>
  );
}
