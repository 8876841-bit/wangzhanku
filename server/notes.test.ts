import { describe, it, expect } from "vitest";
import { noteToMarkdown, getNoteFilePath } from "./githubService";
import type { EntryCategory } from "../drizzle/schema";

const mockNote = {
  id: 1,
  title: "测试笔记标题",
  rawText: "这是一条测试笔记的原始内容",
  imageUrl: null,
  category: "Idea" as EntryCategory,
  summary: "这是 AI 生成的摘要",
  tags: ["测试", "灵感"],
  aiAnswer: null,
  researchSuggestions: ["延伸研究方向1", "延伸研究方向2"],
  createdAt: new Date("2025-01-15T10:00:00Z"),
  aiInterpretation: "AI 理解这是一个想法",
  userCorrection: null,
  finalInterpretation: null,
  nextActionType: "research",
  nextAction: "查找相关资料",
};

describe("noteToMarkdown", () => {
  it("should generate valid markdown with frontmatter", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("---");
    expect(md).toContain("id: 1");
    expect(md).toContain("category: Idea");
    expect(md).toContain("folder: 06_Ideas");
  });

  it("should include raw text content", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("这是一条测试笔记的原始内容");
  });

  it("should include AI summary as core extraction", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("核心提炼");
    expect(md).toContain("这是 AI 生成的摘要");
  });

  it("should include AI interpretation", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("AI 初次理解");
    expect(md).toContain("AI 理解这是一个想法");
  });

  it("should include research suggestions", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("延伸研究");
    expect(md).toContain("延伸研究方向1");
  });

  it("should include next action", () => {
    const md = noteToMarkdown(mockNote);
    expect(md).toContain("下一步");
    expect(md).toContain("查找相关资料");
  });

  it("should include AI answer for question type", () => {
    const questionNote = {
      ...mockNote,
      category: "Question" as EntryCategory,
      aiAnswer: "这是 AI 对问题的回答",
    };
    const md = noteToMarkdown(questionNote);
    expect(md).toContain("AI 回答");
    expect(md).toContain("这是 AI 对问题的回答");
  });
});

describe("getNoteFilePath", () => {
  it("should return correct path with numbered folder", () => {
    const path = getNoteFilePath(mockNote);
    expect(path).toContain("06_Ideas/");
    expect(path).toContain("2025-01-15");
    expect(path).toContain(".md");
  });

  it("should sanitize special characters in title", () => {
    const noteWithSpecialChars = {
      ...mockNote,
      title: "测试/标题:特殊*字符",
    };
    const path = getNoteFilePath(noteWithSpecialChars);
    expect(path).not.toContain(":");
    expect(path).not.toContain("*");
  });

  it("should use entry id when title is null", () => {
    const noteWithoutTitle = { ...mockNote, title: null };
    const path = getNoteFilePath(noteWithoutTitle);
    expect(path).toContain(`entry-${mockNote.id}`);
  });

  it("should use correct numbered folder for different categories", () => {
    const testCases: [EntryCategory, string][] = [
      ["Concept",     "01_Concepts"],
      ["Person",      "02_People"],
      ["Case",        "03_Cases"],
      ["Question",    "04_Questions"],
      ["Insight",     "05_Insights"],
      ["Idea",        "06_Ideas"],
      ["Skill",       "07_Skills"],
      ["Action",      "08_Actions"],
      ["Model",       "09_Models"],
    ];

    testCases.forEach(([cat, expectedFolder]) => {
      const path = getNoteFilePath({ ...mockNote, category: cat });
      expect(path).toContain(expectedFolder);
    });
  });

  it("should nest under cluster folder when clusterName is provided", () => {
    const noteWithCluster = { ...mockNote, clusterName: "AI认知路径" };
    const path = getNoteFilePath(noteWithCluster);
    expect(path).toContain("06_Ideas/AI认知路径/");
  });
});
