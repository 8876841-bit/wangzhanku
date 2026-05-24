import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";

export default function Settings() {
  const { user, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();

  const { data: githubConfig } = trpc.entries.getGithubConfig.useQuery(undefined, { enabled: isAuthenticated });

  const [token, setToken] = useState("");
  const [repoOwner, setRepoOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [branch, setBranch] = useState("main");
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (githubConfig) {
      setRepoOwner(githubConfig.repoOwner || "");
      setRepoName(githubConfig.repoName || "");
      setBranch(githubConfig.branch || "main");
    }
  }, [githubConfig]);

  const saveConfigMutation = trpc.entries.saveGithubConfig.useMutation({
    onSuccess: () => { toast.success("GitHub 配置已保存！"); setToken(""); utils.entries.getGithubConfig.invalidate(); },
    onError: (err) => toast.error(`保存失败: ${err.message}`),
  });

  const handleSave = () => {
    if (!token && !githubConfig?.hasToken) { toast.error("请输入 GitHub Token"); return; }
    if (!repoOwner || !repoName) { toast.error("请填写仓库信息"); return; }
    saveConfigMutation.mutate({ githubToken: token || undefined, repoOwner, repoName, branch });
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-5 animate-fade-in">
        <h1 className="text-xl font-bold text-foreground">设置</h1>

        {/* User */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">账号</h2>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">{user?.name?.[0] || "U"}</div>
            <div><p className="font-semibold text-foreground">{user?.name || "用户"}</p><p className="text-sm text-muted-foreground">{user?.email || ""}</p></div>
          </div>
          <button onClick={logout} className="mt-4 w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">退出登录</button>
        </div>

        {/* GitHub */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">GitHub 入库配置</h2>
            {githubConfig?.hasToken ? <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100 font-medium">✓ 已配置</span> : null}
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">GitHub Personal Access Token</label>
              <div className="relative">
                <input type={showToken ? "text" : "password"} value={token} onChange={(e) => setToken(e.target.value)}
                  placeholder={githubConfig?.hasToken ? "留空保持原有 Token" : "ghp_xxxxxxxxxxxx"}
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-all pr-10 font-mono" />
                <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{showToken ? "隐藏" : "显示"}</button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">需要 <code className="bg-muted px-1 rounded">repo</code> 权限。<a href="https://github.com/settings/tokens/new?scopes=repo&description=SecondBrain" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline ml-1">点击创建 →</a></p>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">GitHub 用户名</label>
              <input type="text" value={repoOwner} onChange={(e) => setRepoOwner(e.target.value)} placeholder="your-username" className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-all" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">仓库名称</label>
              <input type="text" value={repoName} onChange={(e) => setRepoName(e.target.value)} placeholder="my-second-brain" className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-all" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">分支</label>
              <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="main" className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 transition-all" />
            </div>
            {repoOwner && repoName && (
              <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground font-mono">
                入库路径：github.com/{repoOwner}/{repoName}/tree/{branch}/[Category]/
              </div>
            )}
            <button onClick={handleSave} disabled={saveConfigMutation.isPending} className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
              {saveConfigMutation.isPending ? "验证并保存中..." : "保存 GitHub 配置"}
            </button>
          </div>
        </div>

        {/* GitHub folder structure */}
        <div className="bg-muted/50 rounded-2xl border border-border p-4">
          <h3 className="text-xs font-semibold text-muted-foreground mb-3">GitHub 入库结构</h3>
          <div className="font-mono text-xs text-muted-foreground space-y-1 leading-relaxed">
            {["01-concepts", "02-people", "03-cases", "04-questions", "05-insights", "06-ideas", "07-skills", "08-actions", "09-models"].map((f) => (
              <div key={f} className="ml-4">📁 {f}</div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
