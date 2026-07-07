$ErrorActionPreference = "Stop"

# Copies Elderly App proxy snippet into XAMPP so httpd.conf's Include finds it.
# Expected in httpd.conf: Include "C:/xampp/apache/conf/extra/apache-elderly-app.conf"

$projectRoot = Split-Path -Parent $PSScriptRoot
$src = Join-Path $projectRoot "xampp\apache-elderly-app.conf"
$dst = "C:\xampp\apache\conf\extra\apache-elderly-app.conf"
$httpdConf = "C:\xampp\apache\conf\httpd.conf"
$expectedInclude = 'Include "C:/xampp/apache/conf/extra/apache-elderly-app.conf"'

if (!(Test-Path $src)) {
  throw "Missing Apache snippet: $src"
}

$xamppExtraDir = Split-Path -Parent $dst
if (!(Test-Path $xamppExtraDir)) {
  throw "XAMPP Apache extra directory not found: $xamppExtraDir (is XAMPP installed at C:\xampp?)"
}

Copy-Item -LiteralPath $src -Destination $dst -Force
Write-Host "Synced Apache config: $dst"

if (Test-Path $httpdConf) {
  $raw = Get-Content -LiteralPath $httpdConf -Raw
  $normalized = $raw
  # Remove stale machine-specific include lines left from copied projects.
  $normalized = [regex]::Replace(
    $normalized,
    '(?im)^\s*Include\s+"[^"]*apache-elderly-app\.conf"\s*\r?\n?',
    ''
  )
  if ($normalized -notmatch [regex]::Escape($expectedInclude)) {
    $normalized = $normalized.TrimEnd() + "`r`n`r`n# Elderly App (UI + API proxy)`r`n$expectedInclude`r`n"
  }
  if ($normalized -ne $raw) {
    Set-Content -LiteralPath $httpdConf -Value $normalized -Encoding utf8
    Write-Host "Updated Apache include in: $httpdConf"
  }
}

$httpd = "C:\xampp\apache\bin\httpd.exe"
if (Test-Path $httpd) {
  & $httpd -t
}
