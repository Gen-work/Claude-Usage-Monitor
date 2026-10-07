# Compatibility entry point; the shared builder also produces installation helpers.
param([string]$OutputDir = 'packages')
$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'package.js') --output-dir $OutputDir
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
