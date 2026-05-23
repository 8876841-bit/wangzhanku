import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type NoteCategory =
  | "idea"
  | "question"
  | "person"
  | "skill"
  | "todo"
  | "experience"
  | "quote"
  | "other";

export interface NoteItem {
  keyword: string;          // 原始词条/问题
  type: "question" | "concept" | "person" | "todo" | "insight" | "data";
  deepAnswer: string;       // 深度回答（500字以内）
  actionable: string[];     // 可落地的行动建议
  furtherQuestions: string[]; // 延伸出的更深问题
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
  // 新增：逐条深度分析
  noteItems: NoteItem[];
  coreTheme: string;        // 这张笔记的核心主题
  connectionInsight: string; // AI 发现的各条目之间的内在联系
}

const CATEGORY_LABELS: Record<NoteCategory, string> = {
  idea: "灵感",
  question: "问题",
  person: "人名/人物",
  skill: "技能/知识点",
  todo: "待办事项",
  experience: "经验/感悟",
  quote: "金句/引用",
  other: "其他",
};

const DEEP_ANALYSIS_SYSTEM_PROMPT = `你是一位顶级的个人知识管理顾问和思想伙伴，拥有广博的知识储备和深度思考能力。

用户会给你一张手写笔记的图片。这张笔记可能包含多个独立的词条、问题、人名、灵感、待办事项等混合内容。

你的任务分两步：

**第一步：精准识别**
- 仔细识别图片中所有的文字，包括潦草的手写字
- 把笔记中每一个独立的词条、问题、人名、数字都单独列出来
- 不要遗漏任何一个条目，哪怕只是一个词

**第二步：逐条深度展开**
对每一个识别到的条目，进行真正有深度的分析：
- 如果是**问题**：给出有见地的、具体的回答，不要泛泛而谈
- 如果是**人名**：介绍这个人的背景、成就、思想，以及为什么值得关注
- 如果是**概念/词条**：深度解释这个概念，结合实际场景举例
- 如果是**数字/年份**：分析其背后的规律和意义
- 如果是**行动项**：给出具体可落地的执行步骤

最后，找出这张笔记所有内容之间的内在联系，给出一个整体性的洞察。

请严格按照以下 JSON 格式返回（不要有任何额外文字）：
{
  "rawText": "图片中所有识别到的原始文字，尽量完整",
  "category": "整体分类（idea/question/person/skill/todo/experience/quote/other之一）",
  "title": "这张笔记的核心主题标题（15字以内）",
  "summary": "对整张笔记的整体概括（100字以内）",
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "coreTheme": "这张笔记背后你正在思考的核心命题是什么（50字以内，要有洞察力）",
  "connectionInsight": "这张笔记各条目之间的内在联系和整体规律（100字以内，要有深度）",
  "noteItems": [
    {
      "keyword": "原始词条或问题",
      "type": "question/concept/person/todo/insight/data",
      "deepAnswer": "深度回答，要具体、有见地、有信息量，不少于100字",
      "actionable": ["具体可执行的行动1", "具体可执行的行动2"],
      "furtherQuestions": ["这个问题引出的更深层问题1", "更深层问题2"]
    }
  ],
  "aiAnswer": "如果整张笔记是围绕一个核心问题，给出综合性的深度回答；否则返回null",
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3", "延伸研究方向4", "延伸研究方向5"],
  "relatedKeywords": ["关联关键词1", "关联关键词2", "关联关键词3", "关联关键词4", "关联关键词5"]
}`;

const DEEP_TEXT_ANALYSIS_PROMPT = `你是一位顶级的个人知识管理顾问和思想伙伴，拥有广博的知识储备和深度思考能力。

用户会给你一段笔记文字。这段文字可能包含多个独立的词条、问题、人名、灵感等混合内容。

你的任务：
1. 识别文字中每一个独立的词条/问题/概念
2. 对每一条进行真正有深度的分析和回答
3. 找出各条目之间的内在联系

请严格按照以下 JSON 格式返回（不要有任何额外文字）：
{
  "rawText": "用户的原始文字内容",
  "category": "整体分类（idea/question/person/skill/todo/experience/quote/other之一）",
  "title": "核心主题标题（15字以内）",
  "summary": "整体概括（100字以内）",
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "coreTheme": "背后的核心命题（50字以内）",
  "connectionInsight": "各条目之间的内在联系（100字以内）",
  "noteItems": [
    {
      "keyword": "原始词条或问题",
      "type": "question/concept/person/todo/insight/data",
      "deepAnswer": "深度回答，具体有见地，不少于100字",
      "actionable": ["可执行行动1", "可执行行动2"],
      "furtherQuestions": ["延伸问题1", "延伸问题2"]
    }
  ],
  "aiAnswer": "综合性深度回答或null",
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3", "延伸研究方向4", "延伸研究方向5"],
  "relatedKeywords": ["关联关键词1", "关联关键词2", "关联关键词3", "关联关键词4", "关联关键词5"]
}`;

/**
 * Analyze an image using o4-mini vision for deep analysis
 */
export async function analyzeNoteImage(imageUrl: string): Promise<AIAnalysisResult> {
  const response = await openai.chat.completions.create({
    model: "o4-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: DEEP_ANALYSIS_SYSTEM_PROMPT,
          },
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
          {
            type: "text",
            text: "请仔细分析这张笔记图片，识别所有文字内容，并对每一个词条/问题进行深度展开分析。",
          },
        ],
      },
    ],
    // o4-mini uses max_completion_tokens instead of max_tokens
    max_completion_tokens: 8000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  // Extract JSON from response (o4-mini may wrap it)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI response did not contain valid JSON");

  const result = JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  // Ensure noteItems exists
  if (!result.noteItems) result.noteItems = [];
  return result;
}

/**
 * Analyze plain text content using o4-mini for deep analysis
 */
export async function analyzeNoteText(text: string): Promise<AIAnalysisResult> {
  const response = await openai.chat.completions.create({
    model: "o4-mini",
    messages: [
      {
        role: "user",
        content: `${DEEP_TEXT_ANALYSIS_PROMPT}\n\n请分析以下笔记内容：\n\n${text}`,
      },
    ],
    max_completion_tokens: 8000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("AI response did not contain valid JSON");

  const result = JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  if (!result.noteItems) result.noteItems = [];
  return result;
}

/**
 * Find related notes based on keywords
 */
export async function findRelatedNotes(
  sourceNote: { title: string; tags: string[]; summary: string; relatedKeywords?: string[] },
  candidateNotes: { id: number; title: string; tags: string[]; summary: string }[]
): Promise<{ noteId: number; relationType: string; description: string }[]> {
  if (candidateNotes.length === 0) return [];

  const prompt = `你是一个知识图谱助手。请分析以下笔记与候选笔记之间的关联关系。

源笔记：
标题：${sourceNote.title}
标签：${sourceNote.tags.join(", ")}
摘要：${sourceNote.summary}

候选笔记列表：
${candidateNotes.map((n) => `ID:${n.id} | 标题:${n.title} | 标签:${n.tags.join(",")} | 摘要:${n.summary}`).join("\n")}

请找出与源笔记有关联的笔记（最多5个），并说明关联类型和原因。
关联类型可以是：related（相关）、inspired_by（启发自）、leads_to（引申到）、contradicts（对比/矛盾）

请严格按照以下 JSON 格式返回（不要有任何额外文字）：
{
  "relations": [
    {"noteId": 数字ID, "relationType": "关联类型", "description": "关联原因（20字以内）"}
  ]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  const result = JSON.parse(content) as { relations: { noteId: number; relationType: string; description: string }[] };
  return result.relations || [];
}

export { CATEGORY_LABELS };
