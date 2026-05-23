with open('/home/ubuntu/second-brain/server/aiService.ts', 'r') as f:
    content = f.read()

old = '''// ── Apply user correction via o4-mini ───────────────────────────────────────
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
  const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);
  if (!jsonMatch) return currentAnalysis;

  try {
    return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  } catch {
    return currentAnalysis;
  }
}'''

new = '''// ── Apply user correction ────────────────────────────────────────────────────
// Smart routing: minor tweaks use o4-mini; re-understanding uses o3 full re-analysis
export async function applyCorrection(
  currentAnalysis: AIAnalysisResult,
  instruction: string
): Promise<AIAnalysisResult> {
  // Detect if user is signaling a fundamental misunderstanding
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
    // Full re-analysis with o3, using user's correction as the guiding context
    const reanalysisContent = `用户的原始输入：
${currentAnalysis.rawText || "(无文字内容)"}

用户的校正说明：
${instruction}

请根据用户的校正说明，重新深度分析这条内容。用户的校正说明指出了 AI 初次理解的偏差，请以用户的理解为准重新分析。`;
    return deepAnalyze(reanalysisContent);
  }

  // Minor correction with o4-mini: only update specific fields
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
    model: "o4-mini",
    messages: [{ role: "user", content: prompt }],
    max_completion_tokens: 8000,
  });

  const responseContent = response.choices[0]?.message?.content || "";
  const jsonMatch = responseContent.match(/\\{[\\s\\S]*\\}/);
  if (!jsonMatch) return currentAnalysis;

  try {
    return JSON.parse(jsonMatch[0]) as AIAnalysisResult;
  } catch {
    return currentAnalysis;
  }
}'''

if old in content:
    content = content.replace(old, new)
    with open('/home/ubuntu/second-brain/server/aiService.ts', 'w') as f:
        f.write(content)
    print("SUCCESS: applyCorrection function replaced")
else:
    print("ERROR: old text not found")
    # Try to find partial match
    lines = old.split('\n')
    for i, line in enumerate(lines[:5]):
        if line in content:
            print(f"  Line {i} found: {line[:50]}")
        else:
            print(f"  Line {i} NOT found: {line[:50]}")
