<#
.SYNOPSIS
    Install the newest MetaFlow VSIX into one or more local VS Code clients/profiles.
#>
param(
    [Parameter()]
    [string]$WorkspaceRoot,

    [Parameter()]
    [string]$VsixRoot,

    [Parameter()]
    [string[]]$Cli = @(),

    [Parameter()]
    [string]$CliPath,

    [Parameter()]
    [string]$ProfileName,

    [Parameter()]
    [switch]$AllProfiles,

    [Parameter()]
    [ValidateRange(10, 600)]
    [int]$TimeoutSeconds = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-RecognizedCliName {
    param(
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    return @('code', 'code-insiders') -contains $Value.Trim().ToLowerInvariant()
}

function Expand-CliNames {
    param(
        [string[]]$Values
    )

    $expanded = New-Object System.Collections.Generic.List[string]
    foreach ($value in @($Values)) {
        if ([string]::IsNullOrWhiteSpace($value)) {
            continue
        }

        foreach ($segment in ($value -split '[,;]')) {
            $trimmed = $segment.Trim()
            if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
                $expanded.Add($trimmed)
            }
        }
    }

    return $expanded.ToArray()
}

$Cli = @(Expand-CliNames -Values $Cli)
if (-not [string]::IsNullOrWhiteSpace($VsixRoot) -and -not (Test-Path -LiteralPath $VsixRoot) -and (Test-RecognizedCliName -Value $VsixRoot)) {
    # Recover from PowerShell script invocation where repeated -Cli values spill into the next positional parameter.
    $Cli += $VsixRoot.Trim()
    $VsixRoot = $null
}

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
}
else {
    $WorkspaceRoot = (Resolve-Path -LiteralPath $WorkspaceRoot).Path
}

if ([string]::IsNullOrWhiteSpace($VsixRoot)) {
    $VsixRoot = Join-Path $WorkspaceRoot 'src'
}
else {
    $VsixRoot = (Resolve-Path -LiteralPath $VsixRoot).Path
}

$installScript = Join-Path $PSScriptRoot 'install-vsix.ps1'
if (-not (Test-Path -LiteralPath $installScript)) {
    throw "Install script not found: $installScript"
}

$vsix = Get-ChildItem -LiteralPath $VsixRoot -Filter '*.vsix' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $vsix) {
    throw "No VSIX found under $VsixRoot. Run MetaFlow: Package Extension VSIX first."
}

$targets = @()
if (-not [string]::IsNullOrWhiteSpace($CliPath)) {
    $targets += @{
        CliPath = $CliPath
    }
}
elseif ($Cli.Count -gt 0) {
    foreach ($cliName in $Cli) {
        if ([string]::IsNullOrWhiteSpace($cliName)) {
            continue
        }

        $targets += @{
            Cli = $cliName.Trim()
        }
    }
}
else {
    $targets += @{
        Cli = 'code'
    }
}

if ($targets.Count -eq 0) {
    throw 'No VS Code client targets were resolved.'
}

foreach ($target in $targets) {
    $installArgs = @{
        VsixPath = $vsix.FullName
        WorkspaceRoot = $WorkspaceRoot
        TimeoutSeconds = $TimeoutSeconds
    }

    if ($target.ContainsKey('CliPath')) {
        $installArgs['CliPath'] = $target['CliPath']
    }
    else {
        $installArgs['Cli'] = $target['Cli']
    }

    if ($AllProfiles) {
        $installArgs['AllProfiles'] = $true
    }
    elseif (-not [string]::IsNullOrWhiteSpace($ProfileName)) {
        $installArgs['ProfileName'] = $ProfileName
    }

    & $installScript @installArgs
}