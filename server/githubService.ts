import { CATEGORY_LABELS, type NoteCategory } from "./aiService";

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
  category: NoteCategory;
  summary: string | null;
  tags: string[] | null;
  aiAnswer: string | null;
  researchSuggestions: string[] | null;
  createdAt: Date;
  topicFolder?: string; // optional topic folder for GitHub path
}

/**
 * Convert a note to Markdown format for GitHub storage
 */
export function noteToMarkdown(note: NoteForSync): string {
  const categoryLabel = CATEGORY_LABELS[note.category] || note.category;
  const tags = note.tags || [];
  const suggestions = note.researchSuggestions || [];
  const date = note.createdAt.toISOString().split("T")[0];

  let md = `---
id: ${note.id}
title: "${note.title || "未命名"}"
category: ${note.category}
category_label: ${categoryLabel}
tags: [${tags.map((t) => `"${t}"`).join(", ")}]
created: ${date}
---

# ${note.title || "未命名"}

> **分类**：${categoryLabel}${tags.length > 0 ? `　**标签**：${tags.join(" · ")}` : ""}

## 原始记录

${note.rawText || "（无文字内容）"}
`;

  if (note.imageUrl) {
    md += `\n## 原始图片\n\n![笔记图片](${note.imageUrl})\n`;
  }

  if (note.summary) {
    md += `\n## AI 摘要\n\n${note.summary}\n`;
  }

  if (note.aiAnswer) {
    md += `\n## AI 回答\n\n${note.aiAnswer}\n`;
  }

  if (suggestions.length > 0) {
    md += `\n## 延伸研究方向\n\n`;
    suggestions.forEach((s, i) => {
      md += `${i + 1}. ${s}\n`;
    });
  }

  md += `\n---\n*由第二大脑知识管理系统自动生成 · ${new Date().toLocaleString("zh-CN")}*\n`;

  return md;
}

/**
 * Get the file path for a note in the GitHub repo
 */
export function getNoteFilePath(note: NoteForSync): string {
  const categoryLabel = CATEGORY_LABELS[note.category] || "其他";
  const date = note.createdAt.toISOString().split("T")[0];
  const safeTitle = (note.title || `note-${note.id}`)
    .replace(/[\/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 50);
  // If note belongs to a topic, nest under topic folder
  if (note.topicFolder) {
    const safeFolder = note.topicFolder.replace(/[\/\\:*?"<>|]/g, "-");
    return `主题/${safeFolder}/${date}-${safeTitle}.md`;
  }
  return `${categoryLabel}/${date}-${safeTitle}.md`;
}

/**
 * Push a note to GitHub as a Markdown file
 */
export async function syncNoteToGithub(
  config: GithubConfig,
  note: NoteForSync
): Promise<{ success: boolean; path: string; url: string; error?: string }> {
  const filePath = getNoteFilePath(note);
  const content = noteToMarkdown(note);
  const base64Content = Buffer.from(content, "utf-8").toString("base64");

  const apiBase = `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/contents/${filePath}`;

  const headers = {
    Authorization: `Bearer ${config.githubToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };

  // Check if file already exists (to get SHA for update)
  let sha: string | undefined;
  try {
    const checkRes = await fetch(`${apiBase}?ref=${config.branch}`, { headers });
    if (checkRes.ok) {
      const existing = await checkRes.json() as { sha: string };
      sha = existing.sha;
    }
  } catch {
    // File doesn't exist, that's fine
  }

  const body: Record<string, string> = {
    message: `📝 ${sha ? "更新" : "新增"}笔记: ${note.title || "未命名"}`,
    content: base64Content,
    branch: config.branch,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiBase, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { success: false, path: filePath, url: "", error: `GitHub API error: ${res.status} ${errText}` };
  }

  const data = await res.json() as { content: { html_url: string } };
  const url = data.content?.html_url || `https://github.com/${config.repoOwner}/${config.repoName}/blob/${config.branch}/${filePath}`;

  return { success: true, path: filePath, url };
}

/**
 * Validate GitHub token and repo access
 */
export async function validateGithubConfig(config: GithubConfig): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${config.repoOwner}/${config.repoName}`,
      {
        headers: {
          Authorization: `Bearer ${config.githubToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (res.status === 401) return { valid: false, error: "GitHub Token 无效或已过期" };
    if (res.status === 404) return { valid: false, error: "仓库不存在或无访问权限" };
    if (!res.ok) return { valid: false, error: `GitHub API 错误: ${res.status}` };

    return { valid: true };
  } catch (e) {
    return { valid: false, error: `网络错误: ${String(e)}` };
  }
}
