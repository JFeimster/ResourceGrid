[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Reconcile','Promote')]
    [string]$Mode,

    [string]$RunId,

    [ValidateRange(0,100)]
    [int]$TranscriptLimit = 12
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    & $Command
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
    if ($code -ne 0) { throw "$Label failed with exit code $code" }
}

function Invoke-Captured {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )
    Write-Host "`n=== $Label ===" -ForegroundColor Cyan
    & $Command 2>&1 | ForEach-Object { Write-Host $_ }
    $code = $LASTEXITCODE
    if ($null -eq $code) { $code = 0 }
    return [int]$code
}

$branch = (git branch --show-current).Trim()
$head = (git rev-parse HEAD).Trim()
if ($branch -ne 'main') {
    throw "YouTube Batch 1 is expected to run on main. Current branch: $branch"
}

Write-Host "ResourceGrid YouTube Intelligence v2 - Batch 1" -ForegroundColor Green
Write-Host "Repo:   $RepoRoot"
Write-Host "Branch: $branch"
Write-Host "HEAD:   $head"
Write-Host "`nWorking tree before run:"
git status --short

if ($Mode -eq 'Reconcile') {
    if ([string]::IsNullOrWhiteSpace($RunId)) {
        $RunId = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    }

    Write-Host "`nRun ID: $RunId" -ForegroundColor Yellow
    if ($env:YOUTUBE_API_KEY) {
        Write-Host "YouTube Data API credential: available from environment (value not displayed)."
    } else {
        Write-Host "YouTube Data API credential: not configured; pipeline will use yt-dlp if available."
    }

    $yt = Get-Command yt-dlp -ErrorAction SilentlyContinue
    if ($yt) { Write-Host "yt-dlp: available ($($yt.Source))" }
    else { Write-Host "yt-dlp: not found. API-only mode will be used if YOUTUBE_API_KEY is configured." }

    Invoke-Checked 'Inventory raw YouTube source' {
        node scripts/youtube/inventory-youtube.js --run-id $RunId
    }
    Invoke-Checked 'Normalize YouTube source' {
        node scripts/youtube/normalize-youtube.js --run-id $RunId
    }
    Invoke-Checked 'Selective transcript enrichment' {
        node scripts/youtube/enrich-youtube.js --run-id $RunId --transcript-limit $TranscriptLimit
    }
    Invoke-Checked 'Reconcile against canonical ResourceGrid' {
        node scripts/youtube/reconcile-youtube.js --run-id $RunId
    }

    $summary = Join-Path $RepoRoot "reconciliation/youtube-v2-batch-1/$RunId/summary.json"
    Write-Host "`nRECONCILIATION COMPLETE - NO CANONICAL MUTATION PERFORMED" -ForegroundColor Green
    Write-Host "Summary: $summary"
    Write-Host "Promotion plan: reconciliation/youtube-v2-batch-1/$RunId/promotion-plan.json"
    Write-Host "`nReview those reports before running Promote mode."
    Write-Host "`nWorking tree after reconciliation:"
    git status --short
    exit 0
}

# Promote mode
if ([string]::IsNullOrWhiteSpace($RunId)) {
    $pointer = Join-Path $RepoRoot 'reconciliation/youtube-v2-batch-1/latest-run.json'
    if (-not (Test-Path $pointer)) {
        throw 'No RunId supplied and no latest-run.json exists. Run Reconcile mode first.'
    }
    $RunId = (Get-Content -Raw $pointer | ConvertFrom-Json).run_id
}

Write-Host "`nPromoting reconciliation run: $RunId" -ForegroundColor Yellow
Invoke-Checked 'Promote reconciled canonical changes' {
    node scripts/youtube/promote-youtube.js --run-id $RunId
}

$registryExit = Invoke-Captured 'npm run registry:build' { npm run registry:build }
$lintExit = Invoke-Captured 'npm run lint' { npm run lint }
$buildExit = Invoke-Captured 'npm run build' { npm run build }

Write-Host "`n=== Final YouTube Batch 1 report ===" -ForegroundColor Cyan
node scripts/youtube/report-youtube.js --run-id $RunId --registry-build-exit $registryExit --lint-exit $lintExit --build-exit $buildExit
$reportExit = $LASTEXITCODE
if ($null -eq $reportExit) { $reportExit = 0 }

Write-Host "`n=== Git status ===" -ForegroundColor Cyan
git status --short
Write-Host "`n=== Git diff --stat ===" -ForegroundColor Cyan
git diff --stat
Write-Host "`n=== Git diff --name-status ===" -ForegroundColor Cyan
git diff --name-status

Write-Host "`nNo commit, push, deployment, API-key creation, or external mutation was performed by this orchestrator." -ForegroundColor Yellow

if ($registryExit -ne 0 -or $lintExit -ne 0 -or $buildExit -ne 0 -or $reportExit -ne 0) {
    throw "Batch 1 completed with validation/report failures. registry:build=$registryExit lint=$lintExit build=$buildExit report=$reportExit"
}

Write-Host "`nYouTube Intelligence v2 - Batch 1 completed locally. STOP BEFORE COMMIT/PUSH." -ForegroundColor Green
