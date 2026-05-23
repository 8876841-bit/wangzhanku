export type EntryCategory =
  | "Concept" | "Person" | "Case" | "Question" | "Insight"
  | "Idea" | "Skill" | "Action" | "Model" | "Trigger" | "Positioning";

export type EntryStatus =
  | "processing" | "pending_review" | "confirmed" | "archived"
  | "needs_deepdive" | "duplicate" | "upgradeable" | "model"
  | "parked" | "discarded";

export const CATEGORIES: EntryCategory[] = [
  "Concept", "Person", "Case", "Question", "Insight",
  "Idea", "Skill", "Action", "Model", "Trigger", "Positioning"
];

export const CATEGORY_LABELS: Record<EntryCategory, string> = {
  Concept: "概念", Person: "人物", Case: "案例", Question: "问题",
  Insight: "洞察", Idea: "想法", Skill: "技能", Action: "行动",
  Model: "认知模型", Trigger: "触发点", Positioning: "自我定位",
};

export const CATEGORY_ICONS: Record<EntryCategory, string> = {
  Concept: "🔷", Person: "👤", Case: "📋", Question: "❓",
  Insight: "✨", Idea: "💡", Skill: "🔧", Action: "⚡",
  Model: "🧩", Trigger: "🎯", Positioning: "🧭",
};

export const CATEGORY_COLORS: Record<EntryCategory, string> = {
  Concept:     "bg-blue-50 border-blue-200 text-blue-700",
  Person:      "bg-green-50 border-green-200 text-green-700",
  Case:        "bg-orange-50 border-orange-200 text-orange-700",
  Question:    "bg-purple-50 border-purple-200 text-purple-700",
  Insight:     "bg-yellow-50 border-yellow-200 text-yellow-700",
  Idea:        "bg-pink-50 border-pink-200 text-pink-700",
  Skill:       "bg-cyan-50 border-cyan-200 text-cyan-700",
  Action:      "bg-red-50 border-red-200 text-red-700",
  Model:       "bg-indigo-50 border-indigo-200 text-indigo-700",
  Trigger:     "bg-teal-50 border-teal-200 text-teal-700",
  Positioning: "bg-violet-50 border-violet-200 text-violet-700",
};

export const STATUS_LABELS: Record<EntryStatus, string> = {
  processing:     "处理中",
  pending_review: "待校正",
  confirmed:      "已确认",
  archived:       "已入库",
  needs_deepdive: "待深挖",
  duplicate:      "重复",
  upgradeable:    "可升级",
  model:          "已建模",
  parked:         "暂存",
  discarded:      "放弃",
};

export const STATUS_COLORS: Record<EntryStatus, string> = {
  processing:     "bg-gray-100 text-gray-600",
  pending_review: "bg-amber-100 text-amber-700",
  confirmed:      "bg-blue-100 text-blue-700",
  archived:       "bg-green-100 text-green-700",
  needs_deepdive: "bg-purple-100 text-purple-700",
  duplicate:      "bg-orange-100 text-orange-700",
  upgradeable:    "bg-indigo-100 text-indigo-700",
  model:          "bg-teal-100 text-teal-700",
  parked:         "bg-gray-100 text-gray-500",
  discarded:      "bg-red-50 text-red-400",
};

export const NEXT_ACTION_LABELS: Record<string, string> = {
  parked:         "暂存",
  research:       "查资料",
  find_case:      "找案例",
  compare:        "做对比",
  experiment:     "做实验",
  create_content: "写成内容",
  upgrade_model:  "升级模型",
  deepdive:       "深入研究",
};

export const NEXT_ACTION_ICONS: Record<string, string> = {
  parked:         "⏸️",
  research:       "🔍",
  find_case:      "📋",
  compare:        "⚖️",
  experiment:     "🧪",
  create_content: "✍️",
  upgrade_model:  "🧩",
  deepdive:       "🔭",
};

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
