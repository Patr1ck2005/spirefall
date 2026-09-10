// M28.5 结构拆分：shared 契约按域分文件——
//   constants.ts  全局数值常量（WORLD/MOVE_TUNING/PLAYER_*/PROP_TUNING/弹药与赛时/导航预算）
//   types.ts      实体与协议类型（纯类型，零运行时）
//   util.ts       纯辅助：几何扫掠/射线/落点 + 肢体模型 + 标量工具
//   weapons.ts    武器定义表 WEAPONS
//   maps/         三图定义（canopy / fortress / factory 各自独立文件）
//   sim.ts        服务器共享确定性模拟（机关/移动平台/导航图/出生构造）
// 本文件保留为 re-export barrel：所有既有 `import ... from "./game.js"` 无需改动。
export * from "./constants.js";
export * from "./types.js";
export * from "./util.js";
export * from "./weapons.js";
export * from "./maps/index.js";
export * from "./sim.js";
