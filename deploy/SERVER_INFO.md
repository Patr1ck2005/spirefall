# SERVER_INFO — Spirefall 开服事实清单

> 面向未来的 Agent：这里是全部运行事实，无操作步骤。改动任何一项时更新本文件。
> 敏感值（VPS 密码除外）直接可读；本文件已提交 git，VPS 密码不入库。

## 一句话架构

朋友浏览器 → **阿里云 VPS `8.137.49.1:7100`**（frps 转发）→ frp 隧道（出站）→ **房主 PC `127.0.0.1:8787`**（Spirefall 游戏服务器 + 同端口托管的网页）。
游戏模拟全部在房主 PC；VPS 只转发流量。房主关机/关进程 = 链接失效。

## 公网入口

- 朋友玩：`http://8.137.49.1:7100`（网页 + 联机同端口）
- 房主本地玩：`http://localhost:8787`（单端口模式）或 dev 模式 `http://localhost:5173`（vite + 8787 分离）

## VPS（阿里云轻量应用服务器）

| 项 | 值 |
|---|---|
| 实例 | `Ubuntu-ehgd`（成都/西南1，dde9e4285c0b445casebbdff97c9e350） |
| 镜像 | Ubuntu 24.04.2 LTS，x86_64，2C2G，40G ESSD |
| 公网 IP | `8.137.49.1`，私网 `172.18.13.127` |
| 到期 | 2027-09-07 |
| 登录 | root + 密码（密码只在会话内传达，不入库；遗忘用控制台「重置密码」+ 重启生效） |
| SSH 指纹 | `SHA256:9R2TLUCBdLB6caYkquSB3ee/U8tikeqLqWoXILZkopk`（ed25519） |
| 阿里云防火墙 | 已应用模板 `ft-gi8jx0mmjmixyprsn`：放行 TCP 22 / 7000 / 7100（0.0.0.0/0） |
| VPS 本机防火墙 | ufw inactive，iptables 空策略 ACCEPT——**唯一关卡是阿里云控制台防火墙** |

### VPS 上的 frps

| 项 | 值 |
|---|---|
| 二进制 | `/usr/local/bin/frps`（frp 0.61.1） |
| 配置 | `/etc/frps.toml`：`bindPort = 7000` + auth.token |
| auth.token | `x4aKYmCaxLbU8fhfg8Tgrf3rG6cBA` |
| 服务 | systemd 单元 `frps.service`，enabled，`systemctl restart frps` 即可 |
| 日志 | `journalctl -u frps` |

## 房主 PC

| 项 | 值 |
|---|---|
| frpc | `%LOCALAPPDATA%\Spirefall\frpc.exe`（0.61.1；Windows Defender 对其误报，已加排除路径 `C:\Users\35311\AppData\Local\Spirefall` + 排除进程 frpc.exe） |
| frpc 配置 | `deploy/frpc.toml`（含 token，**已 gitignore 不入库**；模板 `deploy/frpc.template.toml` 入库） |
| frpc 隧道 | 8.137.49.1:7000 ←出站；对外暴露 7100 → 本机 8787 |
| 代理坑 | 本机 Clash 系统代理 `127.0.0.1:7890` 会劫持 frpc 出站（DSH 会话环境注入 HTTP_PROXY）——启动 frpc 前必须清空 `HTTP_PROXY/HTTPS_PROXY/ALL_PROXY`（`deploy/start-frp.ps1` 已处理） |

## 端口一览

| 端口 | 归属 | 协议 | 阿里云防火墙 |
|---|---|---|---|
| 22 | VPS SSH | TCP | 开 |
| 7000 | frps 控制通道 | TCP | 开 |
| 7100 | 游戏公网入口（frp 转发目标） | TCP | 开 |
| 8787 | 房主 PC：游戏服务器 + 单端口网页（dist/ 存在时） | TCP | 无需（隧道出站） |
| 5173 | 房主 PC：vite dev（可选，不参与公网链路） | TCP | 无需 |
| 3080 | DSH Web 服务 | TCP | **与本项目无关，永不动** |

## 相关文件（仓库内）

- `deploy/frp-server-setup.sh` — VPS 在线安装（需 GitHub 可达；VPS 上不可达，故实际用下面的离线版）
- `deploy/frps-offline-setup.sh` — VPS 离线安装（配合本地下载的 `frp_0.61.1_linux_amd64.tar.gz` 上传执行）；**重新生成 token 会打印到 stdout**
- `deploy/frpc.template.toml` — 客户端模板（占位符：VPS_IP_PLACEHOLDER / TOKEN_PLACEHOLDER）
- `deploy/start-frp.ps1` — 房主一键：下载 frpc（首次）、生成 frpc.toml、启动隧道（自动清代理环境变量）
- `deploy/README.md` — 含架构图与注意事项（frp 明文传输、带宽建议等）

## 日常开一局（事实速记）

1. `npm start`（起 8787；`npm run build` 只在客户端代码变更后需要重跑）
2. 启动 frpc（`deploy/start-frp.ps1` 或手工清代理后 `frpc.exe -c deploy/frpc.toml`）
3. 朋友访问 `http://8.137.49.1:7100`；房主访问 `http://localhost:8787`

## 排障速查（按历史故障率排序）

1. **朋友 502** → 房主 PC 的 8787 没起（`npm start` 挂了）——frps 会正确应答但后端拒绝
2. **frpc 连不上 7000（i/o timeout）** → 阿里云防火墙规则被删/模板未「应用至实例」——用 `Test-NetConnection 8.137.49.1 -Port 7000` 验证
3. **frpc 报连 `127.0.0.1:7890` 被拒/重置** → Clash 代理劫持——清环境变量重启 frpc
4. **新环境部署 VPS** → 走离线安装脚本，GitHub 从 VPS 不可达
5. **Defender 删 frpc.exe** → 排除项在重装系统/新机后需重加
