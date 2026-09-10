// M15 布局个性化：Canopy 左塔右崖开放垂直 / Fortress 中轴要塞对枪线 /
// Factory 流水线横向推挤。三图不再共用骨架；平台数 13-15，吊柱全部移除。
// M28.5 结构拆分：每图独立文件（maps/canopy.ts 等），M29 大地图重排时每图只动
// 自己的文件。
import type { MapDef, MapId } from "../types.js";
import { CANOPY } from "./canopy.js";
import { FORTRESS } from "./fortress.js";
import { FACTORY } from "./factory.js";

export const MAPS: Record<MapId, MapDef> = {
  canopy: CANOPY,
  fortress: FORTRESS,
  factory: FACTORY,
};
