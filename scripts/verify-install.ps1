$ErrorActionPreference = 'Stop'
Get-Process Lighthouse,LighthouseBridge -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
$installer = Get-ChildItem release -Filter 'Lighthouse*Setup*.exe' | Select-Object -First 1
if (-not $installer) { throw 'Installer executable not found in release/' }
$installDir = Join-Path $env:RUNNER_TEMP 'Lighthouse-install-check'
if (Test-Path -LiteralPath $installDir) { Remove-Item -Recurse -Force -LiteralPath $installDir }
$proc = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru -WindowStyle Hidden
$exe = Join-Path $installDir 'Lighthouse.exe'
for ($i = 0; $i -lt 30 -and -not (Test-Path -LiteralPath $exe); $i++) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Path -LiteralPath $exe)) { throw "Installed executable missing (installer=$($installer.Name), exit=$($proc.ExitCode))" }
$progId = (Get-Item 'Registry::HKEY_CURRENT_USER\Software\Classes\.lighthouse').GetValue('')
if (-not $progId) { throw 'Missing recording ProgID' }
$key = "Registry::HKEY_CURRENT_USER\Software\Classes\$progId"
$icon = (Get-Item -LiteralPath "$key\DefaultIcon").GetValue('')
$command = (Get-Item -LiteralPath "$key\shell\open\command").GetValue('')
if (-not $icon -or -not $command.Contains('Lighthouse.exe') -or -not $command.Contains('%1')) { throw 'Association icon or open command missing' }
$iconFile = ($icon -replace ',\d+$','').Trim('"')
if (-not (Test-Path -LiteralPath $iconFile)) { throw "Association icon file missing: $iconFile" }
$extension = (Get-Item 'Registry::HKEY_CURRENT_USER\Software\Classes\.lighthouse').GetValue('')
if ($extension -ne $progId) { throw 'Recording extension not registered' }
Add-Type -AssemblyName System.Drawing
if (-not [System.Drawing.Icon]::ExtractAssociatedIcon($exe)) { throw 'Installed executable icon missing' }
if ((Get-FileHash -LiteralPath $iconFile).Hash -ne (Get-FileHash native/icon.ico).Hash) { throw 'Registered icon differs from Lighthouse artwork' }
$desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Lighthouse.lnk'
$startLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Lighthouse.lnk'
foreach ($link in @($desktopLink, $startLink)) {
  if (-not (Test-Path -LiteralPath $link)) { throw "Shortcut missing: $link" }
  $shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($link)
  if ($shortcut.TargetPath -ne $exe) { throw 'Shortcut targets wrong executable' }
}
Write-Output 'Installed executable, branded file icon and open command verified.'
Get-Process Lighthouse -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force
