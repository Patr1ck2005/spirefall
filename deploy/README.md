# Spirefall 远程联机部署指南（国内低延迟：frp 方案）

## 架构

```
朋友的浏览器 ──→ 国内 VPS :7100 (frp 服务端)
                      │  frp 隧道（出站，你家无需公网 IP/开端口）
你家的电脑 :8787 ←──────┘  (frp 客户端 + Spirefall 游戏服务器)
```

朋友只需打开 `http://<VPS_IP>:7100` —— 一个地址，网页 + 联机全通。
链路全程在国内，延迟 = 朋友↔VPS + VPS↔你家 ≈ 20-80ms（对比 trycloudflare 的 ~2000ms）。

## 一次性准备

1. **租 VPS**（阿里云/腾讯云轻量，Ubuntu 22.04，2核2G 足够，30-60元/月）。
   控制台**安全组**放行端口：`22`、`7000`、`7100`。
2. 上传并运行服务端脚本（在 VPS 上）：

```bash
# 本机 PowerShell 执行（把 <VPS_IP> 和密码替换）
scp deploy\frp-server-setup.sh root@<VPS_IP>:/root/
ssh root@<VPS_IP> "bash /root/frp-server-setup.sh"
```

脚本最后会打印一个 **TOKEN**，复制它。

3. 本机生成 frp 客户端配置（PowerShell）：

```powershell
.\deploy\start-frp.ps1 -VpsIp <VPS_IP> -Token <上一步的TOKEN>
```

它会写好 `deploy\frpc.toml` 并立即启动 frpc 隧道。

4. 验证：浏览器打开 `http://<VPS_IP>:7100` —— 看到游戏主菜单即成功。

## 日常开一局的流程

```powershell
npm start                 # 游戏服务器（8787）
.\deploy\start-frp.ps1 -VpsIp <VPS_IP> -Token <TOKEN>   # frpc 隧道
```

两个窗口保持开着；把 `http://<VPS_IP>:7100` 发给朋友。玩完关窗口，链接失效。

## 注意

- frp 流量在朋友→VPS→你家之间走公网，**游戏输入本身没有加密**。朋友是你自己拉的，风险可控；介意的话后续可以给 frp 加 TLS（`transport.tls.enable = true`，frps/frpc 同开）。
- VPS 带宽决定体验下限：2-4 人开黑建议 ≥3Mbps 峰值（轻量服务器默认带宽通常够用）。
- VPS 只做转发，不跑游戏逻辑——游戏模拟仍在你的电脑上（服务器权威架构不变，清洁室边界无影响）。
