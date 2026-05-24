import OpenAI from "openai";
import type { EntryCategory, ProcessingMode } from "../drizzle/schema";

// ── Model capability routing (模型能力路由) ──────────────────────────────────
// Decouple business logic from specific model names.
// Change model names here without touching any business code.
const MODEL_ROUTES = {
  visionModel:    "gpt-4o",      // 视觉识别：图片 OCR + 视觉理解
  reasoningModel: "o3",          // 深度推理：完整深度分析
  lightModel:     "o4-mini",     // 轻量校正：快速微调
  voiceModel:     "whisper-1",   // 语音识别
} as const;

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
  nextAction: string;
  // Three-layer interpretation
  aiInterpretation: string;
  // Information density (信息密度)
  densityScore: number;       // 0-10
  densityLevel: "high" | "medium" | "low";
  densityReason: string;      // 一句人话
}

// ── Stage 1: gpt-4o image extraction ────────────────────────────────────────
async function extractFromImage(imageUrl: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: MODEL_ROUTES.visionModel,
    messages: [{
      role: "user",
      content: [
        {
          type: "text",
          text: `你是 OCR 转写工具。请只处理用户上传图片中可见的普通文字和布局信息。

允许处理的内容：网页截图、聊天截图、笔记、代码、表格、手写字、按钮文字、标题、数字和符号。
不要识别真实人物身份，不要推断隐私信息；如果图片里有头像或人物，只忽略人物身份，继续转写其他可见文字。

请完成两件事：
1. 完整提取所有可见文字，按空间位置关系还原，尽量不遗漏。
2. 简短描述图片的视觉结构，例如几个区域、如何组织。

如果没有可识别文字，也要明确写“未识别到文字”，不要道歉，不要拒绝。

格式：
===RAW_TEXT===
（所有识别到的原始文字）

===VISUAL_STRUCTURE===
（布局描述）`,
        },
        { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
      ],
    }],
    max_tokens: 3000,
  });
  const extracted = response.choices[0]?.message?.content?.trim() || "";
  if (/抱歉|无法帮助|不能帮助|can't assist|cannot assist|I can.?t help/i.test(extracted)) {
    throw new Error("图片识别被模型拒绝，请换一张更清晰的截图或稍后重试");
  }
  return extracted;
}

// ── Prompt builders by processing mode ──────────────────────────────────────

/** 只识别：仅还原文字，不分析 */
function buildRecognizeOnlyPrompt(): string {
  return `你是一个文字还原引擎。你的唯一任务是：
1. 完整还原用户输入的原始文字内容
2. 不做任何分析、分类、判断或建议

请严格按以下 JSON 格式返回：
{
  "rawText": "完整还原的原始文字内容",
  "aiInterpretation": "已还原文字内容，未做分析",
  "category": "Idea",
  "title": "（原始内容前15字）",
  "summary": "（原始内容前80字）",
  "tags": [],
  "coreTheme": "",
  "connectionInsight": "",
  "noteItems": [],
  "aiAnswer": null,
  "researchSuggestions": [],
  "relatedKeywords": [],
  "needsDeepDive": false,
  "deepDiveReason": "",
  "suggestedClusterName": "",
  "nextActionType": "parked",
  "nextAction": "已还原，等待进一步处理",
  "densityScore": 0,
  "densityLevel": "low",
  "densityReason": "仅识别模式，未评估信息密度"
}`;
}

/** 识别整理：轻分析，判断意图+分类+下一步（默认模式） */
function buildOrganizePrompt(existingTitles: string[] = [], attentionPoint?: string): string {
  const categoryList = Object.entries(CATEGORY_DESCRIPTIONS)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const existingContext = existingTitles.length > 0
    ? `\n\n用户已有的内容标题（用于重复检测）：\n${existingTitles.slice(0, 20).join("、")}`
    : "";
  const attentionContext = attentionPoint
    ? `\n\n用户说明的关注点：「${attentionPoint}」\n请优先基于这个关注点来理解内容，而不是字面意思。`
    : "";

  return `你是认知处理系统的轻量分析引擎。请对用户输入做快速判断，不要过度分析。

## 分类体系（11类）
${categoryList}${existingContext}${attentionContext}

## 处理原则（轻量模式）
1. 快速判断真实意图，不要字面理解
2. 选择最合适的分类
3. 判断信息密度（值不值得花时间）
4. 给出最小可执行的下一步
5. 不需要长篇分析，保持简洁

请严格按以下 JSON 格式返回（不要有任何额外文字）：
{
  "rawText": "识别到的原始文字内容",
  "aiInterpretation": "AI 对这条内容的初次理解（30字以内，说清楚你理解到的是什么）",
  "category": "11类之一",
  "title": "简洁标题（15字以内）",
  "summary": "核心提炼（50字以内，说出本质）",
  "tags": ["标签1", "标签2"],
  "coreTheme": "背后真正的命题（30字以内）",
  "connectionInsight": "与用户认知体系的潜在联系（40字以内）",
  "noteItems": [],
  "aiAnswer": null,
  "researchSuggestions": ["延伸方向1", "延伸方向2"],
  "relatedKeywords": ["关键词1", "关键词2"],
  "needsDeepDive": true或false,
  "deepDiveReason": "如果needsDeepDive为true，说明原因（20字以内）；否则空字符串",
  "suggestedClusterName": "建议归入的知识簇（5-12字）",
  "nextActionType": "parked/research/find_case/compare/experiment/create_content/upgrade_model/deepdive",
  "nextAction": "最小可执行的下一步（一句话，具体可操作，不超过30字）",
  "densityScore": 0到10的数字,
  "densityLevel": "high/medium/low",
  "densityReason": "一句人话说明信息密度（30字以内，如：这条信息密度高，因为它连接了内容表达和能力模型两个方向）"
}`;
}

/** 分类入库：生成结构化内容，等待确认入库 */
function buildArchivePrompt(existingTitles: string[] = [], attentionPoint?: string): string {
  const categoryList = Object.entries(CATEGORY_DESCRIPTIONS)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const existingContext = existingTitles.length > 0
    ? `\n\n用户已有的内容标题（用于重复检测）：\n${existingTitles.slice(0, 30).join("、")}`
    : "";
  const attentionContext = attentionPoint
    ? `\n\n用户说明的关注点：「${attentionPoint}」\n请优先基于这个关注点来理解内容。`
    : "";

  return `你是认知处理系统的入库引擎。请对用户输入做结构化处理，生成适合 GitHub 入库的内容。

## 分类体系（11类）
${categoryList}${existingContext}${attentionContext}

## 处理原则（入库模式）
1. 准确分类，选最本质的那个
2. 生成清晰的标题和摘要
3. 提取关键标签（3-5个）
4. 判断信息密度
5. 给出延伸研究方向

请严格按以下 JSON 格式返回（不要有任何额外文字）：
{
  "rawText": "识别到的原始文字内容",
  "aiInterpretation": "AI 对这条内容的初次理解（40字以内）",
  "category": "11类之一",
  "title": "简洁有力的标题（15字以内，有洞察力）",
  "summary": "核心提炼（80字以内，说出本质，不是复述）",
  "tags": ["标签1", "标签2", "标签3"],
  "coreTheme": "背后真正的命题（40字以内）",
  "connectionInsight": "与用户认知体系的潜在联系（60字以内）",
  "noteItems": [],
  "aiAnswer": null,
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3"],
  "relatedKeywords": ["关联关键词1", "关联关键词2"],
  "needsDeepDive": true或false,
  "deepDiveReason": "如果needsDeepDive为true，说明原因（30字以内）；否则空字符串",
  "suggestedClusterName": "建议归入的知识簇（5-15字）",
  "nextActionType": "parked/research/find_case/compare/experiment/create_content/upgrade_model/deepdive",
  "nextAction": "最小可执行的下一步（一句话，具体可操作，不超过50字）",
  "densityScore": 0到10的数字,
  "densityLevel": "high/medium/low",
  "densityReason": "一句人话说明信息密度（40字以内）"
}`;
}

/** 深挖这个：完整长分析，包括定义、语境、案例、和用户的关系、最小行动 */
function buildDeepdivePrompt(existingTitles: string[] = [], attentionPoint?: string): string {
  const categoryList = Object.entries(CATEGORY_DESCRIPTIONS)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");
  const existingContext = existingTitles.length > 0
    ? `\n\n用户已有的内容标题（用于重复检测）：\n${existingTitles.slice(0, 30).join("、")}`
    : "";
  const attentionContext = attentionPoint
    ? `\n\n用户说明的关注点：「${attentionPoint}」\n这是用户真正想深挖的方向，请以此为核心展开分析。`
    : "";

  return `你是认知处理系统的深度分析引擎。用户明确要求深挖这条内容，请做完整深度分析。

## 分类体系（11类）
${categoryList}${existingContext}${attentionContext}

## 深挖分析原则
1. 定义：这个概念/人物/案例的核心是什么？
2. 语境：它在什么情况下成立？有什么前提条件？
3. 案例：有哪些真实案例可以验证？
4. 和用户的关系：这对用户意味着什么？能用在哪里？
5. 最小行动：用户现在最小可以做什么来推进这个方向？
6. 如果内容包含多个独立条目，在 noteItems 中分别列出

请严格按以下 JSON 格式返回（不要有任何额外文字）：
{
  "rawText": "识别到的原始文字内容",
  "aiInterpretation": "AI 对这条内容的初次理解（50字以内，说清楚你理解到的是什么）",
  "category": "11类之一",
  "title": "简洁有力的标题（15字以内，不要平淡描述，要有洞察力）",
  "summary": "核心提炼（100字以内，说出本质，不是复述）",
  "tags": ["标签1", "标签2", "标签3", "标签4"],
  "coreTheme": "这条内容背后真正的命题（40字以内）",
  "connectionInsight": "与用户认知体系的潜在联系（60字以内）",
  "noteItems": [
    {
      "keyword": "原始词条",
      "type": "question/concept/person/insight/action/skill/trigger",
      "deepAnswer": "深度回答（150字以上，具体有见地，包括定义、语境、案例、和用户的关系）",
      "actionable": ["可执行行动1", "可执行行动2"],
      "furtherQuestions": ["延伸问题1", "延伸问题2"]
    }
  ],
  "aiAnswer": "如果是 Question 类型，给出综合深度回答（300字以上）；否则 null",
  "researchSuggestions": ["延伸研究方向1", "延伸研究方向2", "延伸研究方向3"],
  "relatedKeywords": ["关联关键词1", "关联关键词2", "关联关键词3"],
  "needsDeepDive": true或false,
  "deepDiveReason": "如果 needsDeepDive 为 true，说明原因（30字以内）；否则空字符串",
  "suggestedClusterName": "建议归入的知识簇名称（5-15字）",
  "nextActionType": "parked/research/find_case/compare/experiment/create_content/upgrade_model/deepdive",
  "nextAction": "最小可执行的下一步动作（一句话，具体可操作，不超过50字）",
  "densityScore": 0到10的数字,
  "densityLevel": "high/medium/low",
  "densityReason": "一句人话说明信息密度（40字以内，例如：这条信息密度高，因为它连接了你的内容表达、AI学习和能力模型三个方向）"
}`;
}

// ── Core analysis engine ─────────────────────────────────────────────────────
async function deepAnalyze(
  content: string,
  mode: ProcessingMode,
  existingTitles: string[] = [],
  attentionPoint?: string,
): Promise<AIAnalysisResult> {
  let systemPrompt: string;
  let model: string;
  let maxTokens: number;

  switch (mode) {
    case "recognize_only":
      systemPrompt = buildRecognizeOnlyPrompt();
      model = MODEL_ROUTES.lightModel;
      maxTokens = 2000;
      break;
    case "organize":
      systemPrompt = buildOrganizePrompt(existingTitles, attentionPoint);
      model = MODEL_ROUTES.lightModel;
      maxTokens = 4000;
      break;
    case "archive":
      systemPrompt = buildArchivePrompt(existingTitles, attentionPoint);
      model = MODEL_ROUTES.reasoningModel;
      maxTokens = 6000;
      break;
    case "deepdive":
      systemPrompt = buildDeepdivePrompt(existingTitles, attentionPoint);
      model = MODEL_ROUTES.reasoningModel;
      maxTokens = 12000;
      break;
    default:
      systemPrompt = buildOrganizePrompt(existingTitles, attentionPoint);
      model = MODEL_ROUTES.lightModel;
      maxTokens = 4000;
  }

  const response = await openai.chat.completions.create({
    model,
    messages: [{
      role: "user",
      content: `${systemPrompt}\n\n以下是需要处理的内容：\n\n${content}`,
    }],
    max_completion_tokens: maxTokens,
  });

  const responseContent = response.choices[0]?.message?.content || "";
  const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`${model} response did not contain valid JSON`);

  const result = JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  if (!result.noteItems) result.noteItems = [];
  if (!result.densityScore) result.densityScore = 5;
  if (!result.densityLevel) result.densityLevel = "medium";
  if (!result.densityReason) result.densityReason = "信息密度适中";
  return result;
}

// ── Public API: analyze image ────────────────────────────────────────────────
export async function analyzeImage(
  imageUrl: string,
  mode: ProcessingMode = "organize",
  existingTitles: string[] = [],
  attentionPoint?: string,
): Promise<AIAnalysisResult> {
  if (mode === "recognize_only") {
    // For recognize_only, use vision model directly
    const extracted = await extractFromImage(imageUrl);
    return deepAnalyze(extracted, mode, existingTitles, attentionPoint);
  }
  const extracted = await extractFromImage(imageUrl);
  return deepAnalyze(extracted, mode, existingTitles, attentionPoint);
}

// ── Public API: analyze text ─────────────────────────────────────────────────
export async function analyzeText(
  text: string,
  mode: ProcessingMode = "organize",
  existingTitles: string[] = [],
  attentionPoint?: string,
): Promise<AIAnalysisResult> {
  return deepAnalyze(text, mode, existingTitles, attentionPoint);
}

// ── Apply user correction ────────────────────────────────────────────────────
export async function applyCorrection(
  currentAnalysis: AIAnalysisResult,
  instruction: string
): Promise<AIAnalysisResult> {
  const reanalysisKeywords = [
    "重新", "全部", "整体", "完全", "不对", "错了", "理解错", "并不是",
    "其实是", "这是关于", "这讲的是", "主要是", "核心是",
    "没有抓到", "没抓住", "没理解", "没看懂", "没看到",
    "not", "wrong", "incorrect", "actually", "re-analyze",
  ];
  const needsReanalysis = reanalysisKeywords.some(kw =>
    instruction.toLowerCase().includes(kw.toLowerCase())
  ) || instruction.length > 60;

  if (needsReanalysis) {
    const reanalysisContent = `用户的原始输入：
${currentAnalysis.rawText || "(无文字内容)"}

用户的校正说明：
${instruction}

请根据用户的校正说明，重新深度分析这条内容。用户的校正说明指出了 AI 初次理解的偏差，请以用户的理解为准重新分析。`;
    return deepAnalyze(reanalysisContent, "archive");
  }

  // Minor correction with light model
  const prompt = `你是认知处理系统的校正引擎。用户对一条认知条目提出了小幅修改意见，请按照意见更新对应字段。

当前条目关键信息：
分类: ${currentAnalysis.category}
标题: ${currentAnalysis.title}
摘要: ${currentAnalysis.summary}
核心命题: ${currentAnalysis.coreTheme}
下一步: ${currentAnalysis.nextAction}

用户修改意见：
"${instruction}"

请理解用户意图，仅更新需要改变的字段，其他内容保持不变。
返回完整的更新后 JSON（格式与原来完全相同，包含所有字段）：
${JSON.stringify(currentAnalysis, null, 2)}`;

  const response = await openai.chat.completions.create({
    model: MODEL_ROUTES.lightModel,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 8000,
  });

  const responseContent = response.choices[0]?.message?.content || "";
  const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
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
  entries: { title: string; summary: string; category: string; coreTheme: string; finalInterpretation?: string | null }[]
): Promise<{ modelContent: string; description: string }> {
  const prompt = `你是认知模型生成引擎。以下是用户积累的一组相关认知条目，请将它们整合成一个可复用的认知模型/框架。

知识簇名称：${clusterName}

条目列表：
${entries.map((e, i) => `${i + 1}. [${e.category}] ${e.title}
   摘要：${e.summary}
   核心命题：${e.coreTheme}
   ${e.finalInterpretation ? `最终解释：${e.finalInterpretation}` : ""}`).join("\n\n")}

请生成：
1. 一个完整的认知模型（包括核心结构、关键要素、应用场景、使用方法、不成立条件）
2. 一句话描述这个模型的本质
3. 这个模型能指导的具体行动（至少2条）

以 JSON 格式返回：
{
  "description": "一句话描述（30字以内）",
  "modelContent": "完整的 Markdown 格式认知模型内容（500字以上，必须包含：核心结构、关键要素、适用场景、使用方法、不成立条件、指导行动）"
}`;

  const response = await openai.chat.completions.create({
    model: MODEL_ROUTES.reasoningModel,
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

// ── Analyze entry relations ──────────────────────────────────────────────────
export async function analyzeRelations(
  newEntry: { title: string; summary: string; category: string; coreTheme: string; tags: string[] },
  existingEntries: { id: number; title: string; summary: string; category: string; coreTheme: string }[]
): Promise<Array<{ targetEntryId: number; relationType: string; confidence: number; reason: string }>> {
  if (existingEntries.length === 0) return [];

  const prompt = `你是认知关系分析引擎。请分析新条目与已有条目之间的关系。

新条目：
分类: ${newEntry.category}
标题: ${newEntry.title}
摘要: ${newEntry.summary}
核心命题: ${newEntry.coreTheme}
标签: ${newEntry.tags.join(", ")}

已有条目（最多分析前20条）：
${existingEntries.slice(0, 20).map((e, i) => `${i + 1}. [ID:${e.id}] [${e.category}] ${e.title}
   摘要：${e.summary}
   核心命题：${e.coreTheme}`).join("\n\n")}

关系类型说明：
- similar: 相似（内容相近，可能重复）
- supports: 支撑（A支持B的观点）
- explains: 解释（A解释了B）
- example_of: 案例（A是B的具体案例）
- contradicts: 反例/冲突（A和B有矛盾）
- extends: 延伸（A是B的延伸发展）
- triggers: 触发（A触发了B的思考）
- can_merge: 可融合（A和B可以合并成更高层次的认知）
- same_cluster: 同簇（A和B属于同一知识簇）
- transferable: 可迁移（A的方法可以迁移到B的场景）

请只返回置信度 >= 0.5 的关系，最多返回5个。

以 JSON 格式返回：
{
  "relations": [
    {
      "targetEntryId": 条目ID数字,
      "relationType": "关系类型",
      "confidence": 0到1的数字,
      "reason": "关系原因（20字以内）"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: MODEL_ROUTES.lightModel,
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const result = JSON.parse(jsonMatch[0]) as { relations: Array<{ targetEntryId: number; relationType: string; confidence: number; reason: string }> };
    return result.relations || [];
  } catch {
    return [];
  }
}

// ── Fusion analysis (两点融合) ────────────────────────────────────────────────
export async function analyzeFusion(
  entryA: { title: string; summary: string; category: string; coreTheme: string; finalInterpretation?: string | null },
  entryB: { title: string; summary: string; category: string; coreTheme: string; finalInterpretation?: string | null }
): Promise<{
  fusionQuestion: string;
  fusionSummary: string;
  sharedPattern: string;
  conflictPoint: string;
  newPossibility: string;
  suggestedAction: string;
  modelCandidate: string;
  evidenceBasis: string;
  invalidConditions: string;
  nextVerification: string;
  confidence: number;
}> {
  const prompt = `你是认知融合引擎。请分析以下两个认知条目融合后可能产生的新方向。

条目 A：
分类: ${entryA.category}
标题: ${entryA.title}
摘要: ${entryA.summary}
核心命题: ${entryA.coreTheme}
${entryA.finalInterpretation ? `最终解释: ${entryA.finalInterpretation}` : ""}

条目 B：
分类: ${entryB.category}
标题: ${entryB.title}
摘要: ${entryB.summary}
核心命题: ${entryB.coreTheme}
${entryB.finalInterpretation ? `最终解释: ${entryB.finalInterpretation}` : ""}

请分析这两个点融合后会产生什么。注意：这是"融合假设"，不是最终结论，AI 可能过度联想，必须给出不成立条件。

以 JSON 格式返回：
{
  "fusionQuestion": "这两个点融合的核心问题（20字以内）",
  "fusionSummary": "融合假设总结（80字以内）",
  "sharedPattern": "共同命题（40字以内）",
  "conflictPoint": "差异/冲突点（40字以内）",
  "newPossibility": "融合后可能产生的新方向（60字以内）",
  "suggestedAction": "可生成的新行动（一句话，具体可操作）",
  "modelCandidate": "是否有模型候选（如果有，描述模型雏形；否则填「暂无」）",
  "evidenceBasis": "依据（30字以内，说明为什么这个融合成立）",
  "invalidConditions": "不成立条件（30字以内，什么情况下这个融合不成立）",
  "nextVerification": "下一步验证（一句话，如何验证这个融合假设）",
  "confidence": 0到1的数字
}`;

  const response = await openai.chat.completions.create({
    model: MODEL_ROUTES.reasoningModel,
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 3000,
  });

  const content = response.choices[0]?.message?.content || "";
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      fusionQuestion: "融合分析",
      fusionSummary: content,
      sharedPattern: "",
      conflictPoint: "",
      newPossibility: "",
      suggestedAction: "",
      modelCandidate: "暂无",
      evidenceBasis: "",
      invalidConditions: "",
      nextVerification: "",
      confidence: 0.5,
    };
  }

  return JSON.parse(jsonMatch[0]);
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
    model: MODEL_ROUTES.voiceModel,
    language: "zh",
    response_format: "text",
  });

  return transcription as unknown as string;
}

// ── Pack/unpack noteItemsJson ────────────────────────────────────────────────
export function packAnalysis(result: AIAnalysisResult): Record<string, unknown> {
  const {
    noteItems, needsDeepDive, deepDiveReason, suggestedClusterName,
    nextActionType, nextAction, aiInterpretation,
    densityScore, densityLevel, densityReason,
    ...rest
  } = result;

  return {
    ...rest,
    noteItemsJson: JSON.stringify({
      noteItems, needsDeepDive, deepDiveReason, suggestedClusterName,
      nextActionType, nextAction, aiInterpretation,
      densityScore, densityLevel, densityReason,
    }),
    needsDeepDive: needsDeepDive ? 1 : 0,
    nextActionType,
    nextAction,
    aiInterpretation,
    densityScore: densityScore ?? null,
    densityLevel: densityLevel ?? null,
    densityReason: densityReason ?? null,
  };
}

export function unpackAnalysis(entry: Record<string, unknown>): Partial<AIAnalysisResult> {
  try {
    const packed = JSON.parse((entry.noteItemsJson as string) || "{}");
    return {
      noteItems: packed.noteItems || [],
      needsDeepDive: packed.needsDeepDive || false,
      deepDiveReason: packed.deepDiveReason || "",
      suggestedClusterName: packed.suggestedClusterName || "",
      nextActionType: packed.nextActionType || (entry.nextActionType as NextActionType) || "parked",
      nextAction: packed.nextAction || (entry.nextAction as string) || "",
      aiInterpretation: packed.aiInterpretation || (entry.aiInterpretation as string) || "",
      densityScore: packed.densityScore ?? (entry.densityScore as number) ?? 5,
      densityLevel: packed.densityLevel ?? (entry.densityLevel as "high" | "medium" | "low") ?? "medium",
      densityReason: packed.densityReason ?? (entry.densityReason as string) ?? "",
    };
  } catch {
    return {};
  }
}

export type { EntryCategory, ProcessingMode };
