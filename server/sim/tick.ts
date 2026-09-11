// M28.5 结构拆分：tick 编排——每帧按序推进机关/移动平台/bot/机师/箱子/桶/弹道，
// 并做比赛终局判定（超时排名 + 全灭结算）。
// 依赖方向：tick → { players, world, projectiles, damage, state, bots }。
import { LIMB_IDS, MAPS, MATCH_TIME_LIMIT_TICKS, calculateMoverState, type MapDef } from "../../shared/game.js";
import { broadcastSnapshot, type Room } from "../state.js";
import { getBotInput, updateBots } from "../bots.js";
import { isEliminated } from "./damage.js";
import { stepThrowables } from "./items.js";
import { updateMobs } from "./mobs.js";
import { stepPlayer } from "./players.js";
import { stepProjectiles } from "./projectiles.js";
import { teamStandings } from "./teams.js";
import { updateCrates, updateHazards, updateProps } from "./world.js";

export function updateRoom(room: Room, dt: number) {
  if (room.phase !== "playing") return;
  room.tick++;
  const map: MapDef = MAPS[room.config.mapId];
  const previousHazards = room.hazards.map((hazard) => ({ ...hazard }));
  updateHazards(room, previousHazards, dt);
  room.movers = MAPS[room.config.mapId].movers.map((def) => calculateMoverState(def, room.tick));
  updateBots(room, dt);

  for (const player of room.players.values()) {
    const client = room.clients.get(player.id);
    if (client) {
      if (!player.connected) continue;
      stepPlayer(room, map, player, client.input, dt);
    } else {
      // No socket entry: a bot pilot. Its controller supplies the input.
      const input = getBotInput(room, player);
      if (!input) continue;
      stepPlayer(room, map, player, input, dt);
    }
  }

  updateCrates(room);
  updateProps(room, dt);
  // M31 hostile mobs step after props so their contact lands before the
  // projectile sweep; they never count toward the win conditions below.
  updateMobs(room, map, dt);
  // M32 thrown pocket items (grenade/flashbang fuses) before projectiles so a
  // detonation lands in the same tick its fuse expires.
  stepThrowables(room, map, dt);
  stepProjectiles(room, map, dt);

  if (room.mode === "match") {
    // M30 team resolution: a squad loses when every member is eliminated;
    // timeouts rank squads by total remaining lives (limb integrity breaks
    // ties). `winner` stays a player id — the lead pilot of the best squad —
    // and clients group the results screen by teamId.
    if ((room.config.teams ?? 0) > 0) {
      const standings = teamStandings(room);
      const aliveTeams = standings.filter((squad) => squad.alive);
      if (room.tick > MATCH_TIME_LIMIT_TICKS && aliveTeams.length > 1) {
        room.phase = "results";
        room.winner = standings[0]?.members[0]?.id;
        broadcastSnapshot(room);
        return;
      }
      if (aliveTeams.length <= 1) {
        room.phase = "results";
        room.winner = aliveTeams[0]?.members[0]?.id;
        broadcastSnapshot(room);
        return;
      }
      return;
    }
    const alive = [...room.players.values()].filter((player) => !isEliminated(room, player) && (player.lives > 0 || player.respawnTimer > 0));
    // Match time limit: any stalemate (camping, unreachable standoff) resolves
    // at 4 minutes — most lives, then most intact limbs wins. Winner is stored
    // as the player ID: display names are not unique.
    if (room.tick > MATCH_TIME_LIMIT_TICKS && alive.length > 1) {
      room.phase = "results";
      const ranked = [...alive].sort((a, b) => b.lives - a.lives || (LIMB_IDS.reduce((sum, id) => sum + b.limbs[id], 0) - LIMB_IDS.reduce((sum, id) => sum + a.limbs[id], 0)));
      room.winner = ranked[0]?.id;
      broadcastSnapshot(room);
      return;
    }
    if (alive.length <= 1) {
      room.phase = "results";
      room.winner = alive[0]?.id;
      // The tick loop freezes at results, so the periodic broadcast may never
      // fire again — push the final snapshot explicitly so every client
      // actually sees the results screen.
      broadcastSnapshot(room);
    }
  }
}
