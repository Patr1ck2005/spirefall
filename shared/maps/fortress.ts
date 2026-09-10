// M15 布局个性化：Fortress 中轴要塞对枪线。
// M29 大地图重排（1500×840，坐标源：docs/MAP_LAYOUT_1500.md §3）：中轴 x≈750
// 六连 110 阶梯 = 全高贯通对枪线（oneWay 不挡弹是机制依据），贴地段由轴心矮垛
// 保护；对称四层双翼；双 blastCrusher 相位 180°；solid 3 面（双缺口立柱 + 矮垛）。
// 出生点 L,R,L,R 交替序（理由见 canopy.ts 头注）。
import type { MapDef } from "../types.js";

export const FORTRESS: MapDef = {
  name: "Fortress",
  sector: "BASTION / DEFENSE SPINE",
  color: 0x241f27,
  accent: 0xe4574f,
  atmosphere: 0xa68b7c,
  platforms: [
    { x: 0, y: 795, width: 390, height: 45 },
    { x: 600, y: 795, width: 300, height: 45 },
    { x: 1110, y: 795, width: 390, height: 45 },
    // M29 双缺口立柱：把 0..1500 贴地对枪线各截一刀（柱间 G-mid 净宽 562 保留
    // 中距对枪）。柱顶 755（地面 +40）：仍封胸线 777 的地面枪线，但跳跃弧
    // （柱位处 60-99px 高）可干净越过——90px 高的初版柱顶会撞回满速缺口跳
    // （ai-smoke 攻击性测试实测），垫脚链改为 柱顶 755 → 翼 685（升 70）。
    { x: 430, y: 755, width: 39, height: 40, solid: true },
    { x: 1031, y: 755, width: 39, height: 40, solid: true },
    // M29 轴心矮垛：护住对枪线的贴地段（从 5 个楼层高度成立、贴地层受保护）；
    // 垛顶 723 → S1 跳 38。
    { x: 730, y: 723, width: 40, height: 72, solid: true },
    { x: 615, y: 685, width: 270, height: 21, oneWay: true },
    { x: 590, y: 575, width: 320, height: 21, oneWay: true },
    { x: 625, y: 465, width: 280, height: 21, oneWay: true },
    { x: 595, y: 355, width: 310, height: 21, oneWay: true },
    { x: 665, y: 245, width: 170, height: 21, oneWay: true },
    { x: 650, y: 135, width: 200, height: 21, oneWay: true },
    { x: 240, y: 685, width: 200, height: 21, oneWay: true },
    { x: 290, y: 575, width: 200, height: 21, oneWay: true },
    { x: 280, y: 465, width: 200, height: 21, oneWay: true },
    { x: 330, y: 355, width: 200, height: 21, oneWay: true },
    { x: 1060, y: 685, width: 200, height: 21, oneWay: true },
    { x: 1010, y: 575, width: 200, height: 21, oneWay: true },
    { x: 1120, y: 465, width: 200, height: 21, oneWay: true },
    { x: 970, y: 355, width: 200, height: 21, oneWay: true },
  ],
  spawns: [
    { x: 160, y: 791 }, { x: 1340, y: 791 },
    { x: 380, y: 571 }, { x: 1100, y: 571 },
    { x: 340, y: 681 }, { x: 1160, y: 681 },
    { x: 750, y: 461 }, { x: 740, y: 131 },
  ],
  crateSockets: [
    { id: "fortress-ground-west", x: 100, y: 773 }, { id: "fortress-ground-mid", x: 850, y: 773 }, { id: "fortress-ground-east", x: 1420, y: 773 },
    { id: "fortress-wing-low-west", x: 300, y: 663 }, { id: "fortress-wing-low-east", x: 1200, y: 663 },
    { id: "fortress-wing-mid-west", x: 420, y: 553 }, { id: "fortress-wing-mid-east", x: 1120, y: 553 },
    { id: "fortress-stack-2", x: 750, y: 553 }, { id: "fortress-stack-3", x: 800, y: 443 },
    { id: "fortress-wing-high-west", x: 430, y: 333 }, { id: "fortress-wing-high-east", x: 1060, y: 333 },
    { id: "fortress-crown", x: 750, y: 113 },
  ],
  // M29 barrels: 缺口沿/矮垛东侧/对枪线腰部/王冠西端/东翼咽喉（M25 三约束验算
  // 见 docs/MAP_LAYOUT_1500.md §3.6）。
  props: [
    { id: "fortress-barrel-gap-west", x: 630, y: 795 }, { id: "fortress-barrel-parapet", x: 800, y: 795 },
    { id: "fortress-barrel-gap-east", x: 1140, y: 795 }, { id: "fortress-barrel-stack", x: 850, y: 575 },
    { id: "fortress-barrel-crown", x: 655, y: 135 }, { id: "fortress-barrel-wing-high", x: 1000, y: 355 },
  ],
  hazards: [
    // M29 双压闸（相位 45/285 = 180°，节拍沿用 M3/M16 基线）：悬停于双翼 W2/W3/W4
    // 上空，满探底 591 依次扫过三个站位；静置底 328 < 355 不压静置站位。
    { id: "bastion-crusher-west", kind: "blastCrusher", x: 210, y: 210, width: 135, height: 118, periodTicks: 480, warningTicks: 90, activeTicks: 54, phaseOffset: 45, travelY: 263, force: 620, limbDamage: 72 },
    { id: "bastion-crusher-east", kind: "blastCrusher", x: 1155, y: 210, width: 135, height: 118, periodTicks: 480, warningTicks: 90, activeTicks: 54, phaseOffset: 285, travelY: 263, force: 620, limbDamage: 72 },
  ],
  movers: [
    // 电梯 700..310：底位离地 95（G-mid 西沿可跳上），顶位直通 S4/W4（drop 45）；
    // 行程全程无平台体穿越。
    { id: "bastion-elevator", x: 490, y: 700, width: 95, height: 21, periodTicks: 400, phaseOffset: 0, travelY: -390 },
  ],
  // M31 刷怪锚点：地面双死角 + 双翼高层压闸柱外 + C1 高台 + 王冠顶角。
  mobSpawns: [
    { x: 40, y: 791 }, { x: 1460, y: 791 },
    { x: 430, y: 461 }, { x: 1300, y: 461 },
    { x: 820, y: 241 }, { x: 670, y: 131 },
  ],
};
