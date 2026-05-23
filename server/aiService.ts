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

export interface AIAnalysisResult {
  rawText: string;
  category: NoteCategory;
  title: string;
  summary: string;
  tags: string[];
  aiAnswer: string | null;
  researchSuggestions: string[];
  relatedKeywords: string[];
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

/**
 * Analyze an image using GPT-4o vision to extract text and analyze content
 */
export async function analyzeNoteImage(imageUrl: string): Promise<AIAnalysisResult> {
  const systemPrompt = `你是一个专业的个人知识管理助手。你的任务是分析用户拍摄的笔记图片，提取文字内容，并进行深度分析。

请严格按照以下 JSON 格式返回结果（不要有任何额外的文字）：
{
  "rawText": "图片中识别到的原始文字内容",
  "category": "分类（只能是以下之一：idea/question/person/skill/todo/experience/quote/other）",
  "title": "为这条笔记生成一个简洁的标题（10字以内）",
  "summary": "对这条笔记内容的简洁总结（50字以内）",
  "tags": ["标签1", "标签2", "标签3"],
  "aiAnswer": "如果是问题类型，提供一个有深度的回答（200字以内）；如果不是问题，返回null",
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3"],
  "relatedKeywords": ["关联关键词1", "关联关键词2", "关联关键词3"]
}

分类说明：
- idea: 灵感、想法、创意
- question: 问题、疑问、不理解的事情
- person: 人名、人物、联系人
- skill: 技能、知识点、方法论
- todo: 待办事项、要做的事
- experience: 经验、感悟、心得
- quote: 金句、名言、引用
- other: 其他`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
          {
            type: "text",
            text: "请分析这张笔记图片，提取文字并进行深度分析。",
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  const result = JSON.parse(content) as AIAnalysisResult;
  return result;
}

/**
 * Analyze plain text content (for manual input)
 */
export async function analyzeNoteText(text: string): Promise<AIAnalysisResult> {
  const systemPrompt = `你是一个专业的个人知识管理助手。你的任务是分析用户的笔记文字内容，进行深度分析和归类。

请严格按照以下 JSON 格式返回结果（不要有任何额外的文字）：
{
  "rawText": "用户的原始文字内容",
  "category": "分类（只能是以下之一：idea/question/person/skill/todo/experience/quote/other）",
  "title": "为这条笔记生成一个简洁的标题（10字以内）",
  "summary": "对这条笔记内容的简洁总结（50字以内）",
  "tags": ["标签1", "标签2", "标签3"],
  "aiAnswer": "如果是问题类型，提供一个有深度的回答（200字以内）；如果不是问题，返回null",
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3"],
  "relatedKeywords": ["关联关键词1", "关联关键词2", "关联关键词3"]
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请分析以下笔记内容：\n\n${text}` },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  return JSON.parse(content) as AIAnalysisResult;
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
