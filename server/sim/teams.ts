// M30 分队域：队伍归属、自动平衡、分队出生点选择与按队排名。
// 依赖方向：teams → state（叶子模块）；被 room / damage / players /
// projectiles / bots / tick 消费。FFA（teams 0 或 sandbox）全部退化为旧行为。
import { LIMB_IDS, type MapDef, type PlayerState } from "../../shared/game.js";
import type { Room } from "../state.js";

/** Effective squad count: sandbox always plays solo even if config carries teams. */
export const teamCountOf = (room: Room): number => (room.mode === "sandbox" ? 0 : room.config.teams ?? 0);

/** M30 friendly-fire gate: squadmates (teams mode only) are on the same side. */
export const sameTeam = (room: Room, a: PlayerState | undefined, b: PlayerState | undefined): boolean => {
  if (!a || !b || a === b) return false;
  const teams = teamCountOf(room);
  return teams > 0 && a.teamId !== undefined && b.teamId !== undefined && a.teamId === b.teamId;
};

/**
 * Even the roster out across `teams` squads, deterministically by roster order.
 * Players already on a valid squad keep it while that squad is within the
 * ideal capacity (ceil(n/teams)) — so a mid-lobby join lands the newcomer on
 * the thinnest squad instead of reshuffling everyone. Stale ids (a squad that
 * no longer exists after a teams-count change) re-enter the assignment pool.
 */
export function rebalanceTeams(room: Room) {
  const teams = teamCountOf(room);
  const roster = [...room.players.values()];
  if (!teams) {
    for (const player of roster) player.teamId = undefined;
    return;
  }
  const capacity = Math.ceil(roster.length / teams);
  const counts = new Array(teams + 1).fill(0) as number[];
  for (const player of roster) {
    if (player.teamId !== undefined && player.teamId >= 1 && player.teamId <= teams && counts[player.teamId] < capacity) {
      counts[player.teamId] += 1;
    } else {
      player.teamId = undefined;
    }
  }
  for (const player of roster) {
    if (player.teamId !== undefined) continue;
    let pick = 1;
    for (let teamId = 2; teamId <= teams; teamId++) if (counts[teamId] < counts[pick]) pick = teamId;
    player.teamId = pick;
    counts[pick] += 1;
  }
}

/**
 * M30 spawn selection. FFA keeps the M29 contract exactly (`spawns[index % 4]`).
 * Team matches: the M29 spawn order alternates L,R,L,R, so even indices sit on
 * the west half and odd indices on the east half. Two squads each hold one
 * half (teammates spread across their half's pads); three or four squads take
 * one of the four primary pads per squad, with overflow teammates falling back
 * to the FFA rotation (room cap is 4, so overflow is rare: only a 2-person
 * squad inside a 3-squad match).
 */
export function pickSpawn(room: Room, map: MapDef, player: PlayerState, index: number): { x: number; y: number } {
  const teams = teamCountOf(room);
  if (!teams || player.teamId === undefined) return map.spawns[index % 4];
  const spawns = map.spawns;
  const mates = [...room.players.values()].filter((mate) => mate.teamId === player.teamId);
  const mateIndex = Math.max(0, mates.indexOf(player));
  if (teams === 2) {
    const pool = spawns.filter((_, spawnIndex) => spawnIndex % 2 === (player.teamId === 1 ? 0 : 1));
    if (pool.length) return pool[mateIndex % pool.length];
  } else if (mateIndex < 4) {
    // One primary pad per squad keeps every squad's first pilot in its own
    // corner; pad order follows squad id for a deterministic spread.
    return spawns[player.teamId - 1];
  }
  return spawns[index % 4];
}

export type TeamStanding = {
  teamId: number;
  /** Sum of remaining lives (eliminated members contribute 0). */
  lives: number;
  /** Sum of limb integrity — the FFA timeout tiebreaker, squad-flavoured. */
  limbs: number;
  /** True while any member still has lives or is awaiting respawn. */
  alive: boolean;
  /** Members ordered by lives then limbs — the squad's lead pilot first. */
  members: PlayerState[];
};

/**
 * Squad standings for results/timeout resolution. The alive predicate mirrors
 * tick.ts's FFA "alive" set (`lives > 0 || respawnTimer > 0`); it is computed
 * here inline because damage.ts (which owns isEliminated) sits above this
 * module in the dependency graph.
 */
export function teamStandings(room: Room): TeamStanding[] {
  const squads = new Map<number, TeamStanding>();
  for (const player of room.players.values()) {
    if (player.teamId === undefined) continue;
    const squad = squads.get(player.teamId) ?? { teamId: player.teamId, lives: 0, limbs: 0, alive: false, members: [] };
    squad.lives += Math.max(0, player.lives);
    squad.limbs += LIMB_IDS.reduce((sum, limbId) => sum + player.limbs[limbId], 0);
    if (player.lives > 0 || player.respawnTimer > 0) squad.alive = true;
    squad.members.push(player);
    squads.set(player.teamId, squad);
  }
  const byPilot = (a: PlayerState, b: PlayerState) => b.lives - a.lives || LIMB_IDS.reduce((sum, id) => sum + b.limbs[id], 0) - LIMB_IDS.reduce((sum, id) => sum + a.limbs[id], 0);
  return [...squads.values()]
    .map((squad) => ({ ...squad, members: [...squad.members].sort(byPilot) }))
    .sort((a, b) => b.lives - a.lives || b.limbs - a.limbs || a.teamId - b.teamId);
}
