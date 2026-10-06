# Builds a ready-to-load zip of the extension:  packages/Claude-Usage-Monitor-v<version>-chrome-edge.zip
# Usage (Windows PowerShell 5.1 or pwsh):   powershell -ExecutionPolicy Bypass -File scripts/package.ps1
param(
  [string]$OutputDir = "packages"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..")
$ManifestPath = Join-Path $RepoRoot "manifest.json"

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  throw "manifest.json was not found at $ManifestPath"
}

$Manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$Version = $Manifest.version
if (-not $Version) {
  throw "manifest.json does not contain a version"
}

$PackageDir = Join-Path $RepoRoot $OutputDir
New-Item -ItemType Directory -Force -Path $PackageDir | Out-Null

$ZipName = "Claude-Usage-Monitor-v$Version-chrome-edge.zip"
$ZipPath = Join-Path $PackageDir $ZipName

$TempBase = Join-Path ([System.IO.Path]::GetTempPath()) ("cum-package-" + [System.Guid]::NewGuid().ToString("N"))
$Stage = Join-Path $TempBase "Claude-Usage-Monitor"
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

# Everything the browser needs to load the extension (keep in sync with manifest.json).
$Files = @(
  "manifest.json",
  "background.js",
  "shared.js",
  "i18n.js",
  "content.js",
  "float_only.js",
  "popup.html",
  "popup.js",
  "icon.png",
  "README.md"
)

try {
  foreach ($File in $Files) {
    $Source = Join-Path $RepoRoot $File
    if (-not (Test-Path -LiteralPath $Source)) {
      throw "Required package file is missing: $File"
    }
    Copy-Item -LiteralPath $Source -Destination $Stage
  }

  if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
  }

  Compress-Archive -LiteralPath $Stage -DestinationPath $ZipPath -Force

  # Verify the archive really contains a loadable manifest at the expected path.
  $VerifyBase = Join-Path ([System.IO.Path]::GetTempPath()) ("cum-verify-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $VerifyBase | Out-Null
  try {
    Expand-Archive -LiteralPath $ZipPath -DestinationPath $VerifyBase -Force
    $PackedManifestPath = Join-Path $VerifyBase "Claude-Usage-Monitor\manifest.json"
    if (-not (Test-Path -LiteralPath $PackedManifestPath)) {
      throw "Packaged zip does not contain Claude-Usage-Monitor/manifest.json"
    }
    Get-Content -LiteralPath $PackedManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null
  }
  finally {
    if (Test-Path -LiteralPath $VerifyBase) {
      Remove-Item -LiteralPath $VerifyBase -Recurse -Force
    }
  }

  $Item = Get-Item -LiteralPath $ZipPath
  Write-Host "Created $($Item.FullName)"
  Write-Host "Size: $($Item.Length) bytes"
}
finally {
  if (Test-Path -LiteralPath $TempBase) {
    Remove-Item -LiteralPath $TempBase -Recurse -Force
  }
}
