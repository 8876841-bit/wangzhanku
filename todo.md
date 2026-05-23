# 第二大脑 · 认知处理系统 TODO

## Phase 1：数据库重构
- [x] 清空旧数据（notes、note_relations、topics 表）
- [x] 重建 entries 表：11类分类 + 完整生命周期状态
- [x] 重建 entry_clusters 表：重复聚合/Model升级管理
- [x] 更新 drizzle schema

## Phase 2：AI 服务重写
- [x] 适配 11 类分类体系（Concept/Person/Case/Question/Insight/Idea/Skill/Action/Model/Trigger/Positioning）
- [x] 新增重复检测：与已有内容相似度判断
- [x] 新增深挖标记：AI 判断是否値得深入研究
- [x] 保持多模型流水线（gpt-4o 看图 + o3 深度分析）

## Phase 3：后端路由重建
- [x] 批量输入接口（多图/多文字）
- [x] 校正接口（语音+文字，一句话修改）
- [x] 确认入库接口（状态 → archived + 推送 GitHub）
- [x] Model 升级接口（聚合多条内容生成认知模型）
- [x] GitHub 入库规则（按 11 类文件夹存放）
- [x] Dashboard 统计接口（7个视图的数量）

## Phase 4：前端重建
- [x] Dashboard 首页：7视图（待处理/待确认/待深挖/已入库/可升级/重复聚合/我的模型）
- [x] 输入页：批量图片+文字输入
- [x] 校正页：一句话语音/文字校正 + 确认入库
- [x] 条目详情页：完整生命周期展示
- [x] Model 升级页：聚合内容 → 生成认知模型
- [x] 知识库页：按分类浏览已入库内容

## Phase 5：测试与发布
- [x] 单元测试更新
- [x] 发布上线

## 系统升级 v2（低摩擦推进版）
- [x] 数据库：entries 表新增 parked/discarded 状态
- [x] 数据库：新增 nextActionType、nextAction 字段
- [x] 数据库：新增 aiInterpretation、finalInterpretation 字段（三层解释）
- [x] 后端：AI Prompt 新增 nextAction 生成
- [x] 后端：GitHub 目录改为 00_Inbox/01_Concepts/.../09_Models/_System
- [x] 后端：升级模型条件改为 4 条件判断（不只看数量）
- [x] 后端：新增 parked/discarded 操作接口
- [x] 前端：主界面简化为 4 入口（快速输入/等我确认/値得深挖/我的模型）
- [x] 前端：校正页底部显示 AI 建议分类，用户一句话校正
- [x] 前端：条目展示 nextAction（下一步最小动作）
- [x] 前端：条目支持一键 parked/discarded 操作
