# Exit 0 if http://127.0.0.1:<port>/elderly-app/ responds (Apache + deploy OK). Else 1.
$projectRoot = Split-Path -Parent $PSScriptRoot
$port = 80
$portFile = Join-Path $projectRoot "ngrok_upstream_port.txt"
if (Test-Path $portFile) {
  $line = (Get-Content $portFile -TotalCount 1).Trim()
  if ($line -match '^\d+$') { $port = [int]$line }
}
$url = "http://127.0.0.1:$port/elderly-app/"
try {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
  if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 }
} catch {}
exit 1
