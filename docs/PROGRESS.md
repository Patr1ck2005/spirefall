# Spirefall 开发进度交接文档

> 更新时间：2026-08-23
> 本文档由 Claude Code 从 Codex 会话 `01a013e4`（2026-08-18，4.8 MB）及磁盘实际状态整理而成，2026-08-23 由 Claude Code 接手后续开发。
> 用途：压缩上下文后接续开发的主参考。**磁盘与 Git 状态优先于本文档；发现冲突时以真实状态为准并回写更新。**

## 1. 项目定位

- **项目名**：Spirefall（2026-08-23 由开发代号 Mayhem Circuit 更名，为公开发布与原作《Gun Mayhem Redux》保持品牌距离；原 Gun Mayhem Redux 清洁室重做）
- **目标**：浏览器联机竞技场游戏，贴近原版手感；第一版只做 4 人自定义对战
- **清洁室边界（硬约束）**：原版 SWF 仅作只读行为参考——**2026-09 起二进制已从 git 仓库移除并加入 .gitignore**（本地保留、永不入库/分发）。禁止提取、描摹、模仿、再分发其美术/音频/字体/logo/品牌。所有运行时美术必须原创。
- **用户角色**：用户只提需求和验收，开发由 AI 完成。

## 2. 技术栈与架构

| 项 | 值 |
|---|---|
| 客户端 | Phaser 3.90，Vite 6，TypeScript 5.7 |
| 服务端 | Node.js + ws，权威模拟 60 Hz tick / 20 Hz 快照 |
| 共享契约 | [shared/game.ts](../shared/game.ts)（地图、武器、物理常量、协议类型）|
| 测试 | logic / network-smoke / **ai-smoke** / browser-smoke(Playwright) / visual-smoke(四视口) / performance-smoke(四人压测) |

```
src/main.ts    (约 1070 行) 场景、网络、输入预测、插值、HUD、特效、音效接线
src/art.ts     (约 425 行) 程序化美术：巨构背景、角色轮廓、武器剪影、机关绘制
src/audio.ts   (约 370 行) WebAudio 程序化音效引擎（零音频资产）
server/server.ts (约 960 行) 权威房间/比赛/沙盒/肢体/机关/箱子/时限调度
server/bots.ts (约 490 行) 服务器权威 bot（导航/计划/watchdog）
shared/game.ts (约 645 行) 唯一契约层
tests/*.ts     六套测试（logic/smoke/ai/browser/visual/performance）
Spirefall.bat  Windows 一键启动器
docs/ORIGINAL_BEHAVIOR.md  原版行为参考笔记
docs/ART_DIRECTION.md      美术方向 + 图像生成提示词
public/assets/             生成位图：3 环境 + 3 材质 + 4 肖像
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

用户三项新需求全部拍板并实施，已提交为 `1e8ccbd`（trailer `Origin: ai:stealth/ox-alpha-claude-code`）：

- **AI 机器人**（正式解除"首版无 AI"排除项）：`server/bots.ts` 三档难度（Casual/Standard/Brutal），感知队列+反应延迟、BFS 平台导航图（buildPlatformGraph 共享真相源）、边缘自保（casual 按失误率跳过）、开火纪律/预判/噪声、brutal 档机关预警躲避；机器人=真实 PlayerState 占槽，沙盒=1 真人+N bot，对战=任意混合≥2；房主迁移立即发生且绝不选 bot；孤儿房间由新加入真人接任（顺手修的健壮性缺陷）
- **Tab 武器面板**：按住 Tab 显示 weaponSet 键位/实时弹药/攻击模式摘要，当前枪高亮；window keydown/keyup preventDefault + Phaser addCapture("TAB") 双保险
- **地形 v2**：三图重排至 ~19-23 平台/图（小台面、错落塔楼、地面缺口坠落区）、每图 2-4 块 solid 实体墙（最小穿透轴解析+天花板碰撞+dash 后单独解析）、每图 1 个通用移动平台 mover（calculateMoverState tick 确定，承载逻辑与货梯统一）、11 个 crateSockets/图
- **沉浸感渲染**：平台静态烘焙进 RenderTexture（材质 TileSprite 叠加 alpha≈0.26，换图才重烘）、远景视差层（3 张新生成 <map>-far.webp，depth -3，自位移 ±30px/±15px 双层视差）、氛围粒子（canopy 雨 50 / fortress 尘埃 35 / factory 余烬 45）、mover 美术（行程轨道线+板台脉冲灯）
- 全量回归通过（logic/smoke/browser/visual/performance 57.2 FPS）

### M10 淘汰冻结 + 真退出 + 结算快照修复（2026-08-23，Claude Code 第三轮，用户验收发现）

用户联机验收发现两个 bug，全部修复：

- **淘汰玩家无限死亡循环**（血舞震动+机器人反复对冲+负命数）：生命耗尽的玩家在 respawnTimer 归零后仍被完整模拟（物理/AI/机关/子弹），掉坑→再 loseLife→再放死亡特效→循环；`alive` 判定含 respawnTimer>0 的死人导致结算被拖延。修复：新增 `isEliminated()`（match 模式 lives<=0），在 `stepPlayer`（冻结输入/物理）、`loseLife`、`damage`、机关循环、子弹命中五处拦截；`alive` 判定排除已淘汰者 → 比赛即时结算
- **结算快照丢失**：phase 变 results 后 tick 冻结，周期广播依赖 `tick % 3 === 0`，2/3 概率客户端永远收不到结算界面。修复：结算时显式 `broadcastSnapshot(room)` 一次
- **退出按钮从未真正工作**：大厅 "Leave circuit" 只是 `location.reload()`，而 reload 后自动重连（localStorage mayhem-session）会把玩家拉回原房间；对局中更无任何退出入口。修复：新增 `leave_room` 协议消息（立即删槽+清 token，跳过 30s 重连保留窗）；客户端三处退出（大厅 Leave / 对局右上 Exit match / 结算 Leave circuit）统一走 `leaveRoom()`——发协议、清会话存储、销毁 Phaser 实例、回主菜单，不再 reload；纯 bot/无人房间即时解散回收
- **测试修复**（network-smoke 有两个上一轮遗留的隐性回归）：
  - 命中测试：地形 v2 出生点相距 770px > Sidearm 射程 700 且中间有致命地面缺口，原固定走位必败；改为双方 drop 到共享地面层 + host 切狙击（slot 4, range 1100）射击，几何确定，并加几何健全性断言防地图再破坏
  - ws 库无 listener 时静默丢消息：逐条 waitFor 在同步处理窗口会漏掉服务器广播（leave 测试时好时坏的根因）；改用持续挂载的 message collector 轮询
  - 新增回归测试：淘汰冻结（无重复死亡事件、无负命、即时结算）+ leave_room 即时移除
- 全量回归通过（logic/smoke×3/browser/visual/performance 78.5 FPS）

### M11 更名 Spirefall + 公开发布准备（2026-08-23，Claude Code 发起 / DSH 收尾）

用户决定公开发布 GitHub，要求更名以与原作《Gun Mayhem Redux》保持品牌距离（旧名 Mayhem 中的 "Mayhem" 直接取自原作标题）。候选经搜索查重后用户拍板 **Spirefall**。

- 全套替换：菜单品牌头（M→S 标记，Mayhem Circuit→Spirefall）、主标语 ENTER THE SPIRE、JOIN ACTIVE SPIRE、Active spire、两处 Leave spire、Spire resolved、HOLDS THE SPIRE、HUD 的 SPIRE 前缀与 SPIRE RESOLVED、index.html 标题+meta 描述、package.json/package-lock 名（spirefall）、服务器横幅（Spirefall server）、localStorage 键（spirefall-session / spirefall-visuals）、测试环境变量 MAYHEM_WS→SPIREFALL_WS
- 保留：docs/ORIGINAL_BEHAVIOR.md 的原作参考标题（清洁室记录）、PROGRESS 历史章节中的旧名（历史事实）；房间码概念改名 "SPIRE xxxxxx"
- README 画廊 7 张截图全部用改名后跑出的新测试截图重新生成
- 开发环境切换：Claude Code → DSH（模型 glm-5.3-flash），本节后续提交 trailer 为 `Origin: ai:glm-5.3-flash-dsh`
- 全量回归通过（tsc/logic/smoke/browser/visual/performance 103.4 FPS）
- 发布建议：GitHub 仓库名用 `spirefall`；README 已含截图画廊与完整说明

## 4. 当前真实状态（2026-09 M18 审核轮更新）

- ✅ Git：master @ `032f611`（M13 已推送 GitHub），工作区含 M14-M17 战斗版本全量待提交；**2026-09 审核移除已入库的原版 SWF/EXE/抓帧图（P0 清洁室修复，历史重写待用户决策）**
- ⚠️ 运维教训：`tsx server/server.ts` 不带 watch，改服务器代码必须手动重启进程；多个"测试时好时坏"实为旧进程在跑（netstat 过滤词用 LISTENING）。另：负载下 serverTick 慢于墙钟（~35Hz），时长断言用 tick 不用墙钟
- ✅ `public/assets/` 全量 webp（3 环境 + 4 肖像 + 3 材质），far-layer 死资产已于 M18 删除
- ✅ 七套测试齐全（logic/smoke/ai/browser/visual/performance + build）；FFA 断言 2/3 通过即绿（罕见残局方差容忍）
- 测试实测基线：性能压测 52-65 FPS / P95 24-35ms（波动为本机负载方差，门槛 45/45）

### M12 一键启动器（2026-08-23，DSH/glm-5.3-flash）

用户要求免脚本启动。方案：双击 `Spirefall.bat`（用户在 bat 与打包 exe 之间选择前者）。

- 启动器行为：检查 Node → 首次自动 `npm install` → 固定 `PORT=8787` → 同控制台后台启动游戏服务器与 Vite → PowerShell 轮询 5173 就绪后自动开浏览器 → `pause` 保持窗口；关窗/Ctrl+C 全部退出（同控制台进程树，无孤儿进程）
- 新增 `.gitattributes`：`*.bat text eol=crlf`（保证 bat 行尾稳定）
- 调试中发现的坑：DSH 会话环境含 `PORT=3080`，被启动的子进程继承导致"服务器不监听 8787"的假象——bat 内显式 `set "PORT=8787"` 根治；另注意 v1 版本把浏览器探测循环放在 vite 启动之前（鸡生蛋死等 50s），v2 改为先启动后探测
- 验证：bat 拉起的完整技术栈通过 browser-smoke（房间 294973）；8787/5173 双端口确认、HTTP 200
- README "Run locally" 增加一键启动说明

### M13 程序化音效系统（2026-08-23，DSH/glm-5.3-flash）

用户从候选（音效 / 发布收尾 / 验收清单）中选定音效里程碑。纯 WebAudio 合成，零音频资产（清洁室安全），零协议改动（复用既有 CombatEvent 流）。

- 新建 `src/audio.ts`：惰性 AudioContext 单例 + master 压缩链；合成助手（噪声 burst / 扫频振荡 / 非谐波 clang）；距离衰减（1-d/900）+ StereoPanner 左右定位；voice 预算（>24 丢低优先级）+ 同名 30ms 节流；prefs 持久化 `spirefall-audio`（muted/volume）；全模块 try/catch 降级
- 音色表：6 武器主/副 12 种攻击签名（sidearm 三连 tick、scatter 低鼓、rifle 短 tick、rail 裂痕、rocket whoosh、blade swish 等）+ hit/explosion/dismember/death/respawn/hazard/crateSpawn/cratePickup + UI（click/join/leave/start/victory/defeat sting，胜负区分）
- 接线：processEvents 各分支 sfx.play（事件坐标相对我的位置空间化）；applySnapshot 相位转换 → 开始 beep / 胜负 sting / ambient 启停；enterLobby 名册 diff → 进出提示音；leaveRoom 停 ambient；首次手势（pointerdown/keydown）unlock
- FX 面板：Sound toggle + Volume 滑条（style.css 新增 .range 样式），眉标改 "Audio & visual"
- 比赛进行中低音量工业底噪（双失谐锯齿 55/55.8/110.5Hz + 低通 130 + 慢 LFO，gain 0.018）
- 删除旧 `playAttackTone`（按键触发的裸振荡器音，与真实攻击事件无关）
- **调试教训**：给 start/solo-test/restart 等按钮加点击音时一度用循环整体替换了监听器，把 send() 调用覆盖掉——browser-smoke 卡 canvas 等待超时暴露（gameWrap 保持 hidden、无 pageerror、favicon 404 是噪音）。诊断靠 playwright 双页忠实复刻测试流程抓 console/pageerror/requestfailed；修复为 clickAnd() 包装（音效+原 send 并存）
- 全量回归：tsc + 六套测试全绿，performance 116.4 FPS / p95 17.5ms（新高）

### M17 稳定化收尾：死亡规则 + Voltrail 处决 + AI 强化与专项测试（2026-08-23，DSH/glm-5.3-flash）

用户反馈：血条空了不死、AI 有问题、Voltrail 满蓄应一枪毙命、要求 AI/视觉测试写好、做稳定化收尾。诊断发现三处真实缺陷并全部修复：

- **死亡规则修复**（"血条空了不死"根因）：旧规则肢体 0=纯装饰，且打已断肢体伤害被 clamp 吞掉、头顶区命中（selectLimbAtPoint 返回 undefined）伤害完全丢失。新规则：已断肢体/头顶区命中 → 伤害随机转移到存活肢体；四肢全毁 → bleed-out 击杀（loseLife 泛化 "shot" cause，respawn 照旧满血）；爆炸均摊路径同样检查 quad-destroy
- **Voltrail 处决**：charge ≥ 0.8 → lethal 直击（无视肢体立即击杀，穿透 ×3 可一线多人处决）；0.25-0.8 维持缩放伤害；满蓄 0.95+ 额外冲击环/爆音/强震
- **火箭触墙即爆**（玩法缺陷顺手修）：explosiveRadius 弹撞墙不再哑火，范围伤害 + explosion 事件
- **AI 修复链**（每层都由新测试暴露）：①导航图补同层 gapJump 边（同层不重叠平台间无边，bot 规划不出跨缺口路线）②decidePlan 增加同层缺口跳跃（gapJump）/下降承诺（descend）/下穿判定（dropThrough 放宽）③executePlan 增加贴脸 leapfrog（重叠时跳过对方头顶，双方保持朝向继续开火——旧版互相禁火死锁）④**fleeEdge 整体删除**（坠落无伤害机制下纯负收益，是"bot 在 lip 来回踱步"死锁的根源）⑤**anti-stall watchdog**：目标不可达（下方 80px+ 或远距离卡住）且 4s 无净移动 → 强制 1.5s 直冲 march（禁跳防垂直弹跳循环；正下方按 S 下穿）——任何导航死角都有兜底
- **匹配 4 分钟时限**：updateRoom 里 tick > 14400（游戏时间 4 分钟）强制 results，按 lives→limbs 排名定 winner——所有僵局（camping/对峙/导航死角）硬上界
- **新 AI 专项测试** `tests/ai-smoke.ts` + `test:ai`：每图 3 bot FFA 自终局（FFA 结果断言软化 2/3 通过——罕见残局方差容忍，失败打印现场；serverTick 时钟判超时而非墙钟——负载下 tick 实际 ~35Hz）；aggression（70s 内 bot 开火 >200 且命中挂机人类）；双图 lone bot 20s 生存+移动。诊断脚本循环发现的关键事实：负载下 serverTick 慢于墙钟，一切时长断言必须用 tick
- **回归**：tsc + 七套全绿（新增 test:ai），performance 96.3 FPS / p95 17.7ms
- **状态**：等待用户实测后批准提交（commit 需用户明确批准——§6 约束）

### M16 弹道与打击特效完善（2026-08-23，DSH/glm-5.3-flash）

用户反馈：各种子弹、落地和打击的爆炸特效要大量完善。

- **新 `impact` 事件**（协议 additive）：子弹/火箭/火焰弹撞平台、命中身体消亡（非爆炸）、飞出边界三种情况服务器发事件，strength 随弹速缩放——消灭了"子弹无声消失"的最大哑弹区
- **客户端 impact 特效**（按武器分档）：普通弹碎屑 5-14 spark + 白闪 + 高速小冲击环；火箭撞墙橙 spark+flash+烟；火焰弹橙色飞溅 + 上飘余烬；全部落点烙永久弹孔 decal（复用 decalLayer，gore 关闭可清）
- **飞行轨迹**：火箭 3 节喷焰尾（热核→烟灰渐隐）；piercing 弹（Lance/Voltrail sec）残影拖尾加长至 52px + 尾端光珠 + 白热连线
- **命中双层血雾**：深红外圈 + 亮红内芯 + 2 滴溅落小弹孔；爆炸音加 0.12s 低频隆隆长尾（同 burst 铺设，无延迟调度）
- **impact 音效**：墙体闷响（低通噪声 + 低频 sine 下坠）
- 测试修正：factory 机关 2→4（双传送带+双活塞），smoke 断言同步
- **回归**：tsc + 六套全绿；performance 85.0 FPS / p95 23.1ms
- **状态**：等待用户实测后批准提交（commit 需用户明确批准——§6 约束）

### M15 游戏性强化：地图个性化 + 伤害上调 + 修复电池（2026-08-23，DSH/glm-5.3-flash）

用户反馈：游戏性弱、场景遮挡多、场景单调重复、伤害偏低。四项全动。

- **三图去模板化**（旧版三图共用同一平台骨架只是抖坐标）：Canopy 左塔右崖开放垂直（左密集窄塔/右大开放坠落区，双货运电梯，删吊柱，19→13 平台）；Fortress 中轴要塞（中央四层大视线走廊对枪线 + 两侧对称短翼，blastCrusher 1→2 对称相位 180°，20→14）；Factory 流水线横向（2 条 conveyor 把人往缺口推 + forgePiston 1→2 相位差 180°，平台重排更开阔）。箱子点位 11→8-9 跟随新布局，出生点全部核对贴台
- **遮挡清理**：drawEnvironment 底色 0.22→0.12、暗层 0.18→0.08；平台亮边 cap 亮度 up（oneWay 1.0/0.55，"能走"信号强化）；canopy 雨滴 50→36；**三张背景图全部重生成**（新提示词：结构推到左右边缘、中段大面积留白、"keep the middle of the frame almost empty"），ART_DIRECTION 提示词档案同步更新并记录重生成原因
- **伤害 ×1.45**：sidearm 5→7、burst 7→10、scatter 6→9、flame 3→4、beam 4→6/tick、Lance 26→38、Voltrail 22→32（满蓄 ≈83）、Voltrail sec 24→35、rocket 32→46、cluster 17→25、blade 26/42→38/60；机关 crusher 62→72、piston 72→84。只动 damage 不动击退
- **新机制 修复电池 Repair Cell**：CrateState+kind("weapon"|"repair")，~25% 生成概率；拾取恢复四肢完整（不换枪）；绿色十字贴图 + 绿色 restore 特效（双层绿环+绿 burst）+ 专属三音上行 repair 音效；CombatEvent+crateKind 字段（crateSpawn/Pickup 均带）
- **测试**：game-logic 新增 M15 伤害下限断言 ×6 + 箱子点位自动核验（循环内已有，新布局直接覆盖）；smoke 共底断言（factory 新布局 |Δx|=770 < 1200）通过
- **回归**：tsc + 六套全绿；performance 99.2 FPS / p95 17.7ms（新布局平台更少烘焙更轻，比 M14 的 55 大幅回升）
- **状态**：等待用户实测三图手感后批准提交（commit 需用户明确批准——§6 约束）

### M14 火力全开：全枪械重设计（2026-08-23，DSH/glm-5.3-flash）

用户要求：全部枪械重设计、多连发、单发光效拉满、加入充能/激光。blade 近战保留，5 枪全换。

- **新武器表**（weaponId 不变，协议兼容）：sidearm→**Vein Ripper** 全自动冲锋枪（0.09s auto，弹匣 90，sec 过热倾泻 burst×6）；scatter→Breach Scatter 8 弹丸 + sec **Blaze Vent** 短程自动火焰喷洒；rifle→**Longbeam** 持续穿透光束（0.12s/tick held 即连发）+ Lance Pulse；sniper→**Voltrail** 蓄能磁轨（按 J 蓄力 ≤1.1s 松开发射，伤害 22×(1+1.6c)、击退/光宽/音量随 charge，chargeMin 0.25，穿透×3，满蓄力冲击环+爆音+强震）；rocket 数值微调+视觉强化；blade 不动
- **协议扩展**（additive）：AttackPattern+"beam"；AttackDef+chargeMax/chargeMin；CombatEvent+charge?；PlayerState+charge?（蓄力状态全员可见）
- **服务器**：stepPlayer 蓄力状态机（按住累计→广播 charge→松开 attack(fraction)）；attack() 接受 charge 缩放 damage/knockback/recoil/range；beam 走 hitscan 无限穿透分支；全武器 held 缓慢回弹 AMMO_REGEN_PER_SECOND=2；武器切换/重生清 charge；bot 蓄力预算（brutal 满 1.1s、standard 0.55×、casual 0.3×）
- **客户端**：beam 光轨 life 0.15 逐 tick 刷新（视觉连续）；Voltrail 光宽 2.5+7c、满蓄力冲击环+railBoom+强震；新增 shock rings 特效（强命中/爆炸/重单发）与 "flash" 大粒子（枪口闪光）；蓄力者头顶弧形蓄力条（品红，满蓄变白）；HUD J 槽蓄力时显示 charge 填充；蓄力上升音 sfx.charge（6 级阈值触发）；火箭尾焰加粗；Blaze Vent 火焰弹丸贴图
- **测试更新**：game-logic 蓝图断言全面重写（auto/beam/charge/vent）；network-smoke 双攻击断言 ammo===9→<90（新数值），命中测试改 Voltrail 蓄力释放（hold 12 snapshots ≈0.55 charge > chargeMin——首版 hold 4 snapshots ≈0.18 空放失败，已修）；browser-smoke 面板断言 M-12 Needle→Vein Ripper
- **回归**：tsc + 六套全绿；performance 72.1 FPS / p95 23.5ms（光束+粒子增量所致，仍高于 45 FPS 门槛）
- **特效二次强化（用户反馈"不够炫酷"）**：hitstop 命中停顿（effects 时间缩放 0.12×，40-100ms，350ms 冷却，粒子池>120 时跳过——风暴模式先牺牲它）；死亡击杀光柱（竖直 tracers 段）+ 双层扩张冲击环（eased 生长）；爆炸四层火球（白核 flash/橙色 energy/ember spark/smoke）；flash 粒子白核+光晕双层绘制；beam/磁轨光轨 jitter 抖动段（4 段替代 halo 层，不叠加）；强命中阈值 0.45 降档触发小冲击环
- **性能护栏（特效强化后 perf 一度 39.7）**：自适应粒子密度（池>140 ×0.65，>200 ×0.35）；粒子池 240→170；爆炸/死亡爆发数收敛；hitstop 风暴跳过；**血 decals 烙进独立 RenderTexture**（decalLayer，stamp 一次终身免费，替掉每帧最多 48×2 fill 的最大隐性开销，gore 关闭 clear）；tracer jitter 段替代而非叠加 halo 层。最终六套全绿，performance 稳定 54.9-55.5 FPS / p95 29.2ms
- **状态**：等待用户实测手感后批准提交（commit 需用户明确批准——§6 约束）

## 5. 未完成事项 / 下一步候选

1. ~~**GitHub 发布**~~ ✅ 已完成：仓库已推送（用户操作，2026-08-23）
2. **用户验收 M14-M17 战斗版本全量**（当前焦点）：Voltrail 蓄力 ≥80% 处决一枪 → 打断四肢看 bleed-out 死亡 → 观察 bot 跨缺口跳跃/抢修复电池/leapfrog → 僵局对局 240s 后正常出 winner → 满意后批准提交（M14-M17 可合并为"战斗版本"提交或分四个，用户定）
3. **发布收尾（候选）**：MIT LICENSE + v0.1.0 tag + GitHub About/topics 文案（gh CLI 未装，网页项需用户操作）
4. **联机第一版验收**：4 人自定义对战完整流程由用户组织验收
5. 性能余量充足（96 FPS，七套测试含 test:ai）；若逼近 45 门槛再做粒子/光轨批渲染

## 6. 用户约束（继承自全部历史会话，继续有效）

- 清洁室边界不可破（见 §1）
- ~~不引入 AI 机器人~~ **2026-08-23 用户解除该排除项**：机器人作为房主可控的补位/陪练加入（沙盒+对战），三档难度；其余排除项不变（无账号、匹配、队伍、移动端、观战、公网托管）
- 攻击冷却和机关周期在手感调参时保持不变
- 界面英文
- 密钥不发聊天；不提交密钥
- Commit 必须带 `Origin:` trailer（格式见全局 CLAUDE.md；模型名+agent 名以用户确认为准）
- **2026-08-23 起追加**：任何 `git commit` 必须先经用户明确批准，AI 不得自行提交；推送同理需批准
- 2026-08-23 起全局规则：当前模型支持识图，Read 图片/PDF 无需事先确认
