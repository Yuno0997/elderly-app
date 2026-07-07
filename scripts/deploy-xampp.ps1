$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $projectRoot "build"
$xamppHtdocs = "C:\xampp\htdocs"
$appDir = Join-Path $xamppHtdocs "elderly-app"
$templatesDir = Join-Path $projectRoot "xampp"

& (Join-Path $PSScriptRoot "sync-xampp-apache-config.ps1")

Write-Host "Building frontend..."
Push-Location $projectRoot
try {
  # Build assets with correct subfolder base for XAMPP deployment.
  $env:BASE_PATH = "/elderly-app/"
  npm run build
} finally {
  Pop-Location
}

if (!(Test-Path $buildDir)) {
  throw "Build folder not found at $buildDir"
}

Write-Host "Deploying build to $appDir ..."
New-Item -ItemType Directory -Force -Path $appDir | Out-Null

# Clean old build (keep directory)
Get-ChildItem -Path $appDir -Force | Remove-Item -Recurse -Force

# Copy new build
Copy-Item -Path (Join-Path $buildDir "*") -Destination $appDir -Recurse -Force

# Add SPA rewrite rules
$htaccessTemplate = Join-Path $templatesDir ".htaccess"
if (Test-Path $htaccessTemplate) {
  Copy-Item -Path $htaccessTemplate -Destination (Join-Path $appDir ".htaccess") -Force
}

Write-Host ""
Write-Host "Done."
Write-Host "Next:"
Write-Host "1) Start Apache in XAMPP (port 80)."
Write-Host "2) Start backend in this project: npm run start"
Write-Host "3) Start tunnel: npm run tunnel:ngrok"
Write-Host ""
Write-Host "Apache proxy snippet source: $templatesDir\apache-elderly-app.conf (synced to C:\xampp\apache\conf\extra\)"
