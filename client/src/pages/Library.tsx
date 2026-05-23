import { useState } from "react";
import { Link, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS, STATUS_LABELS, STATUS_COLORS, CATEGORIES, formatRelativeTime } from "@/lib/entryUtils";
import type { EntryCategory, EntryStatus } from "@/lib/entryUtils";

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "pending_review", label: "待校正" },
  { value: "needs_deepdive", label: "待深挖" },
  { value: "archived", label: "已入库" },
  { value: "processing", label: "处理中" },
];

export default function Library() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const search = useSearch();
  const params = new URLSearchParams(search);
  const initStatus = params.get("status") || "all";
  const initCategory = params.get("category") as EntryCategory | null;

  const [selectedStatus, setSelectedStatus] = useState(initStatus);
  const [selectedCategory, setSelectedCategory] = useState<EntryCategory | undefined>(initCategory || undefined);

  const { data: entries, isLoading } = trpc.entries.list.useQuery(
    { status: selectedStatus as any, category: selectedCategory, limit: 50, offset: 0 },
    { enabled: isAuthenticated }
  );

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-4 animate-fade-in">
        <h1 className="text-xl font-bold text-foreground">知识库</h1>

        {/* Status filter */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setSelectedStatus(f.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${selectedStatus === f.value ? "bg-primary text-white border-primary shadow-sm" : "bg-white text-muted-foreground border-border hover:border-primary/40"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setSelectedCategory(undefined)}
            className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${!selectedCategory ? "bg-foreground text-white border-foreground" : "bg-white text-muted-foreground border-border hover:border-foreground/40"}`}>
            全部分类
          </button>
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setSelectedCategory(cat === selectedCategory ? undefined : cat)}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${selectedCategory === cat ? "bg-foreground text-white border-foreground" : "bg-white text-muted-foreground border-border hover:border-foreground/40"}`}>
              <span>{CATEGORY_ICONS[cat]}</span>
              <span>{CATEGORY_LABELS[cat]}</span>
            </button>
          ))}
        </div>

        {/* Entries */}
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-xl border border-border p-4 animate-pulse h-20" />)}
          </div>
        ) : entries && entries.length > 0 ? (
          <div className="space-y-2">
            {entries.map((entry) => {
              const cat = entry.category as EntryCategory;
              const status = entry.status as EntryStatus;
              const isActionable = status === "pending_review" || status === "needs_deepdive";
              return (
                <Link key={entry.id} href={isActionable ? `/review/${entry.id}` : `/entry/${entry.id}`}>
                  <div className={`bg-white rounded-xl border p-3.5 hover:shadow-sm transition-all cursor-pointer active:scale-[0.99] ${isActionable ? "border-amber-200 bg-amber-50/30" : "border-border hover:border-primary/20"}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5 flex-shrink-0">{CATEGORY_ICONS[cat]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[cat]}`}>{CATEGORY_LABELS[cat]}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>
                          {entry.githubSynced === 1 && <span className="text-[10px] text-green-600 font-medium">✓ GitHub</span>}
                          <span className="text-xs text-muted-foreground ml-auto">{formatRelativeTime(entry.createdAt)}</span>
                        </div>
                        <p className="text-sm font-semibold text-foreground truncate">{entry.title || entry.rawText?.slice(0, 40) || "处理中..."}</p>
                        {entry.summary && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{entry.summary}</p>}
                      </div>
                      {isActionable && <span className="text-amber-500 text-sm flex-shrink-0 mt-1">→</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">📭</div>
            <p className="text-muted-foreground text-sm">暂无内容</p>
            <Link href="/input">
              <button className="mt-4 text-primary text-sm hover:underline">去输入 →</button>
            </Link>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
