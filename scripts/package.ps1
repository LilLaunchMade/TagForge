$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot)
& npm run tauri -- build
if ($LASTEXITCODE -ne 0) { throw 'Native installer build failed' }
$installer=Get-ChildItem -LiteralPath src-tauri/target/release/bundle/nsis -Filter '*-setup.exe' | Select-Object -First 1
if (!$installer) { throw 'Installer was not produced' }
New-Item -ItemType Directory -Force release | Out-Null
Copy-Item -LiteralPath $installer.FullName -Destination release/TagForge-v1.0.0-Setup.exe
Get-FileHash release/TagForge-v1.0.0-Setup.exe -Algorithm SHA256 | Format-List | Out-File release/SHA256.txt
