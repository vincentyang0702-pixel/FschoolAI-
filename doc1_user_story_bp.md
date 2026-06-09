# FschoolAI × NeuroAGI — 用户故事 + 最简化 BP
**为 李小雷 准备 | 技术架构确认前置文件**

---

## 一句话描述

**FschoolAI 是一个会随着学生成长的 AI 学习系统。** 它不是 ChatGPT + 笔记，而是一个有记忆、有预判、会主动干预的第二大脑。每天使用，brain 变得更了解你。Day 100 的 Reggie 和 Day 1 的 Reggie 是完全不同的东西。

---

## 用户故事（User Story）

### 主角：Alex，大二学生，University of Toronto，主修 Psychology

**Day 1 — 第一次使用**

Alex 安装了 FschoolAI 的 Chrome 插件。插件连接了他的 Canvas 账号，自动同步了他的 6 门课、47 个 assignment、当前成绩。Reggie 第一次打招呼：

> *"嘿 Alex，我看到你这周有 PSYC 201 的 essay 和 STATS 110 的 midterm，两个都在周五。你想先从哪个开始？"*

Reggie 知道他的课表。但还不了解他这个人。

---

**Day 14 — Brain 开始建立 Pattern**

Alex 每次都在晚上 11 点才开始写 essay，总是拖到最后一天。Brain 记录了这个 pattern：`avoidance_detected: true`，`procrastination_window: 22:00-01:00`。

下一次 assignment 发布的时候，Reggie 主动发了一条消息（Alex 没有打开 app）：

> *"Alex，你的 PSYC 201 reflection 下周三截止。我知道你通常周一晚上才开始——这次要不要今天先把 outline 做了？我帮你 10 分钟内搞定。"*

Alex 点开了。10 分钟后 outline 完成。

---

**Day 45 — 个性化学习开始工作**

Alex 在 STATS 110 的 regression 上卡了两周。Brain 记录了 3 次他问过类似问题，每次都没有真正理解。Brain 的 hypothesis engine 生成了一个假设：`Alex 对抽象公式理解困难，需要具体例子先行`。

下次 Alex 问 regression，Reggie 不再给公式，直接给了一个关于 GPA 和 study hours 的具体例子。Alex 第一次说"哦我懂了"。

Brain 更新：`regression: mastery 0.35 → 0.72`。

---

**Day 90 — Compounding 效果可见**

Alex 的 PSYC 201 从 B+ 升到了 A-。Brain 知道原因：他在 essay 上提前了 4 天开始，用了 Reggie 给的 rubric alignment 检查，引用了 3 篇 Reggie 推荐的论文。

Leaderboard 上他从第 31 名升到第 8 名。他的同学 Jamie 问他用了什么。Alex 发了 FschoolAI 的链接。

Brain 记录了一个新 signal：`referral_from: alex_chen`。

---

**Day 365 — NeuroAGI 的价值主张成立**

Alex 大学毕业。他的 brain 里有：
- 4 年的学习 pattern
- 他真正掌握的 200+ 个概念
- 他的认知风格（视觉型，例子优先，深夜效率最高）
- 他在哪些领域有真正的优势

这个 brain 不属于 FschoolAI。它属于 Alex。他把它带到了工作中，带到了 NeuroAGI 的硬件设备上。

---

## 市场潜力

| 市场层次 | 规模 | 说明 |
|---|---|---|
| 全球高等教育学生 | 2.35 亿人 | UNESCO 2023 数据 |
| 使用 Canvas/Moodle/D2L 的学生 | ~8,000 万人 | 北美 + 欧洲 + 澳洲主流 LMS |
| 愿意为 AI 学习工具付费的学生 | ~2,000 万人 | 参考 Chegg/Quizlet/Grammarly 付费率 ~25% |
| **FschoolAI 5 年可达 TAM** | **$4B/年** | 2,000 万用户 × $20/月 |

**竞品对比：**

| 产品 | 月活 | 核心问题 | FschoolAI 优势 |
|---|---|---|---|
| Chegg | 600 万付费 | 答案工厂，无学习 | 真正理解 → 不是答案 |
| Quizlet | 6,000 万月活 | 无记忆，无个性化 | Brain 记忆 + 个性化 |
| Khanmigo (Khan Academy) | 试点阶段 | 无 LMS 集成，无 brain | Canvas 原生集成 |
| Grammarly | 3,000 万付费 | 只做写作，无学习 | 全学科 + 成长 |
| ChatGPT | 1 亿+ | 无记忆，无学生上下文 | Brain compounding |

**FschoolAI 的核心差异：** 竞品都是 Day 1 = Day 100。FschoolAI 是唯一一个随时间变得更了解你的系统。这是护城河，不是功能。

---

## 当前状态（Traction）

| 指标 | 数据 |
|---|---|
| 注册用户 | 52 人（University of Toronto，自然增长，无推广） |
| 同步 Assignments | 926 个 |
| 同步 Courses | 84 门 |
| Brain 信号记录 | 371 个 |
| Brain 反思记录 | 203 个 |
| Brain 行为 Pattern | 88 个 |
| 开发周期 | 3 个月 |
| 推广预算 | $0 |

52 个用户在零推广下自然注册，说明 word-of-mouth 已经在发生。

---

## 商业模式

**FschoolAI（学生端）**

| 层级 | 价格 | 内容 |
|---|---|---|
| Free | $0 | Canvas 同步，基础 Reggie，有限 token |
| Student Pro | $12/月 | 完整 brain，无限 Reggie，语音，Study Room |
| Student Max | $20/月 | Pro + 优先 brain 更新，高级分析，导出 brain |

**Token 经济体系（内置激励机制）**

FschoolAI 内置了一套 Token 激励系统（FschoolAI Tokens，简称 FST），将学术行为转化为可量化的进度。Token **不可购买**，只能通过 Canvas 验证的真实学术行为获得，因此 Leaderboard 和 tier 系统是对真实学业投入的忠实反映，而非消费能力的体现。

**核心赚取方式（部分示例）：**

| 行为 | Token | 验证方式 |
|---|---|---|
| 按时提交 assignment | +50 | Canvas 提交时间戳 ≤ 截止时间 |
| 提前提交（剩余时间 ≥ 20%） | +100 | Canvas 时间戳对比 |
| 提前提交（剩余时间 ≥ 50%） | +150 | Canvas 时间戳对比 |
| 完成 25–60 分钟专注学习 | +30 | Focus Agent 确认活跃时间 |
| 完成 60+ 分钟专注学习 | +60 | Focus Agent 确认活跃时间 |
| 在 Study Room 帮助同学（对方确认） | +25 | 对方确认信号 |
| 成绩提升（同课程上次 vs 本次） | +200 | Canvas 成绩对比 |
| 每日 Streak（登录 + 至少 1 个有效行为） | +10 | 每日信号链 |
| 7 天连续 Streak 奖励 | +100 | 7 天连续信号 |
| 向 Library 贡献新内容（首次同步） | +75 | Library dedup 未命中 |
| 成功 Refer 好友（完成 onboarding） | +200 | Referral 追踪 |
| 30 天 Streak 里程碑 | +500 | 一次性 |
| 学期 GPA 提升 | +1,000 | Canvas 学期 GPA 对比 |

**Token Tier 解锁：**

| Tier | 所需 Token | 解锁功能 |
|---|---|---|
| Basic | 0 | 标准 Reggie，每周 5 个 Study Room |
| Enhanced | 500 | 无限 Study Room，成绩预测，Professor Intelligence，自定义 Leaderboard |
| Advanced | 2,000 | 主持 Study Room（20人），Brain Analytics，跨课程知识图谱，徽章自定义 |
| Brain Owner | 5,000 | Brain 导出，Brain API，个性化 Reggie 人格，Beta 功能，NeuroAGI 硬件早鸟 |

活跃用户（每天使用）平均每天赚取约 150 FST，约 3–4 天达到 Enhanced，约 2 周达到 Advanced，约 5 周达到 Brain Owner。Token 系统的设计目标是**奖励持续使用，而非马拉松式刷分**。

**Leaderboard 类别（均来自 Canvas 验证信号）：**

| 类别 | 衡量内容 |
|---|---|
| Overall Score | 综合加权分 |
| Nerdmaxing | 本周专注学习总时长 |
| Late Night Maxing | 晚 10pm–凌晨 3am 的学习 session |
| Streak King | 当前连续每日 Streak |
| Assignment Crusher | 提前提交 assignment 的比例 |
| Grade Climber | 本学期成绩提升幅度（显示 delta，不显示绝对分数） |
| Study Room MVP | 被同学确认帮助的次数 |
| Brain Builder | Brain 知识掌握度综合指数（0–100） |
| Influencer Maxing | 成功 Refer 好友 + 主持 Study Room 次数 |
| Library Contributor | 向共享 Library 贡献的新内容数量 |

Leaderboard 可按**大洲 → 国家 → 城市 → 大学 → 课程**逐级筛选。Enhanced tier 及以上用户可创建自定义类别和私人 Leaderboard（仅对 Study Room 小组可见）。成绩绝对值**永不公开**，只显示提升幅度。

**Token 兑换与合作伙伴计划**

FST 可在 FschoolAI 合作伙伴网络中兑换为真实奖励。Token **不可兑换为现金**，但可兑换为学术工具、食品、科技订阅和 NeuroAGI 硬件折扣。

| 兑换内容 | 所需 Token | 示例合作伙伴 |
|---|---|---|
| 学术工具订阅 | 500–1,500 | Notion Plus、Grammarly Premium、Overleaf Pro |
| 外卖平台优惠 | 500–1,000 | Uber Eats $10、Starbucks $5、DoorDash $10 |
| 科技订阅 | 400–1,500 | Spotify Student、GitHub Copilot、Adobe CC |
| FschoolAI 升级 | 1,500–4,000 | Student Max 1–3 个月免费 |
| NeuroAGI 硬件折扣 | 2,000–5,000 | 神经卡预购 $50–$100 off |
| 内置 Boost | 150–500 | Streak Shield、考试冲刺模式、双倍 Token 周末 |

**合作伙伴模式：**

公司可以通过两种方式合作。标准合作伙伴提供奖励（礼品卡、订阅优惠），FschoolAI 每次兑换收取 $2–5 佣金；Gao级合作伙伴可赞助 Leaderboard 类别（如“Starbucks Late Night Maxing Award”）、发起专题挑战赛事，并获得匿名化的学生行为洞察报告，每月费用 $5,000–15,000。大学合作伙伴按每学生 $20–50/年付费，学生免费获得 Student Pro 功能——这是主要的企业化路径，一个大学合同就能带来数千个 Pro 用户。

**NeuroAGI（生态层）**

| 产品 | 价格 | 时间线 |
|---|---|---|
| NeuroAGI Brain API | $0.05/1K tokens（开发者） | 2025 Q4 |
| NeuroAGI Hardware（神经卡） | $299 硬件 + $15/月订阅 | 2026 |
| Enterprise Brain（机构） | $50/学生/年 | 2026 |

**单位经济（Student Pro，稳定期）**

| 指标 | 数值 |
|---|---|
| ARPU（订阅） | $12/月 |
| Claude API 成本 | ~$2.50/月/用户（见 Doc 3 v2.0） |
| ElevenLabs TTS | ~$0.45/月/用户（30% 语音用户） |
| Supabase + 基础设施 | ~$0.30/月/用户 |
| **订阅毛利率** | **~73%** |
| 合作伙伴兑换佣金（额外） | +$0.50–1.20/月/用户（40% 兑换率） |
| **包含合作伙伴收入的实际毛利率** | **~77–79%** |

---

## 产品路线图（Agent 建设阶段）

产品分四个 Sprint 推进，每个 Sprint 对应一批新 Agent 上线：

| Sprint | 时间 | 核心 Agent | 关键里程碑 |
|---|---|---|---|
| Sprint 1（当前） | 2025 Q2 | Reggie Chat、Nightly Reflection、Context Window、Proactive Intervention、Token Engine | 100 用户，brain 数据积累 |
| Sprint 2 | 2025 Q3 | Exam Predictor、Lesson Generator、Professor Intelligence、Canvas Watcher | 1,000 用户，成绩预测上线 |
| Sprint 3 | 2025 Q4 | Study Room Orchestrator、Motivation Engine、Social Intelligence、Whisper STT | 5,000 用户，社交学习网络 |
| Sprint 4 | 2026 Q1 | Cognitive Style Detector、Brain Migration、NeuroAGI Hardware Bridge | 10,000 用户，硬件预售 |

每个 Sprint 的 Agent 都建立在前一个 Sprint 的 brain 数据上。Exam Predictor 需要 Nightly Reflection 积累的 pattern 数据；Motivation Engine 需要 Exam Predictor 的成绩预测数据；Social Intelligence 需要 Study Room 的互动数据。这是 **compounding 的技术实现**：不是功能叠加，而是数据飞轮。

---

## 融资目标与对接机构

**目标融资：Pre-Seed $500K–$1M**

**用途：**
- 工程团队（3 人）× 12 个月：$360K
- Claude API + 基础设施：$60K
- 用户增长（大学校园推广）：$80K
- 法律/公司结构：$20K
- 储备：$80K

**为什么现在融资：**
1. 产品已经有真实用户和真实数据（52 用户，926 assignments，371 brain signals）
2. 技术护城河已建立（brain 架构 + 共享 library 的 network effect）
3. 团队已组建（前端 + 后端 + 插件 + AI 架构）
4. 市场时机：AI 教育工具爆发期，但没有一个做到真正的 brain compounding

**适合对接的机构：**

| 机构 | 理由 |
|---|---|
| **Y Combinator** | EdTech + AI infrastructure 是 YC 重点方向，FschoolAI 的 compounding moat 符合 YC 的 "做别人做不到的事" 标准 |
| **Andreessen Horowitz (a16z)** | a16z Education Fund 专注 AI + 教育，已投 Khan Academy AI、Synthesis |
| **Reach Capital** | 专注 EdTech，portfolio 包括 Duolingo、Coursera |
| **Owl Ventures** | 全球最大 EdTech 专项基金，$1B+ AUM |
| **字节跳动战略投资** | 字节在教育（掌门、作业帮）有深度布局，NeuroAGI 的 brain OS 概念与字节的 AI 战略高度契合 |
| **Sequoia Scout / Surge** | 早期 AI 基础设施投资，NeuroAGI 的 brain API 层有平台价值 |

**融资叙事（Pitch 核心）：**

> 我们不是在做另一个 AI 学习工具。我们在建一个 brain OS——一个随着学生成长的个人智能基础设施。FschoolAI 是第一个应用，NeuroAGI 是平台。就像 iOS 是 iPhone 的操作系统，NeuroAGI Brain 是学生数字生活的操作系统。第一个掌握学生 brain 数据的公司，将拥有最难被替代的护城河。

---

---

## 护城河分析

**为什么 FschoolAI 难以被复制？**

竞品可以复制功能，但无法复制数据飞轮。FschoolAI 的护城河由三层构成：

第一层是**个人 Brain 数据**。每个学生的 brain 包含数百个 pattern、hypothesis 和 knowledge mastery 记录。这些数据需要数月积累，竞品无法在用户切换时带走（除非用户主动导出）。

第二层是**共享 Library 的 Network Effect**。每当一个学生同步 Canvas 内容，所有同课程的学生都受益（Library dedup）。用户越多，Library 越完整，每个新用户的 brain 启动质量越高。这是典型的 **数据 Network Effect**，不是社交 Network Effect。

第三层是**Professor Intelligence 的独占数据**。通过分析多个学生的成绩和反馈，FschoolAI 建立了每个教授的评分风格档案。这个数据只存在于 FschoolAI 的 Library 中，是任何单一用户或竞品都无法独立建立的。

*文档版本：2025-06-09 v1.1 | 准备人：Vincent Yang*
