import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";
import { formatDate } from "@/lib/noteUtils";

export default function Settings() {
  const { user, isAuthenticated, logout } = useAuth({ redirectOnUnauthenticated: true });
  const utils = trpc.useUtils();

  const { data: githubConfig } = trpc.notes.getGithubConfig.useQuery(undefined, {
    enabled: isAuthenticated,
  });

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

  const saveConfigMutation = trpc.notes.saveGithubConfig.useMutation({
    onSuccess: () => {
      toast.success("GitHub 配置已保存！");
      setToken("");
      utils.notes.getGithubConfig.invalidate();
    },
    onError: (err) => toast.error(`保存失败: ${err.message}`),
  });

  const syncAllMutation = trpc.notes.syncAllToGithub.useMutation({
    onSuccess: (result) => {
      toast.success(`同步完成！成功 ${result.successCount} 条，失败 ${result.failCount} 条`);
      utils.notes.stats.invalidate();
    },
    onError: (err) => toast.error(`同步失败: ${err.message}`),
  });

  const handleSaveConfig = () => {
    if (!token && !githubConfig?.hasToken) {
      toast.error("请输入 GitHub Token");
      return;
    }
    if (!repoOwner || !repoName) {
      toast.error("请填写仓库信息");
      return;
    }
    saveConfigMutation.mutate({
      githubToken: token || undefined, // undefined = keep existing token on server
      repoOwner,
      repoName,
      branch,
    });
  };

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-5 animate-fade-in">
        <h1 className="text-xl font-bold text-foreground">设置</h1>

        {/* User Info */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">账号信息</h2>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
              {user?.name?.[0] || "U"}
            </div>
            <div>
              <p className="font-semibold text-foreground">{user?.name || "用户"}</p>
              <p className="text-sm text-muted-foreground">{user?.email || "未设置邮箱"}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="mt-4 w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            退出登录
          </button>
        </div>

        {/* GitHub Config */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">GitHub 同步配置</h2>
            {githubConfig?.hasToken && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100 font-medium">
                ✓ 已配置
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* Token */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                GitHub Personal Access Token
                {githubConfig?.hasToken && <span className="text-green-600 ml-1">(已保存，重新输入即可更新)</span>}
              </label>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={githubConfig?.hasToken ? "留空则保持原有 Token" : "ghp_xxxxxxxxxxxx"}
                  className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs"
                >
                  {showToken ? "隐藏" : "显示"}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                需要 <code className="bg-muted px-1 rounded">repo</code> 权限。
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=SecondBrain"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline ml-1"
                >
                  点击创建 Token →
                </a>
              </p>
            </div>

            {/* Repo Owner */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">GitHub 用户名 / 组织名</label>
              <input
                type="text"
                value={repoOwner}
                onChange={(e) => setRepoOwner(e.target.value)}
                placeholder="例如：your-username"
                className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Repo Name */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">仓库名称</label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="例如：my-second-brain"
                className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Branch */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">分支</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                className="w-full px-3 py-2.5 bg-muted/50 border border-border rounded-xl text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10 transition-all"
              />
            </div>

            {/* Preview */}
            {repoOwner && repoName && (
              <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground font-mono">
                笔记将存储到：github.com/{repoOwner}/{repoName}/tree/{branch}/
              </div>
            )}

            <button
              onClick={handleSaveConfig}
              disabled={saveConfigMutation.isPending}
              className="w-full py-3 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saveConfigMutation.isPending ? "验证并保存中..." : "保存 GitHub 配置"}
            </button>
          </div>

          {/* Last Sync */}
          {githubConfig?.lastSyncAt && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              上次同步：{formatDate(githubConfig.lastSyncAt)}
            </p>
          )}
        </div>

        {/* Sync Actions */}
        {githubConfig?.hasToken && (
          <div className="bg-white rounded-2xl border border-border p-5">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide mb-4">同步操作</h2>
            <button
              onClick={() => syncAllMutation.mutate()}
              disabled={syncAllMutation.isPending}
              className="w-full py-3 rounded-xl border border-gray-900 text-gray-900 text-sm font-medium hover:bg-gray-900 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {syncAllMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  同步中...
                </>
              ) : (
                "⬆ 一键同步所有未同步笔记到 GitHub"
              )}
            </button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              笔记将按分类存放在不同文件夹，格式为 Markdown，可直接用 Obsidian 打开
            </p>
          </div>
        )}

        {/* File Structure Preview */}
        <div className="bg-muted/50 rounded-2xl border border-border p-4">
          <h3 className="text-xs font-semibold text-muted-foreground mb-3">GitHub 仓库文件结构预览</h3>
          <div className="font-mono text-xs text-muted-foreground space-y-1 leading-relaxed">
            <div>📁 your-repo/</div>
            <div className="ml-4">📁 灵感/</div>
            <div className="ml-8">📄 2025-01-01-突然的想法.md</div>
            <div className="ml-4">📁 问题/</div>
            <div className="ml-8">📄 2025-01-02-为什么要学习.md</div>
            <div className="ml-4">📁 技能/</div>
            <div className="ml-8">📄 2025-01-03-卡片盒笔记法.md</div>
            <div className="ml-4">📁 待办/</div>
            <div className="ml-4">📁 人名/</div>
            <div className="ml-4">📁 经验/</div>
            <div className="ml-4">...</div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
