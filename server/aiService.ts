import OpenAI from "openai";
import type { EntryCategory } from "../drizzle/schema";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Category definitions ─────────────────────────────────────────────────────
export const CATEGORY_LABELS: Record<EntryCategory, string> = {
  Concept:     "概念",
  Person:      "人物",
  Case:        "案例",
  Question:    "问题",
  Insight:     "洞察",
  Idea:        "想法",
  Skill:       "技能",
  Action:      "行动",
  Model:       "认知模型",
  Trigger:     "触发点",
  Positioning: "自我定位",
};

export const CATEGORY_DESCRIPTIONS: Record<EntryCategory, string> = {
  Concept:     "概念、定义、术语、知识点",
  Person:      "人物、人名、值得研究的人",
  Case:        "案例、事件、具体例子、故事",
  Question:    "问题、疑问、未解之谜、想搞清楚的事",
  Insight:     "洞察、规律、发现、深层理解",
  Idea:        "想法、创意、灵感、突然冒出的念头",
  Skill:       "技能、方法、操作步骤、可学习的能力",
  Action:      "待办、要做的事、行动项",
  Model:       "认知模型、框架、可复用的思维结构",
  Trigger:     "触发点、引发思考的刺激源、让你产生联想的东西",
  Positioning: "自我定位、关于我是谁/我要做什么的判断",
};

// ── Analysis result types ────────────────────────────────────────────────────
export interface NoteItem {
  keyword: string;
  type: string;
  deepAnswer: string;
  actionable: string[];
  furtherQuestions: string[];
}

export const NEXT_ACTION_TYPES = [
  "parked",          // 暂存，不处理
  "research",        // 查资料
  "find_case",       // 找案例
  "compare",         // 做对比
  "experiment",      // 做实验
  "create_content",  // 写成内容
  "upgrade_model",   // 升级模型
  "deepdive",        // 深入研究
] as const;
export type NextActionType = typeof NEXT_ACTION_TYPES[number];

export const NEXT_ACTION_LABELS: Record<NextActionType, string> = {
  parked: "暂存",
  research: "查资料",
  find_case: "找案例",
  compare: "做对比",
  experiment: "做实验",
  create_content: "写成内容",
  upgrade_model: "升级模型",
  deepdive: "深入研究",
};

export interface AIAnalysisResult {
  rawText: string;
  category: EntryCategory;
  title: string;
  summary: string;
  tags: string[];
  aiAnswer: string | null;
  researchSuggestions: string[];
  relatedKeywords: string[];
  noteItems: NoteItem[];
  coreTheme: string;
  connectionInsight: string;
  needsDeepDive: boolean;
  deepDiveReason: string;
  suggestedClusterName: string;
  // Next action
  nextActionType: NextActionType;
  nextAction: string;          // one concrete minimal action
  // Three-layer interpretation
  aiInterpretation: string;    // what AI understood from raw input
}

// ── System prompt ────────────────────────────────────────────────────────────
function buildSystemPrompt(existingTitles: string[] = []): string {
  const categoryList = Object.entries(CATEGORY_DESCRIPTIONS)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");

  const existingContext = existingTitles.length > 0
    ? `\n\n用户已有的内容标题（用于重复检测）：\n${existingTitles.slice(0, 30).join("、")}`
    : "";

  return `你是一个认知处理系统的核心引擎，不是笔记整理工具。

你的任务是把用户的原始输入（图片/文字）处理成结构化的认知条目。

## 分类体系（11类，必须严格选择其中一类）
${categoryList}

## 处理原则
1. **不要做笔记整理**，要做**认知提炼**
2. 每条内容只属于一个分类，选最本质的那个
3. 如果内容包含多个独立条目，在 noteItems 中分别列出
4. 对于 Question 类型，必须给出有深度的回答
5. 对于 Person 类型，要分析这个人的路径模式，不只是介绍背景
6. 对于 Trigger 类型，要挖掘触发了什么思考，指向什么更深的问题
7. 对于 Positioning 类型，要联系用户当前处境给出判断
8. needsDeepDive 标记：如果这条内容值得用户花时间深入研究，设为 true${existingContext}

请严格按以下 JSON 格式返回（不要有任何额外文字）：
{
  "rawText": "识别到的原始文字内容",
  "aiInterpretation": "AI 对这条内容的初次理解（50字以内，说清楚你理解到的是什么）",
  "category": "11类之一",
  "title": "简洁有力的标题（15字以内，不要平淡描述，要有洞察力）",
  "summary": "核心提炼（80字以内，说出本质，不是复述）",
  "tags": ["标签1", "标签2", "标签3"],
  "coreTheme": "这条内容背后真正的命题（40字以内）",
  "connectionInsight": "与用户认知体系的潜在联系（60字以内）",
  "noteItems": [
    {
      "keyword": "原始词条",
      "type": "question/concept/person/insight/action/skill/trigger",
      "deepAnswer": "深度回答（150字以上，具体有见地）",
      "actionable": ["可执行行动1", "可执行行动2"],
      "furtherQuestions": ["延伸问题1", "延伸问题2"]
    }
  ],
  "aiAnswer": "如果是 Question 类型，给出综合深度回答（300字以上）；否则 null",
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3"],
  "relatedKeywords": ["关联关键词1", "关联关键词2", "关联关键词3"],
  "needsDeepDive": true或false,
  "deepDiveReason": "如果 needsDeepDive 为 true，说明原因（30字以内）；否则空字符串",
  "suggestedClusterName": "建议归入的知识簇名称（如「AI认知路径」「高密度环境」），5-15字",
  "nextActionType": "以下之一：parked/research/find_case/compare/experiment/create_content/upgrade_model/deepdive",
  "nextAction": "最小可执行的下一步动作（一句话，具体可操作，不超过50字）"
}`;
}

// ── Stage 1: gpt-4o image extraction ────────────────────────────────────────
async function extractFromImage(imageUrl: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
        {
          type: "text",
          text: `请对这张图片做两件事：

1. 完整提取所有文字（包括潦草手写字、数字、符号、箭头说明），按空间位置关系还原，不遗漏任何内容。

2. 描述图片的视觉结构（几个区域、如何组织）。

格式：
===RAW_TEXT===
（所有识别到的原始文字）

===VISUAL_STRUCTURE===
（布局描述）`,
        },
      ],
    }],
    max_tokens: 3000,
  });
  return response.choices[0]?.message?.content || "";
}

// ── Stage 2: o3 deep analysis ────────────────────────────────────────────────
async function deepAnalyze(
  content: string,
  existingTitles: string[] = []
): Promise<AIAnalysisResult> {
  const response = await openai.chat.completions.create({
    model: "o3",
    messages: [{
      role: "user",
      content: `${buildSystemPrompt(existingTitles)}\n\n以下是需要处理的内容：\n\n${content}`,
    }],
    max_completion_tokens: 12000,
  });

  const content2 = response.choices[0]?.message?.content || "";
  const jsonMatch = content2.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("o3 response did not contain valid JSON");

  const result = JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  if (!result.noteItems) result.noteItems = [];
  return result;
}

// ── Public API: analyze image ────────────────────────────────────────────────
export async function analyzeImage(
  imageUrl: string,
  existingTitles: string[] = []
): Promise<AIAnalysisResult> {
  const extracted = await extractFromImage(imageUrl);
  return deepAnalyze(extracted, existingTitles);
}

// ── Public API: analyze text ─────────────────────────────────────────────────
export async function analyzeText(
  text: string,
  existingTitles: string[] = []
): Promise<AIAnalysisResult> {
  return deepAnalyze(text, existingTitles);
}

// ── Apply user correction via o4-mini ───────────────────────────────────────
export async function applyCorrection(
  currentAnalysis: AIAnalysisResult,
  instruction: string
): Promise<AIAnalysisResult> {
  const prompt = `你是认知处理系统的校正引擎。用户对一条认知条目提出了修改意见，请按照意见更新内容。

当前条目：
${JSON.stringify(currentAnalysis, null, 2)}

用户修改意见：
"${instruction}"

请理解用户意图，更新相关字段。返回完整的更新后 JSON（格式与输入完全相同）：`;

  const response = await openai.chat.completions.create({
    model: "o4-mini",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 8000,
  });

  const content = response.choices[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return currentAnalysis;

  try {
    return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  } catch {
    return currentAnalysis;
  }
}

// ── Generate Model from cluster ──────────────────────────────────────────────
export async function generateModel(
  clusterName: string,
  entries: { title: string; summary: string; category: string; coreTheme: string }[]
): Promise<{ modelContent: string; description: string }> {
  const prompt = `你是认知模型生成引擎。以下是用户积累的一组相关认知条目，请将它们整合成一个可复用的认知模型/框架。

知识簇名称：${clusterName}

条目列表：
${entries.map((e, i) => `${i + 1}. [${e.category}] ${e.title}\n   摘要：${e.summary}\n   核心命题：${e.coreTheme}`).join("\n\n")}

请生成：
1. 一个完整的认知模型（包括核心结构、关键要素、应用场景、使用方法）
2. 一句话描述这个模型的本质

以 JSON 格式返回：
{
  "description": "一句话描述（30字以内）",
  "modelContent": "完整的 Markdown 格式认知模型内容（500字以上）"
}`;

  const response = await openai.chat.completions.create({
    model: "o3",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 6000,
  });

  const content = response.choices[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { modelContent: content, description: clusterName };

  try {
    return JSON.parse(jsonMatch[0]) as { modelContent: string; description: string };
  } catch {
    return { modelContent: content, description: clusterName };
  }
}

// ── Voice transcription ──────────────────────────────────────────────────────
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.includes("webm") ? "webm"
    : mimeType.includes("mp4") ? "mp4"
    : mimeType.includes("wav") ? "wav"
    : "m4a";

  const arrayBuffer = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength
  ) as ArrayBuffer;
  const file = new File([arrayBuffer], `audio.${ext}`, { type: mimeType });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "zh",
    response_format: "text",
  });

  return transcription as unknown as string;
}

export type { EntryCategory };
