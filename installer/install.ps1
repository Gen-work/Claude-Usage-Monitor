$ErrorActionPreference = 'Stop'
try {
  $Source = Join-Path $PSScriptRoot 'Claude-Usage-Monitor'
  if (-not (Test-Path -LiteralPath (Join-Path $Source 'manifest.json'))) {
    throw 'Extract the entire ZIP before running install.cmd.'
  }
  $Target = Join-Path $env:LOCALAPPDATA 'Claude-Usage-Monitor\extension'
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
  Get-ChildItem -LiteralPath $Source -File | Copy-Item -Destination $Target -Force
  Write-Host "Extension files installed at: $Target"
  Write-Host 'Open chrome://extensions (or edge://extensions).'
  Write-Host 'Enable Developer mode > Load unpacked > select the folder above.'
  Write-Host 'For updates, run this helper again and click Reload on the extension.'
  Write-Host 'Chrome requires this final manual step; browser policy is not bypassed.'
  Start-Process explorer.exe -ArgumentList ('"' + $Target + '"')
  $Chrome = @(
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($Chrome) { Start-Process -FilePath $Chrome -ArgumentList 'chrome://extensions/' }
} catch {
  Write-Error $_
  exit 1
}
