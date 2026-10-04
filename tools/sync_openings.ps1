<#
.SYNOPSIS
    Copy the opening dashboard from the Chess Opening Dashboard repo into this site's openings/ slot.

.DESCRIPTION
    The dashboard is built as a Quarto OJS page in the Chess Opening Dashboard repo, under dashboard/
    (see that repo's docs/opening-dashboard-spec.md, section 5). This script copies that folder's page
    source and data into openings/ here, so the page renders inside dnield.com with the site's navbar
    and theme.

    The page itself is copied, not its build output. Quarto build and project files are skipped:
    _quarto.yml, _publish.yml, .quarto/, _site/, _freeze/, *_files/, __pycache__/, .ipynb_checkpoints/.
    The dashboard's index.qmd replaces the placeholder openings/index.qmd. Restore the placeholder with
    `git checkout -- openings/index.qmd`.

    With -Clean, everything in openings/ is deleted before the copy, so files removed upstream don't
    linger. Without it, files are added or overwritten only.

    The script only copies files. It never renders, commits or publishes. After syncing, run
    `quarto render` (or `quarto preview`) and check the Openings page.

.PARAMETER Source
    The dashboard folder. Defaults to C:\Users\David\Documents\Chess Opening Dashboard\dashboard.

.PARAMETER Clean
    Empty openings/ before copying.

.PARAMETER DryRun
    List what would be copied, then exit without changing anything.

.EXAMPLE
    .\tools\sync_openings.ps1 -DryRun

.EXAMPLE
    .\tools\sync_openings.ps1 -Clean
#>
[CmdletBinding()]
param(
    [string]$Source = 'C:\Users\David\Documents\Chess Opening Dashboard\dashboard',
    [switch]$Clean,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$siteRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $siteRoot 'openings'

if (-not (Test-Path -LiteralPath $Source -PathType Container)) {
    throw "Dashboard folder not found: $Source"
}
if (-not (Test-Path -LiteralPath (Join-Path $Source 'index.qmd'))) {
    throw "No index.qmd in $Source. Is this the dashboard folder?"
}

$skipFiles = @('_quarto.yml', '_publish.yml')
$skipDirs = @('.quarto', '_site', '_freeze', '__pycache__', '.ipynb_checkpoints')

$sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
$files = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($sourceRoot.Length + 1)
    $parts = $rel.Split([char[]]'\/')
    $dirs = if ($parts.Count -gt 1) { $parts[0..($parts.Count - 2)] } else { @() }
    -not ($parts.Count -eq 1 -and $skipFiles -contains $_.Name) -and
    -not ($dirs | Where-Object { $skipDirs -contains $_ -or $_ -like '*_files' })
}

$totalMB = [math]::Round((($files | Measure-Object Length -Sum).Sum) / 1MB, 1)
Write-Host "Source:      $sourceRoot"
Write-Host "Destination: $dest"
Write-Host "Files:       $($files.Count) ($totalMB MB)"

if ($DryRun) {
    $files | ForEach-Object { '  ' + $_.FullName.Substring($sourceRoot.Length + 1) }
    Write-Host 'Dry run: nothing copied.'
    return
}

if ($Clean -and (Test-Path -LiteralPath $dest)) {
    Get-ChildItem -LiteralPath $dest -Force | Remove-Item -Recurse -Force
}

foreach ($f in $files) {
    $rel = $f.FullName.Substring($sourceRoot.Length + 1)
    $target = Join-Path $dest $rel
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $f.FullName -Destination $target -Force
}

Write-Host "Copied $($files.Count) files into openings/. Next: quarto render, then check the Openings page."
