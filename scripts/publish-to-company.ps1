# publish-to-company.ps1
# Downloads the built installer from personal GitHub and publishes it to company GitHub.
#
# Usage:
#   .\scripts\publish-to-company.ps1              # publishes latest version
#   .\scripts\publish-to-company.ps1 -Version v1.5.0  # publishes a specific version
#
# Requirements:
#   - gh CLI installed (https://cli.github.com)
#   - Logged in to personal GitHub:  gh auth login
#   - A Personal Access Token (PAT) for the company GitHub account with 'repo' scope,
#     set as the COMPANY_GH_TOKEN environment variable:
#       $env:COMPANY_GH_TOKEN = "ghp_xxxxxxxxxxxx"

param(
    [string]$Version
)

$personalRepo = "amruthasatishkumar/Work-Management"
$companyRepo  = "asatishkumar_microsoft/se-work-manager"

# ── Validate gh CLI is available ─────────────────────────────────────────────
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error "gh CLI not found. Install from https://cli.github.com"
    exit 1
}

# ── Resolve version ───────────────────────────────────────────────────────────
if (-not $Version) {
    Write-Host "Fetching latest release from personal GitHub..."
    $latestJson = gh release view --repo $personalRepo --json tagName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Could not fetch latest release: $latestJson"
        exit 1
    }
    $Version = ($latestJson | ConvertFrom-Json).tagName
}

Write-Host ""
Write-Host "Publishing $Version to company GitHub ($companyRepo)..."
Write-Host ""

# ── Download installer from personal GitHub ───────────────────────────────────
$tmpDir = "$env:TEMP\se-work-manager-publish"
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

Write-Host "Downloading installer from personal GitHub..."
gh release download $Version --repo $personalRepo --pattern "*.exe" --dir $tmpDir
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to download release assets for $Version"
    exit 1
}

$exePath = Get-ChildItem $tmpDir -Filter "*.exe" | Select-Object -First 1 -ExpandProperty FullName
if (-not $exePath) {
    Write-Error "No .exe found in release $Version. Has the GitHub Actions build finished?"
    exit 1
}

Write-Host "Downloaded: $(Split-Path $exePath -Leaf)"
Write-Host ""

# ── Publish to company GitHub ─────────────────────────────────────────────────
# Use COMPANY_GH_TOKEN env var to authenticate against the company account
if (-not $env:COMPANY_GH_TOKEN) {
    Write-Warning "COMPANY_GH_TOKEN not set. Set it to a PAT with 'repo' scope for $companyRepo"
    Write-Warning "  `$env:COMPANY_GH_TOKEN = 'ghp_xxxxxxxxxxxx'"
    exit 1
}

$env:GH_TOKEN = $env:COMPANY_GH_TOKEN

# Check if release already exists on company GitHub
$releaseCheck = gh release view $Version --repo $companyRepo 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Release $Version already exists on company GitHub. Uploading/replacing installer..."
    gh release upload $Version $exePath --repo $companyRepo --clobber
} else {
    Write-Host "Creating release $Version on company GitHub..."
    gh release create $Version $exePath `
        --repo $companyRepo `
        --title "SE Work Manager $Version" `
        --notes "Install the attached .exe to get SE Work Manager $Version.`n`nSee the [installation guide](https://github.com/$companyRepo/blob/main/docs/INSTALLATION.md) for first-time setup instructions."
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Done! Release available at:"
    Write-Host "  https://github.com/$companyRepo/releases/tag/$Version"
} else {
    Write-Error "Failed to publish to company GitHub."
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
$env:GH_TOKEN = $null
