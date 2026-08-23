# Mayhem Circuit 开发进度交接文档

> 更新时间：2026-08-23
> 本文档由 Claude Code 从 Codex 会话 `01a013e4`（2026-08-18，4.8 MB）及磁盘实际状态整理而成，2026-08-23 由 Claude Code 接手后续开发。
> 用途：压缩上下文后接续开发的主参考。**磁盘与 Git 状态优先于本文档；发现冲突时以真实状态为准并回写更新。**

## 1. 项目定位

- **项目名**：Mayhem Circuit（原 Gun Mayhem Redux 清洁室重做）
- **目标**：浏览器联机竞技场游戏，贴近原版手感；第一版只做 4 人自定义对战
- **清洁室边界（硬约束）**：原版 SWF（`temp_folder/english.swf`）仅作只读行为参考。禁止提取、描摹、模仿、再分发其美术/音频/字体/logo/品牌。所有运行时美术必须原创。
- **用户角色**：用户只提需求和验收，开发由 AI 完成。

## 2. 技术栈与架构

| 项 | 值 |
|---|---|
| 客户端 | Phaser 3.90，Vite 6，TypeScript 5.7 |
| 服务端 | Node.js + ws，权威模拟 60 Hz tick / 20 Hz 快照 |
| 共享契约 | [shared/game.ts](../shared/game.ts)（地图、武器、物理常量、协议类型）|
| 测试 | logic / network-smoke / browser-smoke(Playwright) / visual-smoke(四视口) / performance-smoke(四人压测) |

```
src/main.ts    (636 行) 场景、网络、输入预测、插值、HUD、特效
src/art.ts     (336 行) 程序化美术：巨构背景、角色轮廓、武器剪影、机关绘制
server/server.ts (666 行) 权威房间/比赛/沙盒/肢体/机关/箱子调度
shared/game.ts (445 行) 唯一契约层
tests/*.ts     五套测试
docs/ORIGINAL_BEHAVIOR.md  原版行为参考笔记
docs/ART_DIRECTION.md      美术方向 + 图像生成提示词（7 张资产规格）
public/assets/             仅 README —— 生成位图尚未产出（缺 OPENAI_API_KEY）
```

## 3. 已完成里程碑（按会话顺序）

### M1 清洁室基础实现（08-18 早）
- 三张地图（Canopy/Fortress/Factory）、六把武器、J/K 双攻击
- 房间系统：6 位房间码、断线槽位保留、重连

### M2 单人沙盒（08-18 上午，Codex 会话 #1→#3 期间）
- 恰好 1 名玩家时可启动 **Solo test** 沙盒：掉落即重生、永不判负、`Test respawn` 显式重生按钮、返回大厅
- 普通比赛仍强制 ≥2 人
- 注：Factory 地面缺口不足以走落出场，故加了显式 Test respawn 控件

### M3 美术重制（08-18 08:59–09:37，用户拍板的方向）
用户逐项确认的选择：
- 风格：工业科幻漫画 + 半写实漫画角色 + 完整美术重制；重度末世氛围
- **巨构（megastructure）为核心**：三张地图 = 同一座垂直工业巨构的三个海拔层级（Canopy 冠层 91 层 / Fortress 防御脊 / Factory 锻造底层）
- 电影化强特效 + 成人化暴力（肢解 + 血迹残留），带 `Gore` 和 `Camera shake` 本地开关
- 资产方案：混合资产——生成位图环境层 + 代码驱动角色/武器/特效 + HTML/CSS 界面；界面英文

实现内容：
- 服务器权威**肢体完整度**（无血条）：手臂伤 → 冷却+20%/档、后坐+15%；腿伤 → 移动-15%、跳跃-10%；命中区域按身体左右/上下选肢体；重生完全恢复；肢解为客户端演出事件
- 服务器权威**机关**：货运电梯（Canopy×2）、压闸 blast crusher（Fortress）、输送带、锻炉活塞（Factory）；周期/预警/致命窗口全部 tick 驱动
- 四套角色轮廓（Breacher/Warden/Rigger/Hunter）、六武器剪影、曳光/爆炸/烟尘/火花/血迹/残肢/镜头震动
- 大厅重构为赛事控制台风格；`FX` 弹层放视觉开关
- 生成资产加载器：**"存在即加载、缺失即程序化回退"**（[main.ts:544](../src/main.ts#L544) loadGeneratedBackgrounds）

### M4 性能诊断（08-18 09:48–11:05，只读诊断未改文件）
结论：卡顿来自客户端渲染，非网络。

| 场景 | 平均 FPS | P95 帧间隔 |
|---|---:|---:|
| Solo | 170 | 6 ms |
| 四人空闲 | 103 | 17.7 ms |
| 四人持续 J/K | **78** | 23.5 ms |
| 四人攻击 + 临时环境图 | 99 | 17.7 ms |

根因：`public/assets/` 无环境位图 → 每帧执行完整程序化巨构背景绘制（[art.ts](../src/art.ts)），占主要开销。网络正常（快照中位 ~54ms，tick 连续）。
**修复建议（未实施）**：缓存/加载静态环境背景、分离静态与动态绘制层、减少每帧 `Graphics.clear()`（[main.ts:524](../src/main.ts#L524)）、优化 HUD/特效更新。
临时对照实验证明：仅让环境图"加载成功"就从 78→99 FPS。

### M5 手感修复 + 三段跳（08-18 13:17–13:41）
用户反馈人物悬空、跳不上台阶。确认后的改动：
- **移动加速 ~35%**：水平速度 250→338（[server.ts:511](../server/server.ts#L511)），加速度 22→30，动画同步加快；攻击冷却和机关周期不变
- **角色缩小到 50%**：外观+碰撞+命中半径+武器起点同步缩（PLAYER_SCALE=0.5, HALF_WIDTH=9, BODY_HEIGHT=30）；平台布局与战斗空间一起重排（用户明确要求，不是只缩外观）
- **修脚底锚点 bug**：旧代码按 `platform.y - 18` 放置但绘制用另一套坐标 → 统一 PLAYER_FOOT_OFFSET=4，角色贴合平台表面
- **W 三段跳**：W 最多连续跳三次（起跳+两段空中），按键沿触发（长按不连发），落地/死亡/重生恢复次数；MAX_JUMPS=3
- 三张地图重排平台层级、出生点、中央高层平台；层高差保证可达
- 附带修：房间状态与首快照同时到达时创建两个 Phaser 画布的竞态

### M6 武器箱随机化 + 武器重做（08-18 16:20–16:38）
用户选择："候选平台插槽随机 + 随机间隔"、"六把全部重做"、"J/K 保留但差异强化"。
- 箱子：每图 9–10 个平台对齐插槽、最多 3 个活动箱、开局 1–3s 随机生成、拾取后 6–12s 随机重生、插槽去重、武器均匀随机、`crateSpawn`/`cratePickup` 事件、重连快照含插槽+generation+nextSpawnTick
- 六把武器（保留 ID，换名字/参数/模式）：M-12 Needle、Breach Scatter、Magline Rifle、Rail Lance、Forge Rocket、Cutter Blade
- 新增攻击模式：burst/pellet/piercing/cluster/slash/dashSlash（服务器权威）
- 死亡/重生恢复 Sidearm
- 特殊武器箱高亮脉冲+垂直警示光柱；生成/拾取粒子特效

### M7 Git 初始化（08-18 16:52–16:54，最后动作）
- 用户确认 provenance：`ai` + `gpt-5.6-sol`
- Commit `6aad3dd` "Initial Mayhem Circuit clean-room implementation"，trailer `Origin: ai:gpt-5.6-sol-codex`
- 工作区干净（当前验证：仍是 clean，HEAD 即此 commit）

### M8 位图资产生成与性能验证（08-23，Claude Code 接手后首轮）
- 用户配置了火山引擎 Ark 生图管线（`~/.claude/scripts/genimg.sh` + 用户级 `ARK_API_KEY`，模型 `doubao-seedream-5.0-lite`），取代原计划的 gpt-image-2 方案（auth.json 的 key 对官方 API 返回 401）
- 10 张资产全部产出并入库：3 环境（2560×1440 生成 → Pillow LANCZOS 降采样至规格 2048×1152）、4 肖像 + 3 材质参考（1920² → 1024²）；webp q90；提示词逐字取自 ART_DIRECTION.md，肖像装备灯颜色对齐四名玩家固定色
- 客户端渲染健康度实测：单人持续战斗 **5.96ms/帧（≈167 FPS）300 帧零超预算**；双人同机 162–167 FPS——位图加载后客户端成本极小
- 性能门禁决策记录：曾按用户选择收紧到 ≥90 FPS/P95≤14ms，实测发现 **Edge 于 2026-08-20 自动更新到 151**，其无头 BeginFrame 调度把四人同机压测的每页吞吐硬性压到 ~66–74 FPS（与游戏代码无关）。经确认回退到原 ≥45/P95≤45 门禁；保留两项测试基建修复：采样前 2s 预热、try/finally 保证浏览器必关
- 全量回归通过（build/logic/smoke/browser/visual/performance）

### M9 AI 机器人 + Tab 武器面板 + 地形 v2 + 沉浸感渲染（2026-08-23，Claude Code 第二轮）

用户三项新需求全部拍板并实施（一次性 commit 待用户验收后执行）：

- **AI 机器人**（正式解除"首版无 AI"排除项）：`server/bots.ts` 三档难度（Casual/Standard/Brutal），感知队列+反应延迟、BFS 平台导航图（buildPlatformGraph 共享真相源）、边缘自保（casual 按失误率跳过）、开火纪律/预判/噪声、brutal 档机关预警躲避；机器人=真实 PlayerState 占槽，沙盒=1 真人+N bot，对战=任意混合≥2；房主迁移立即发生且绝不选 bot；孤儿房间由新加入真人接任（顺手修的健壮性缺陷）
- **Tab 武器面板**：按住 Tab 显示 weaponSet 键位/实时弹药/攻击模式摘要，当前枪高亮；window keydown/keyup preventDefault + Phaser addCapture("TAB") 双保险
- **地形 v2**：三图重排至 ~19-23 平台/图（小台面、错落塔楼、地面缺口坠落区）、每图 2-4 块 solid 实体墙（最小穿透轴解析+天花板碰撞+dash 后单独解析）、每图 1 个通用移动平台 mover（calculateMoverState tick 确定，承载逻辑与货梯统一）、11 个 crateSockets/图
- **沉浸感渲染**：平台静态烘焙进 RenderTexture（材质 TileSprite 叠加 alpha≈0.26，换图才重烘）、远景视差层（3 张新生成 <map>-far.webp，depth -3，自位移 ±30px/±15px 双层视差）、氛围粒子（canopy 雨 50 / fortress 尘埃 35 / factory 余烬 45）、mover 美术（行程轨道线+板台脉冲灯）
- 全量回归通过（logic/smoke/browser/visual/performance 57.2 FPS）

## 4. 当前真实状态（2026-08-23 第二轮核验）

- ✅ Git：master @ `6aad3dd`，工作区含本轮改动待提交（资产+测试修复+文档）
- ✅ `public/assets/` 已有全部 10 张 webp（3 环境 + 4 肖像 + 3 材质），加载器自动生效，程序化绘制仅作回退
- ✅ 六套测试脚本齐全且全绿；dev 服务运行中（Vite 5173 / 游戏 8787）
- 测试实测基线（本机当前环境）：单人持续战斗 ≈167 FPS；四人同机压测 ≈66–74 FPS / P95 ≈23.6ms（Edge 151 无头调度上限，非游戏瓶颈）

## 5. 未完成事项 / 下一步候选

1. **用户目检 10 张新资产**：打开 `public/assets/` 或直接跑游戏看三张地图背景与大厅肖像；不满意的单张可重跑对应提示词再替换（管线已就绪，见 ART_DIRECTION.md 生成管线说明）
2. **联机第一版验收**：4 人自定义对战完整流程由用户组织验收（本轮交付物已就绪）
3. 若未来真实玩家反馈战斗卡顿，再考虑静态层烘焙优化（平台层仍每帧重绘）；当前证据表明客户端渲染预算非常充裕

## 6. 用户约束（继承自全部历史会话，继续有效）

- 清洁室边界不可破（见 §1）
- ~~不引入 AI 机器人~~ **2026-08-23 用户解除该排除项**：机器人作为房主可控的补位/陪练加入（沙盒+对战），三档难度；其余排除项不变（无账号、匹配、队伍、移动端、观战、公网托管）
- 攻击冷却和机关周期在手感调参时保持不变
- 界面英文
- 密钥不发聊天；不提交密钥
- Commit 必须带 `Origin:` trailer（格式见全局 CLAUDE.md；模型名+agent 名以用户确认为准）
- 2026-08-23 起全局规则：当前模型支持识图，Read 图片/PDF 无需事先确认
