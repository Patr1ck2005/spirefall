# Spirefall frp client launcher — runs on the HOST's PC (Windows).
# Usage: .\deploy\start-frp.ps1 -VpsIp 1.2.3.4 -Token <token-from-server-setup>
# Downloads frpc on first run, writes deploy\frpc.toml, starts the tunnel.
param(
  [Parameter(Mandatory = $true)][string]$VpsIp,
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$FrpcPath = "$env:LOCALAPPDATA\Spirefall\frpc.exe"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $FrpcPath)) {
  Write-Host "Downloading frpc..."
  New-Item (Split-Path $FrpcPath) -ItemType Directory -Force | Out-Null
  $version = "0.61.1"
  $zip = "$env:TEMP\frp_$version.zip"
  Invoke-WebRequest -Uri "https://github.com/fatedier/frp/releases/download/v$version/frp_${version}_windows_amd64.zip" -OutFile $zip -UseBasicParsing
  Expand-Archive $zip "$env:TEMP\frp-extract" -Force
  Copy-Item "$env:TEMP\frp-extract\frp_${version}_windows_amd64\frpc.exe" $FrpcPath
  Remove-Item $zip, "$env:TEMP\frp-extract" -Recurse -Force -ErrorAction SilentlyContinue
}

$deployDir = Split-Path $MyInvocation.MyCommand.Path
$confPath = Join-Path $deployDir "frpc.toml"
(Get-Content (Join-Path $deployDir "frpc.template.toml") -Raw) `
  -replace "VPS_IP_PLACEHOLDER", $VpsIp `
  -replace "TOKEN_PLACEHOLDER", $Token | Set-Content $confPath

Write-Host "Starting frpc -> ${VpsIp}:7000, exposing 8787 as ${VpsIp}:7100"
& $FrpcPath -c $confPath
