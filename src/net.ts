// M28.5 结构拆分：网络层——WebSocket 连接、发送与消息入口。
// 协议之外的一切（DOM 状态、场景引用）通过 session 与 initNet 注入的回调解耦，
// 因此本模块不 import ui（ui 反过来用 send），无循环。
import { i18n } from "./i18n";
import { session } from "./session";

// WebSocket endpoint resolution (M23 single-port hosting):
// - vite dev (port 5173): the server runs separately on :8787.
// - Same-port hosting (server serves dist/ on :8787) or a tunnel: the page
//   and the WebSocket share the origin, so connect to the page's own host.
const isViteDev = location.port === "5173";
const endpoint = `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname || "localhost"}${isViteDev ? ":8787" : location.port ? `:${location.port}` : ""}`;

let socket: WebSocket | undefined;
let messageHandler: ((message: any) => void) | undefined;
let getName: () => string = () => "Player";
let reportStatus: (text: string, tone?: string) => void = () => {};
let reportError: (text: string) => void = () => {};

export function initNet(overrides: {
  getName?: () => string;
  onStatus?: (text: string, tone?: string) => void;
  onError?: (text: string) => void;
  onMessage: (message: any) => void;
}) {
  if (overrides.getName) getName = overrides.getName;
  if (overrides.onStatus) reportStatus = overrides.onStatus;
  if (overrides.onError) reportError = overrides.onError;
  messageHandler = overrides.onMessage;
}

export function connect(): WebSocket {
  if (socket && socket.readyState <= WebSocket.OPEN) return socket;
  socket = new WebSocket(endpoint);
  socket.onopen = () => {
    reportStatus(i18n.t("statusLinked"), "good");
    if (!session.resumeAttempted && !session.manualConnectionAction) {
      session.resumeAttempted = true;
      const saved = JSON.parse(localStorage.getItem("spirefall-session") || "null");
      if (saved?.roomCode && saved?.token && saved?.selfId) {
        socket!.send(JSON.stringify({ type: "join", roomCode: saved.roomCode, name: getName(), token: saved.token, playerId: saved.selfId }));
      }
    }
  };
  socket.onclose = () => reportStatus(i18n.t("statusLost"), "bad");
  socket.onerror = () => reportError(i18n.t("errServerNoAnswer"));
  socket.onmessage = (event) => messageHandler?.(JSON.parse(event.data));
  return socket;
}

export function send(type: string, payload: Record<string, unknown> = {}) {
  const ws = connect();
  const run = () => ws.send(JSON.stringify({ type, ...payload }));
  if (ws.readyState === WebSocket.OPEN) run();
  else ws.addEventListener("open", run, { once: true });
}
