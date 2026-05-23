import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type NoteCategory =
  | "idea" | "question" | "person" | "skill"
  | "todo" | "experience" | "quote" | "other";

export interface NoteItem {
  keyword: string;
  type: "question" | "concept" | "person" | "todo" | "insight" | "data";
  deepAnswer: string;
  actionable: string[];
  furtherQuestions: string[];
}

export interface AIAnalysisResult {
  rawText: string;
  category: NoteCategory;
  title: string;
  summary: string;
  tags: string[];
  aiAnswer: string | null;
  researchSuggestions: string[];
  relatedKeywords: string[];
  noteItems: NoteItem[];
  coreTheme: string;
  connectionInsight: string;
  suggestedTopicName: string;   // AI suggested knowledge topic
  suggestedTopicReason: string; // why this topic
}

export const CATEGORY_LABELS: Record<NoteCategory, string> = {
  idea: "灵感", question: "问题", person: "人名/人物",
  skill: "技能/知识点", todo: "待办事项", experience: "经验/感悟",
  quote: "金句/引用", other: "其他",
};

// ─────────────────────────────────────────────
// STAGE 1: gpt-4o — Image OCR + Visual Understanding
// ─────────────────────────────────────────────
async function stage1_extractImage(imageUrl: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
          {
            type: "text",
            text: `你是一个专业的图像文字识别和内容理解专家。

请对这张笔记图片做两件事：

1. **完整提取所有文字**：包括所有手写字、印刷字、数字、符号、箭头说明等，按照图片中的空间位置关系（从左到右、从上到下）忠实还原，不要遗漏任何内容，哪怕是潦草的字也要尽力识别。

2. **描述图片的视觉结构**：这张纸上的内容是如何排布的？有几个区域？用了什么方式组织（列表、箭头、分栏等）？

请按以下格式返回：

===RAW_TEXT===
（所有识别到的原始文字，保持原始排列结构）

===VISUAL_STRUCTURE===
（图片的视觉布局描述）`,
          },
        ],
      },
    ],
    max_tokens: 3000,
  });

  return response.choices[0]?.message?.content || "";
}

// ─────────────────────────────────────────────
// STAGE 2: o3 — Deep Structural Analysis
// ─────────────────────────────────────────────
async function stage2_deepAnalysis(
  extractedContent: string,
  existingTopics: string[]
): Promise<AIAnalysisResult> {

  const topicsContext = existingTopics.length > 0
    ? `\n\n用户已有的知识主题：${existingTopics.join("、")}`
    : "";

  const prompt = `你是一位顶级的思维伙伴和个人知识管理顾问。

以下是用户手写笔记的完整内容（由图像识别提取）：

${extractedContent}
${topicsContext}

你的任务是做深度结构分析，不是简单的信息整理。

**核心原则**：
- 不要问「这是什么」，要问「用户为什么记这个」「这背后的思维动作是什么」
- 识别整张笔记的内在逻辑链条，而不是孤立地处理每个词条
- 找出用户真正在思考的核心命题
- 每条分析要有真正的洞察，不能泛泛而谈

**分析框架**（参考，不要机械套用）：
用户的笔记通常遵循某种思维路径，比如：
触发点 → 信息探索 → 模式识别 → 能力追问 → 方法探索 → 自我定位
或其他你识别到的结构。

请严格按以下 JSON 格式返回（不要有任何额外文字）：
{
  "rawText": "整理后的原始文字内容",
  "category": "整体分类（idea/question/person/skill/todo/experience/quote/other之一）",
  "title": "这张笔记的核心主题（15字以内，要有洞察力）",
  "summary": "整体概括（100字以内，要说出本质）",
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "coreTheme": "用户这张纸背后真正在思考的核心命题（50字以内，要有深度，不能是表面描述）",
  "connectionInsight": "这张纸所有内容之间的内在逻辑链条（150字以内，要能说清楚为什么这些内容在一起）",
  "noteItems": [
    {
      "keyword": "原始词条或问题（保持原文）",
      "type": "question/concept/person/todo/insight/data",
      "deepAnswer": "深度回答（150字以上，要具体、有见地、有信息量，不能泛泛而谈）",
      "actionable": ["具体可执行的行动1", "具体可执行的行动2", "具体可执行的行动3"],
      "furtherQuestions": ["这个问题引出的更深层问题1", "更深层问题2"]
    }
  ],
  "aiAnswer": "如果整张纸围绕一个核心问题，给出综合性深度回答（300字以上）；否则返回null",
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3", "延伸研究方向4", "延伸研究方向5"],
  "relatedKeywords": ["关联关键词1", "关联关键词2", "关联关键词3", "关联关键词4", "关联关键词5"],
  "suggestedTopicName": "建议归入的知识主题名称（如果已有主题中有合适的就用已有的，否则建议新主题名，5-10字）",
  "suggestedTopicReason": "为什么建议归入这个主题（30字以内）"
}`;

  const response = await openai.chat.completions.create({
    model: "o3",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 12000,
  });

  const content = response.choices[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("o3 response did not contain valid JSON");

  const result = JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  if (!result.noteItems) result.noteItems = [];
  return result;
}

// ─────────────────────────────────────────────
// STAGE 1 (text only): o3 — Deep Analysis of plain text
// ─────────────────────────────────────────────
async function stage_textAnalysis(
  text: string,
  existingTopics: string[]
): Promise<AIAnalysisResult> {
  const topicsContext = existingTopics.length > 0
    ? `\n\n用户已有的知识主题：${existingTopics.join("、")}`
    : "";

  const prompt = `你是一位顶级的思维伙伴和个人知识管理顾问。

以下是用户的笔记内容：

${text}
${topicsContext}

你的任务是做深度结构分析，不是简单的信息整理。

核心原则：
- 不要问「这是什么」，要问「用户为什么记这个」「这背后的思维动作是什么」
- 识别整段笔记的内在逻辑链条
- 找出用户真正在思考的核心命题
- 每条分析要有真正的洞察，不能泛泛而谈

请严格按以下 JSON 格式返回（不要有任何额外文字）：
{
  "rawText": "用户的原始文字内容",
  "category": "整体分类（idea/question/person/skill/todo/experience/quote/other之一）",
  "title": "核心主题（15字以内，要有洞察力）",
  "summary": "整体概括（100字以内，要说出本质）",
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "coreTheme": "背后真正在思考的核心命题（50字以内）",
  "connectionInsight": "内在逻辑链条（150字以内）",
  "noteItems": [
    {
      "keyword": "原始词条或问题",
      "type": "question/concept/person/todo/insight/data",
      "deepAnswer": "深度回答（150字以上）",
      "actionable": ["可执行行动1", "可执行行动2"],
      "furtherQuestions": ["延伸问题1", "延伸问题2"]
    }
  ],
  "aiAnswer": "综合性深度回答（300字以上）或null",
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3", "延伸研究方向4", "延伸研究方向5"],
  "relatedKeywords": ["关联关键词1", "关联关键词2", "关联关键词3", "关联关键词4", "关联关键词5"],
  "suggestedTopicName": "建议归入的知识主题名称（5-10字）",
  "suggestedTopicReason": "为什么建议归入这个主题（30字以内）"
}`;

  const response = await openai.chat.completions.create({
    model: "o3",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 12000,
  });

  const content = response.choices[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("o3 response did not contain valid JSON");

  const result = JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  if (!result.noteItems) result.noteItems = [];
  return result;
}

// ─────────────────────────────────────────────
// PUBLIC API: Full pipeline for image
// ─────────────────────────────────────────────
export async function analyzeNoteImage(
  imageUrl: string,
  existingTopics: string[] = []
): Promise<AIAnalysisResult> {
  // Stage 1: gpt-4o extracts text and visual structure
  const extractedContent = await stage1_extractImage(imageUrl);

  // Stage 2: o3 does deep structural analysis
  const result = await stage2_deepAnalysis(extractedContent, existingTopics);

  return result;
}

// ─────────────────────────────────────────────
// PUBLIC API: Full pipeline for text
// ─────────────────────────────────────────────
export async function analyzeNoteText(
  text: string,
  existingTopics: string[] = []
): Promise<AIAnalysisResult> {
  return stage_textAnalysis(text, existingTopics);
}

// ─────────────────────────────────────────────
// Voice transcription via Whisper API
// ─────────────────────────────────────────────
export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ext = mimeType.includes("webm") ? "webm"
    : mimeType.includes("mp4") ? "mp4"
    : mimeType.includes("wav") ? "wav"
    : "m4a";

  // Convert to plain ArrayBuffer to avoid Node.js Buffer type incompatibility
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

// ─────────────────────────────────────────────
// Calibration: apply voice instruction to note
// ─────────────────────────────────────────────
export async function applyCalibrationInstruction(
  currentAnalysis: AIAnalysisResult,
  instruction: string
): Promise<AIAnalysisResult> {
  const prompt = `你是用户的思维伙伴。用户已有一份笔记分析草稿，现在他通过语音说出了修改指令，请按照他的指令更新分析内容。

当前分析草稿：
${JSON.stringify(currentAnalysis, null, 2)}

用户的修改指令：
"${instruction}"

请理解用户的意图，对分析内容做出相应修改。可能的修改包括：
- 修改某条的分类或回答
- 删除某条
- 补充新的内容
- 修改整体结构或主题
- 修改建议的知识主题归类

请返回修改后的完整分析（JSON格式，与输入格式完全相同）：`;

  const response = await openai.chat.completions.create({
    model: "o4-mini",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 8000,
  });

  const content = response.choices[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return currentAnalysis; // fallback to original if parse fails

  try {
    return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  } catch {
    return currentAnalysis;
  }
}

// ─────────────────────────────────────────────
// Find related notes
// ─────────────────────────────────────────────
export async function findRelatedNotes(
  sourceNote: { title: string; tags: string[]; summary: string },
  candidateNotes: { id: number; title: string; tags: string[]; summary: string }[]
): Promise<{ noteId: number; relationType: string; description: string }[]> {
  if (candidateNotes.length === 0) return [];

  const prompt = `分析以下笔记与候选笔记之间的关联关系。

源笔记：标题：${sourceNote.title} | 标签：${sourceNote.tags.join(",")} | 摘要：${sourceNote.summary}

候选笔记：
${candidateNotes.map((n) => `ID:${n.id} | ${n.title} | ${n.tags.join(",")} | ${n.summary}`).join("\n")}

找出最多5个有关联的笔记，关联类型：related/inspired_by/leads_to/contradicts

JSON格式返回：{"relations":[{"noteId":数字,"relationType":"类型","description":"原因20字内"}]}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  try {
    const result = JSON.parse(content) as { relations: { noteId: number; relationType: string; description: string }[] };
    return result.relations || [];
  } catch {
    return [];
  }
}
