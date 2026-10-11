param([string]$Destination='docs/licenses/rust', [string]$Target='x86_64-pc-windows-msvc')
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot)
$metadata = cargo metadata --locked --filter-platform $Target --format-version 1 --manifest-path src-tauri/Cargo.toml | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Cargo metadata failed' }
New-Item -ItemType Directory -Force $Destination | Out-Null
$inventory = foreach ($package in $metadata.packages) {
    if (!$package.source) { continue }
    $root = Split-Path $package.manifest_path
    $files = Get-ChildItem -LiteralPath $root -File | Where-Object { $_.Name -match '^(LICENSE|COPYING|NOTICE)' }
    foreach ($file in $files) {
        Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $Destination "$($package.name)-$($package.version)-$($file.Name)")
    }
    [pscustomobject]@{ name=$package.name; version=$package.version; license=$package.license; notices=@($files.Name) }
}
$inventory | ConvertTo-Json -Depth 5 | Set-Content docs/licenses/rust-inventory.json
if ($inventory | Where-Object { !$_.license }) { throw 'Dependencies with unspecified licenses require review' }
