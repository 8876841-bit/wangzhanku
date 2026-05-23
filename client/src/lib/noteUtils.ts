export type NoteCategory =
  | "idea"
  | "question"
  | "person"
  | "skill"
  | "todo"
  | "experience"
  | "quote"
  | "other";

export const CATEGORY_LABELS: Record<NoteCategory, string> = {
  idea: "灵感",
  question: "问题",
  person: "人名",
  skill: "技能",
  todo: "待办",
  experience: "经验",
  quote: "金句",
  other: "其他",
};

export const CATEGORY_ICONS: Record<NoteCategory, string> = {
  idea: "💡",
  question: "❓",
  person: "👤",
  skill: "🔧",
  todo: "✅",
  experience: "📖",
  quote: "💬",
  other: "📌",
};

export const CATEGORY_COLORS: Record<NoteCategory, string> = {
  idea: "badge-idea",
  question: "badge-question",
  person: "badge-person",
  skill: "badge-skill",
  todo: "badge-todo",
  experience: "badge-experience",
  quote: "badge-quote",
  other: "badge-other",
};

export function getCategoryBadgeClass(category: string): string {
  return CATEGORY_COLORS[category as NoteCategory] || "badge-other";
}

export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category as NoteCategory] || category;
}

export function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category as NoteCategory] || "📌";
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

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
  return formatDate(d);
}

export const ALL_CATEGORIES: NoteCategory[] = [
  "idea", "question", "person", "skill", "todo", "experience", "quote", "other"
];
