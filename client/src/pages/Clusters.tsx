import { useState } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { toast } from "sonner";

export default function Clusters() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const search = useSearch();
  const params = new URLSearchParams(search);
  const filterStatus = params.get("status");

  const [expandedModel, setExpandedModel] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: clusters, isLoading } = trpc.entries.listClusters.useQuery(undefined, { enabled: isAuthenticated });

  const upgradeMutation = trpc.entries.upgradeToModel.useMutation({
    onSuccess: (result) => {
      toast.success("🧠 认知模型已生成并推送 GitHub！");
      utils.entries.listClusters.invalidate();
    },
    onError: (err) => toast.error(`升级失败: ${err.message}`),
  });

  const filtered = filterStatus
    ? clusters?.filter((c) => c.status === filterStatus)
    : clusters;

  const upgradeableCount = clusters?.filter((c) => c.status === "upgradeable").length || 0;
  const upgradedCount = clusters?.filter((c) => c.status === "upgraded").length || 0;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-foreground">知识簇 & 认知模型</h1>
          <p className="text-xs text-muted-foreground mt-0.5">同主题内容积累 3 条后可升级为认知模型</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-indigo-700">{upgradeableCount}</div>
            <div className="text-xs text-indigo-600 mt-0.5">可升级为模型</div>
          </div>
          <div className="bg-teal-50 border border-teal-100 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-teal-700">{upgradedCount}</div>
            <div className="text-xs text-teal-600 mt-0.5">已建立模型</div>
          </div>
        </div>

        {/* Clusters list */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-xl border border-border p-4 animate-pulse h-20" />)}
          </div>
        ) : filtered && filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map((cluster) => {
              const isUpgradeable = cluster.status === "upgradeable";
              const isUpgraded = cluster.status === "upgraded";
              const isExpanded = expandedModel === cluster.id;

              return (
                <div key={cluster.id} className={`bg-white rounded-2xl border overflow-hidden ${isUpgradeable ? "border-indigo-200" : isUpgraded ? "border-teal-200" : "border-border"}`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isUpgraded ? "bg-teal-100 text-teal-700" : isUpgradeable ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                            {isUpgraded ? "🧠 已建模" : isUpgradeable ? "⬆ 可升级" : "📥 积累中"}
                          </span>
                          <span className="text-xs text-muted-foreground">{cluster.entryCount} 条</span>
                        </div>
                        <h3 className="font-semibold text-foreground">{cluster.name}</h3>
                        {cluster.description && <p className="text-xs text-muted-foreground mt-0.5">{cluster.description}</p>}
                      </div>

                      {isUpgradeable && (
                        <button
                          onClick={() => upgradeMutation.mutate({ clusterId: cluster.id })}
                          disabled={upgradeMutation.isPending}
                          className="flex-shrink-0 bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {upgradeMutation.isPending ? "生成中..." : "升级为模型"}
                        </button>
                      )}

                      {isUpgraded && cluster.modelContent && (
                        <button
                          onClick={() => setExpandedModel(isExpanded ? null : cluster.id)}
                          className="flex-shrink-0 text-teal-600 text-xs font-medium px-3 py-2 rounded-xl border border-teal-200 hover:bg-teal-50 transition-colors"
                        >
                          {isExpanded ? "收起" : "查看模型"}
                        </button>
                      )}
                    </div>

                    {/* Progress bar */}
                    {!isUpgraded && (
                      <div className="mt-3">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>积累进度</span>
                          <span>{cluster.entryCount}/3 条</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isUpgradeable ? "bg-indigo-500" : "bg-primary"}`}
                            style={{ width: `${Math.min((cluster.entryCount / 3) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Model content */}
                  {isExpanded && cluster.modelContent && (
                    <div className="border-t border-teal-100 p-4 bg-teal-50/30">
                      <p className="text-xs font-semibold text-teal-700 mb-2">🧠 认知模型内容</p>
                      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                        {cluster.modelContent}
                      </div>
                      {cluster.githubPath && (
                        <p className="text-xs text-muted-foreground mt-3 font-mono">📁 {cluster.githubPath}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🧩</div>
            <p className="text-muted-foreground text-sm">还没有知识簇</p>
            <p className="text-xs text-muted-foreground mt-1">在校正时把内容归入同一个知识簇，积累 3 条后可升级为认知模型</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
