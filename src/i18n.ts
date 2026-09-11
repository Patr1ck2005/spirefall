// M24 i18n: a tiny two-language dictionary. The UI defaults to Chinese per
// the playtest request; tests pin English via localStorage before the app
// boots. Keys are grouped by screen. Weapon names stay English proper nouns.

export type Lang = "zh" | "en";

const DICT = {
  // Header / status
  brandTag: { zh: "残酷竞技场系统", en: "BRUTAL ARENA SYSTEM" },
  statusOffline: { zh: "未连接", en: "OFFLINE" },
  statusLinked: { zh: "已连接", en: "LINKED" },
  statusLost: { zh: "连接断开", en: "LINK LOST" },
  settingsTitle: { zh: "音频与画面", en: "Audio & visual" },
  soundToggle: { zh: "声音", en: " Sound" },
  volume: { zh: "音量", en: "Volume" },
  goreToggle: { zh: "血腥效果", en: "Gore" },
  shakeToggle: { zh: "镜头震动", en: "Camera shake" },
  digitsToggle: { zh: "伤害数字", en: "Damage numbers" },
  lightsToggle: { zh: "动态光影", en: "Dynamic lighting" },
  langButton: { zh: "EN", en: "中" },

  // Menu
  kicker: { zh: "网络对战 / 01-04 名机师", en: "NETWORK COMBAT / 01-04 PILOTS" },
  menuTitleA: { zh: "进入", en: "ENTER THE" },
  menuTitleB: { zh: "高塔", en: "SPIRE" },
  menuIntro: { zh: "每个扇区仍在运转，每台机器都充满敌意。", en: "Every sector is still alive. Every machine is hostile." },
  signalReady: { zh: "服务器链路就绪", en: "SERVER-LINK READY" },
  consoleHead: { zh: "接入节点 07", en: "ACCESS NODE 07" },
  consoleSmall: { zh: "加密局域网", en: "ENCRYPTED LAN" },
  callsign: { zh: "机师代号", en: "Pilot callsign" },
  createRoom: { zh: "创建房间", en: "Create room" },
  joinDivider: { zh: "加入进行中的高塔", en: "JOIN ACTIVE SPIRE" },
  roomCodeLabel: { zh: "房间码", en: "Room code" },
  join: { zh: "加入", en: "Join" },
  controlsMove: { zh: "A/D 移动", en: "A/D MOVE" },
  controlsJump: { zh: "W 跳跃", en: "W JUMP" },
  controlsPrimary: { zh: "J 主攻击", en: "J PRIMARY" },
  controlsSecondary: { zh: "K 副攻击", en: "K SECONDARY" },
  errServerNoAnswer: { zh: "竞技场服务器没有响应。", en: "The arena server did not answer." },

  // Lobby
  activeSpire: { zh: "当前高塔", en: "Active spire" },
  copy: { zh: "复制", en: "Copy" },
  copied: { zh: "已复制", en: "Copied" },
  privateSession: { zh: "私人局域网对局", en: "PRIVATE LAN SESSION" },
  section01: { zh: "部署", en: "DEPLOYMENT" },
  roster: { zh: "机师名册", en: "Pilot roster" },
  section02: { zh: "地点", en: "LOCATION" },
  sectorFeed: { zh: "扇区情报", en: "Sector feed" },
  section03: { zh: "参数", en: "PARAMETERS" },
  matchControl: { zh: "对局控制", en: "Match control" },
  openSlot: { zh: "空位", en: "OPEN SLOT" },
  waiting: { zh: "等待中", en: "WAITING" },
  statusHost: { zh: "房主", en: "HOST" },
  statusBot: { zh: "机器人", en: "BOT" },
  statusReady: { zh: "就绪", en: "READY" },
  statusReconnect: { zh: "重连中", en: "RECONNECT" },
  lobbyLinked: { zh: "{n}/4 名机师已连接，可开始战斗授权。", en: "{n}/4 pilots linked. Combat authorization available." },
  lobbyTransmit: { zh: "运行单人系统测试，或发送房间码给朋友。", en: "Run a solo systems test or transmit the room code." },
  settingSector: { zh: "扇区", en: "Sector" },
  settingLives: { zh: "生命", en: "Lives" },
  settingCrates: { zh: "补给箱", en: "Supply drops" },
  // M31 hostile mob toggle
  settingMobs: { zh: "敌对群怪", en: "Hostile mobs" },
  settingBots: { zh: "AI 机师", en: "AI pilots" },
  // M30 squad mode selector
  settingMode: { zh: "模式", en: "Mode" },
  modeFfa: { zh: "混战 FFA", en: "Free-for-all" },
  modeTeams2: { zh: "2 队分队", en: "2 squads" },
  modeTeams3: { zh: "3 队分队", en: "3 squads" },
  modeTeams4: { zh: "4 队分队", en: "4 squads" },
  botsOff: { zh: "关闭", en: "Off" },
  settingSkill: { zh: "难度", en: "Skill" },
  skillCasual: { zh: "休闲", en: "Casual" },
  skillStandard: { zh: "标准", en: "Standard" },
  skillBrutal: { zh: "残忍", en: "Brutal" },
  section04: { zh: "军械库", en: "ARMORY" },
  loadout: { zh: "授权配装", en: "Authorized loadout" },
  startMatch: { zh: "开始对战", en: "Start match" },
  soloTest: { zh: "单人测试", en: "Solo test" },
  leaveSpire: { zh: "离开高塔", en: "Leave spire" },

  // HUD
  live: { zh: "战斗中", en: "LIVE" },
  soloTestHud: { zh: "单人测试", en: "SOLO TEST" },
  spireResolved: { zh: "对局结束", en: "SPIRE RESOLVED" },
  spirePrefix: { zh: "高塔 ", en: "SPIRE " },
  ammo: { zh: "弹药", en: "AMMO" },
  bodyIntegrity: { zh: "机体完整度", en: "BODY INTEGRITY" },
  exitMatch: { zh: "退出对局", en: "Exit match" },
  panelHint: { zh: "按住 TAB — 松开关闭", en: "HOLD TAB — RELEASE TO CLOSE" },
  teamPanelHint: { zh: "分队战况 — 按住 TAB 查看", en: "SQUAD STANDINGS — HOLD TAB" },
  teamLabel: { zh: "{n} 队", en: "TEAM {n}" },
  spireKill: { zh: "高塔", en: "THE SPIRE" },
  sandboxRespawn: { zh: "测试重生", en: "Test respawn" },
  sandboxReturn: { zh: "返回大厅", en: "Return to lobby" },

  // Results
  resultEyebrow: { zh: "高塔已分出胜负", en: "Spire resolved" },
  onePilotRemains: { zh: "最后一名机师", en: "ONE PILOT REMAINS" },
  noSurvivor: { zh: "无人生还", en: "NO SURVIVOR" },
  defeatedBy: { zh: "落败 — {name} 占据了高塔", en: "DEFEATED — {name} HOLDS THE SPIRE" },
  teamVictory: { zh: "胜利 — {n} 队占据了高塔", en: "VICTORY — TEAM {n} HOLDS THE SPIRE" },
  teamDefeated: { zh: "落败 — {n} 队占据了高塔", en: "DEFEATED — TEAM {n} HOLDS THE SPIRE" },
  returnLobby: { zh: "返回大厅", en: "Return to lobby" },

  // Server errors
  errRoomNotFound: { zh: "房间不存在", en: "Room not found" },
  errAlreadyStarted: { zh: "对局已经开始", en: "The match has already started" },
  errRoomFull: { zh: "房间已满", en: "Room is full" },
  errInvalidMessage: { zh: "无效的消息", en: "Invalid message" },
} as const;

export type I18nKey = keyof typeof DICT;

const LANG_KEY = "spirefall-lang";
let current: Lang = "zh";
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === "en" || saved === "zh") current = saved;
} catch { /* storage unavailable: stay default */ }

export const i18n = {
  lang(): Lang {
    return current;
  },
  setLang(lang: Lang) {
    current = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* session-only */ }
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  },
  /** Translate a key; {n}/{name} placeholders interpolate when provided. */
  t(key: I18nKey, vars?: Record<string, string | number>): string {
    const entry = DICT[key];
    let text: string = entry ? entry[current] : key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) text = text.replace(`{${name}}`, String(value));
    }
    return text;
  },
  /** Map a known server error message to the current language; unknown messages pass through. */
  serverError(message: string): string {
    const map: Record<string, I18nKey> = {
      "Room not found": "errRoomNotFound",
      "The match has already started": "errAlreadyStarted",
      "Room is full": "errRoomFull",
      "Invalid message": "errInvalidMessage",
    };
    const key = map[message];
    return key ? DICT[key][current] : message;
  },
};

// Set the document language as soon as the module loads.
try { document.documentElement.lang = current === "zh" ? "zh-CN" : "en"; } catch { /* non-DOM context */ }
