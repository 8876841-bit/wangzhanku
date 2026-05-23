import { describe, it, expect } from "vitest";
import { noteToMarkdown, getNoteFilePath } from "./githubService";
import type { NoteCategory } from "./aiService";

const mockNote = {
  id: 1,
  title: "测试笔记标题",
  rawText: "这是一条测试笔记的原始内容",
  imageUrl: null,
  category: "idea" as NoteCategory,
  summary: "这是 AI 生成的摘要",
  tags: ["测试", "灵感"],
  aiAnswer: null,
  researchSuggestions: ["延伸研究方向1", "延伸研究方向2"],
  createdAt: new Date("2025-01-15T10:00:00Z"),
};

describe("noteToMarkdown", () => {
  it("should generate valid markdown with frontmatter", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("---");
    expect(md).toContain("id: 1");
    expect(md).toContain('title: "测试笔记标题"');
    expect(md).toContain("category: idea");
    expect(md).toContain("category_label: 灵感");
  });

  it("should include raw text content", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("这是一条测试笔记的原始内容");
  });

  it("should include AI summary", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("AI 摘要");
    expect(md).toContain("这是 AI 生成的摘要");
  });

  it("should include research suggestions", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("延伸研究方向");
    expect(md).toContain("延伸研究方向1");
    expect(md).toContain("延伸研究方向2");
  });

  it("should include AI answer for question type", () => {
    const questionNote = {
      ...mockNote,
      category: "question" as NoteCategory,
      aiAnswer: "这是 AI 对问题的回答",
    };
    const md = noteToMarkdown(questionNote);
    expect(md).toContain("AI 回答");
    expect(md).toContain("这是 AI 对问题的回答");
  });

  it("should not include AI answer section when null", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).not.toContain("AI 回答");
  });
});

describe("getNoteFilePath", () => {
  it("should return correct path with category folder", () => {
    const path = getNoteFilePath(mockNote);
    expect(path).toContain("灵感/");
    expect(path).toContain("2025-01-15");
    expect(path).toContain(".md");
  });

  it("should sanitize special characters in title", () => {
    const noteWithSpecialChars = {
      ...mockNote,
      title: "测试/标题:特殊*字符",
    };
    const path = getNoteFilePath(noteWithSpecialChars);
    expect(path).not.toContain("/测试/");
    expect(path).not.toContain(":");
    expect(path).not.toContain("*");
  });

  it("should use note id when title is null", () => {
    const noteWithoutTitle = { ...mockNote, title: null };
    const path = getNoteFilePath(noteWithoutTitle);
    expect(path).toContain(`note-${mockNote.id}`);
  });

  it("should use correct category folder for different categories", () => {
    const categories: NoteCategory[] = ["idea", "question", "person", "skill", "todo", "experience", "quote", "other"];
    const expectedFolders = ["灵感", "问题", "人名/人物", "技能/知识点", "待办事项", "经验/感悟", "金句/引用", "其他"];

    categories.forEach((cat, i) => {
      const path = getNoteFilePath({ ...mockNote, category: cat });
      expect(path).toContain(expectedFolders[i]);
    });
  });
});
