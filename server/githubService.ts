import type { EntryCategory } from "../drizzle/schema";
import { CATEGORY_LABELS } from "./aiService";

interface GithubConfig {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  branch: string;
}

interface NoteForSync {
  id: number;
  title: string | null;
  rawText: string | null;
  imageUrl: string | null;
  category: EntryCategory;
  summary: string | null;
  tags: string[] | null;
  aiAnswer: string | null;
  researchSuggestions: string[] | null;
  createdAt: Date;
  userCorrection?: string | null;
  aiInterpretation?: string | null;
  finalInterpretation?: string | null;
  nextActionType?: string | null;
  nextAction?: string | null;
  clusterName?: string;
  // New fields
  processingMode?: string | null;
  attentionPoint?: string | null;
  sourceType?: string | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  densityLevel?: string | null;
  densityScore?: number | null;
  densityReason?: string | null;
  coreTheme?: string | null;
  connectionInsight?: string | null;
}

// ── GitHub folder mapping (00-09 directory structure) ──────────────────────
// Aligned with user's ai-brain-system repo structure
const CATEGORY_TO_FOLDER: Record<EntryCategory, string> = {
  Concept:     "01-concepts",
  Person:      "02-people",
  Case:        "03-cases",
  Question:    "04-questions",
  Insight:     "05-insights",
  Idea:        "06-ideas",
  Skill:       "07-skills",
  Action:      "08-actions",
  Model:       "09-models",
  Trigger:     "01-concepts",    // Triggers are concept-adjacent
  Positioning: "05-insights",    // Positioning is insight-adjacent
};

export function noteToMarkdown(note: NoteForSync): string {
  const folder = CATEGORY_TO_FOLDER[note.category] || "01-concepts";
  const tags = note.tags || [];
  const suggestions = note.researchSuggestions || [];
  const date = note.createdAt.toISOString().split("T")[0];

  const densityStr = note.densityLevel
    ? `${note.densityLevel}${note.densityScore != null ? ` (${note.densityScore}/10)` : ""}`
    : "";

  let md = `---
id: ${note.id}
category: ${note.category}
folder: ${folder}
tags: [${tags.map((t) => `"${t}"`).join(", ")}]
created: ${date}
`;
  if (note.processingMode) md += `processing_mode: ${note.processingMode}\n`;
  if (note.sourceType) md += `source_type: ${note.sourceType}\n`;
  if (note.sourceName) md += `source_name: ${note.sourceName}\n`;
  if (note.sourceUrl) md += `source_url: ${note.sourceUrl}\n`;
  if (densityStr) md += `density: ${densityStr}\n`;
  md += `---\n\n`;

  md += `# ${note.title || "未命名"}\n\n`;
  md += `> **分类**：${CATEGORY_LABELS[note.category]}`;
  if (tags.length > 0) md += `　**标签**：${tags.join(" · ")}`;
  if (densityStr) md += `　**信息密度**：${densityStr}`;
  md += `\n\n`;

  if (note.attentionPoint) {
    md += `## 为什么存它\n\n${note.attentionPoint}\n\n`;
  }

  if (note.aiInterpretation) {
    md += `## AI 初次理解\n\n${note.aiInterpretation}\n\n`;
  }

  if (note.userCorrection) {
    md += `## 用户校正\n\n${note.userCorrection}\n\n`;
  }

  if (note.finalInterpretation) {
    md += `## 最终理解\n\n${note.finalInterpretation}\n\n`;
  } else if (note.summary) {
    md += `## 核心提炼\n\n${note.summary}\n\n`;
  }

  if (note.coreTheme) {
    md += `## 核心命题\n\n${note.coreTheme}\n\n`;
  }

  if (note.connectionInsight) {
    md += `## 认知联系\n\n${note.connectionInsight}\n\n`;
  }

  if (note.rawText) {
    md += `## 原始记录\n\n${note.rawText}\n\n`;
  }

  if (note.imageUrl) {
    md += `## 原始图片\n\n![](${note.imageUrl})\n\n`;
  }

  if (note.aiAnswer) {
    const displayAnswer = note.aiAnswer.includes("__ITEMS__")
      ? note.aiAnswer.split("__ITEMS__")[0].trim()
      : note.aiAnswer;
    if (displayAnswer) md += `## AI 回答\n\n${displayAnswer}\n\n`;
  }

  if (note.nextAction) {
    md += `## 下一步\n\n**类型**：${note.nextActionType || ""}　**行动**：${note.nextAction}\n\n`;
  }

  if (note.densityReason) {
    md += `## 信息密度说明\n\n${note.densityReason}\n\n`;
  }

  if (suggestions.length > 0) {
    md += `## 延伸研究\n\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n`;
  }

  md += `---\n*认知处理系统 · ${date}*\n`;
  return md;
}

export function getNoteFilePath(note: NoteForSync): string {
  const folder = CATEGORY_TO_FOLDER[note.category] || "01-concepts";
  const date = note.createdAt.toISOString().split("T")[0];
  const safeTitle = (note.title || `entry-${note.id}`)
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^\w\-\u4e00-\u9fff]/g, "")
    .slice(0, 50);

  if (note.clusterName) {
    const safeCluster = note.clusterName
      .replace(/[/\\:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/[^\w\-\u4e00-\u9fff]/g, "")
      .slice(0, 40);
    return `${folder}/${safeCluster}/${date}-${safeTitle}.md`;
  }
  return `${folder}/${date}-${safeTitle}.md`;
}

export async function syncNoteToGithub(
  config: GithubConfig,
  note: NoteForSync
): Promise<{ success: boolean; path: string; url: string; error?: string }> {
  const filePath = getNoteFilePath(note);
  const content = noteToMarkdown(note);
  return pushToGithub(config, filePath, content, `📥 入库: ${note.title || "未命名"}`);
}

export async function syncModelToGithub(
  config: GithubConfig,
  modelName: string,
  modelContent: string
): Promise<{ success: boolean; path: string; error?: string }> {
  const safeTitle = modelName.replace(/[/\\:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 50);
  const filePath = `09-models/${safeTitle}.md`;
  const result = await pushToGithub(config, filePath, modelContent, `🧠 认知模型: ${modelName}`);
  return { success: result.success, path: result.path, error: result.error };
}

async function pushToGithub(
  config: GithubConfig,
  filePath: string,
  content: string,
  commitMessage: string
): Promise<{ success: boolean; path: string; url: string; error?: string }> {
  // Decode token if it looks encrypted (base64 encoded AES)
  let token = config.githubToken;
  if (token.startsWith("ENC:")) {
    try {
      const { decryptToken } = await import("./cryptoService");
      token = decryptToken(token.slice(4));
    } catch {
      return { success: false, path: filePath, url: "", error: "Token 解密失败" };
    }
  }

  const apiBase = `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  let sha: string | undefined;
  try {
    const checkRes = await fetch(`${apiBase}?ref=${config.branch}`, { headers });
    if (checkRes.ok) {
      const existing = await checkRes.json() as { sha: string };
      sha = existing.sha;
    }
  } catch {}

  const body: Record<string, string> = {
    message: commitMessage,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: config.branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiBase, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const errText = await res.text();
    return { success: false, path: filePath, url: "", error: `GitHub API error: ${res.status} ${errText}` };
  }

  const data = await res.json() as { content: { html_url: string } };
  const url = data.content?.html_url || `https://github.com/${config.repoOwner}/${config.repoName}/blob/${config.branch}/${filePath}`;
  return { success: true, path: filePath, url };
}

export async function validateGithubConfig(config: GithubConfig): Promise<{ valid: boolean; error?: string }> {
  let token = config.githubToken;
  if (token.startsWith("ENC:")) {
    try {
      const { decryptToken } = await import("./cryptoService");
      token = decryptToken(token.slice(4));
    } catch {
      return { valid: false, error: "Token 解密失败，请重新设置" };
    }
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
    );
    if (res.status === 401) return { valid: false, error: "GitHub Token 无效或已过期" };
    if (res.status === 404) return { valid: false, error: "仓库不存在或无访问权限" };
    if (!res.ok) return { valid: false, error: `GitHub API 错误: ${res.status}` };
    return { valid: true };
  } catch (e) {
    return { valid: false, error: `网络错误: ${String(e)}` };
  }
}
