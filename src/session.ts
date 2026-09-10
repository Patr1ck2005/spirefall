// M28.5 结构拆分：客户端会话层——连接凭据、当前房间、场景引用与视觉偏好。
// 模块级可变状态集中于此；ui.ts（壳层 DOM）与 main.ts（ArenaScene）都读写它，
// 替代原先散落在 main.ts 顶层的裸 let 变量。
import type Phaser from "phaser";
import type { MatchConfig, ServerSnapshot } from "../shared/game.js";

export type RoomMessage = {
  code: string;
  hostId: string;
  phase: ServerSnapshot["phase"];
  mode: ServerSnapshot["mode"];
  players: Array<{ id: string; name: string; connected: boolean; color: number; archetype: 0 | 1 | 2 | 3; isBot?: boolean }>;
  config: MatchConfig;
};

/** 壳层需要的场景公共面（ArenaScene 方法子集）——避免 ui→main 的类型环。 */
export interface ArenaSceneLike {
  applySnapshot(snapshot: ServerSnapshot): void;
  sendInput(slot?: number): void;
  hasSnapshot(): boolean;
  clearProcessedEvents(): void;
  refreshLocalizedViews(): void;
  setVisualPreferences(): void;
}

// M24 render scale: the game canvas renders at 1.3× the world resolution and
// the camera zooms to match, so every sprite, gun and platform draws 30%
// larger with no physics, collision or balance change. The visible world
// stays exactly 1000×560. Drop this to 1.25/1.2 if low-end GPUs dip under
// the performance floor — it is the single tuning point.
export const RENDER_SCALE = 1.3;

export const session = {
  selfId: "",
  token: "",
  roomCode: "",
  currentRoom: undefined as RoomMessage | undefined,
  scene: undefined as ArenaSceneLike | undefined,
  gameInstance: undefined as Phaser.Game | undefined,
  manualConnectionAction: false,
  resumeAttempted: false,
  lastRosterKey: "",
};

// M26: every slot gets a procedural poster portrait (data URL, no assets).
export const availablePortraits = new Set<number>([0, 1, 2, 3]);

const savedVisuals = JSON.parse(localStorage.getItem("spirefall-visuals") || "null");
export const visualPrefs = { gore: savedVisuals?.gore !== false, shake: savedVisuals?.shake !== false, digits: savedVisuals?.digits !== false, lighting: savedVisuals?.lighting !== false };
