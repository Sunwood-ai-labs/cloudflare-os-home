param(
  [int]$LocalPort = 8877,
  [int]$ServePort = 8877
)

$ErrorActionPreference = 'Stop'
$tailscale = Get-Command tailscale -ErrorAction SilentlyContinue
if (-not $tailscale) {
  throw 'tailscale.exe was not found on PATH.'
}

tailscale serve --bg "--https=$ServePort" "http://127.0.0.1:$LocalPort"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$status = tailscale status --json | ConvertFrom-Json
$dnsName = $status.Self.DNSName.TrimEnd('.')
Write-Output "TAILSCALE_URL=https://$dnsName`:$ServePort/"
tailscale serve status
