<#
.SYNOPSIS
    Install MetaFlow VSIX into a single VS Code profile.
#>
param(
    [Parameter(Mandatory)]
    [string]$VsixPath,

    [Parameter()]
    [ValidateSet('code', 'code-insiders')]
    [string]$Cli = 'code-insiders',

    [Parameter()]
    [string]$ProfileName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $VsixPath)) {
    throw "VSIX not found: $VsixPath"
}

if (-not (Get-Command $Cli -ErrorAction SilentlyContinue)) {
    throw "CLI '$Cli' not found in PATH."
}

if ([string]::IsNullOrWhiteSpace($ProfileName)) {
    Write-Host "Installing via $Cli CLI (default profile)..."
    & $Cli --install-extension $VsixPath --force
}
else {
    Write-Host "Installing via $Cli CLI (profile: $ProfileName)..."
    & $Cli --profile $ProfileName --install-extension $VsixPath --force
}

Write-Host "`nDone. Reload VS Code window to pick up the extension."
