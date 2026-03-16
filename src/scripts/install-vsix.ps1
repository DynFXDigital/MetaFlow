<#
.SYNOPSIS
    Install MetaFlow VSIX into a single VS Code profile.
#>
param(
    [Parameter(Mandatory)]
    [string]$VsixPath,

    [Parameter()]
    [string]$Cli = 'code-insiders',

    [Parameter()]
    [string]$CliPath,

    [Parameter()]
    [string]$ProfileName,

    [Parameter()]
    [string]$WorkspaceRoot,

    [Parameter()]
    [switch]$AllProfiles,

    [Parameter()]
    [ValidateRange(10, 600)]
    [int]$TimeoutSeconds = 120
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-PlainJsonValue {
    param(
        [object]$InputObject
    )

    if ($null -eq $InputObject) {
        return $null
    }

    if ($InputObject -is [System.Collections.IDictionary]) {
        $dictionary = @{}
        foreach ($key in $InputObject.Keys) {
            $dictionary[$key] = ConvertTo-PlainJsonValue -InputObject $InputObject[$key]
        }

        return $dictionary
    }

    if ($InputObject -is [System.Management.Automation.PSCustomObject]) {
        $dictionary = @{}
        foreach ($property in $InputObject.PSObject.Properties) {
            $dictionary[$property.Name] = ConvertTo-PlainJsonValue -InputObject $property.Value
        }

        return $dictionary
    }

    if ($InputObject -is [System.Collections.IEnumerable] -and -not ($InputObject -is [string])) {
        $items = New-Object System.Collections.Generic.List[object]
        foreach ($item in $InputObject) {
            $items.Add((ConvertTo-PlainJsonValue -InputObject $item)) | Out-Null
        }

        return $items.ToArray()
    }

    return $InputObject
}

function ConvertFrom-JsonCompat {
    param(
        [Parameter(Mandatory)]
        [string]$InputText
    )

    return ConvertTo-PlainJsonValue -InputObject ($InputText | ConvertFrom-Json)
}

function Expand-ZipArchiveCompat {
    param(
        [Parameter(Mandatory)]
        [string]$ArchivePath,

        [Parameter(Mandatory)]
        [string]$DestinationPath
    )

    if (Test-Path -LiteralPath $DestinationPath) {
        Remove-Item -LiteralPath $DestinationPath -Recurse -Force
    }

    $destinationParent = Split-Path -Path $DestinationPath -Parent
    if (-not [string]::IsNullOrWhiteSpace($destinationParent) -and -not (Test-Path -LiteralPath $destinationParent)) {
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath, $DestinationPath)
}

function Test-IsRetryableFileWriteException {
    param(
        [System.Exception]$Exception
    )

    $current = $Exception
    while ($null -ne $current) {
        if ($current -is [System.IO.IOException]) {
            return $true
        }

        $current = $current.InnerException
    }

    return $false
}

function Resolve-PreferredCliShimPath {
    param(
        [string]$CandidatePath,
        [string]$CommandName
    )

    $resolvedCandidatePath = (Resolve-Path -LiteralPath $CandidatePath).Path
    $candidateName = [System.IO.Path]::GetFileName($resolvedCandidatePath).ToLowerInvariant()
    if ($candidateName -eq 'code.cmd' -or $candidateName -eq 'code-insiders.cmd') {
        return $resolvedCandidatePath
    }

    $shimName = switch ($candidateName) {
        'code.exe' { 'code.cmd' }
        'code - insiders.exe' { 'code-insiders.cmd' }
        default { $null }
    }

    if (-not $shimName) {
        $normalizedCommandName = $CommandName.Trim().ToLowerInvariant()
        if ($normalizedCommandName -eq 'code') {
            $shimName = 'code.cmd'
        }
        elseif ($normalizedCommandName -eq 'code-insiders') {
            $shimName = 'code-insiders.cmd'
        }
    }

    if (-not $shimName) {
        return $resolvedCandidatePath
    }

    $installRoot = Split-Path -Path $resolvedCandidatePath -Parent
    $shimPath = Join-Path $installRoot (Join-Path 'bin' $shimName)
    if (Test-Path -LiteralPath $shimPath) {
        return (Resolve-Path -LiteralPath $shimPath).Path
    }

    return $resolvedCandidatePath
}

function Resolve-CliExecutablePath {
    param(
        [string]$CommandName,
        [string]$ExplicitPath
    )

    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        if (-not (Test-Path -LiteralPath $ExplicitPath)) {
            throw "CLI executable path not found: $ExplicitPath"
        }

        return Resolve-PreferredCliShimPath -CandidatePath $ExplicitPath -CommandName $CommandName
    }

    $resolved = Get-Command $CommandName -ErrorAction SilentlyContinue
    if (-not $resolved) {
        throw "CLI '$CommandName' not found in PATH."
    }

    return Resolve-PreferredCliShimPath -CandidatePath $resolved.Source -CommandName $CommandName
}

function Resolve-UserDataDirectory {
    param(
        [string]$ResolvedCliPath,
        [string]$CommandName
    )

    $exeName = [System.IO.Path]::GetFileName($ResolvedCliPath).ToLowerInvariant()
    $normalizedCommandName = $CommandName.Trim().ToLowerInvariant()

    if ($exeName -eq 'code.exe' -or $exeName -eq 'code.cmd' -or $normalizedCommandName -eq 'code') {
        return (Join-Path $env:APPDATA 'Code')
    }

    if ($exeName -eq 'code - insiders.exe' -or $exeName -eq 'code-insiders.cmd' -or $normalizedCommandName -eq 'code-insiders') {
        return (Join-Path $env:APPDATA 'Code - Insiders')
    }

    throw "Unable to determine VS Code user data directory for CLI '$ResolvedCliPath'."
}

function Convert-PathToVsCodeFileUri {
    param(
        [string]$Path
    )

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $normalizedPath = $resolvedPath.Replace('\', '/')

    if ($normalizedPath -match '^(?<drive>[A-Za-z]):(?<rest>/.*)?$') {
        $drive = $Matches.drive.ToLowerInvariant()
        $rest = $Matches.rest
        $segments = @(
            foreach ($segment in ($rest -split '/')) {
                if (-not [string]::IsNullOrWhiteSpace($segment)) {
                    [System.Uri]::EscapeDataString($segment)
                }
            }
        )

        if ($segments.Count -eq 0) {
            return "file:///$drive%3A"
        }

        return "file:///$drive%3A/$($segments -join '/')"
    }

    return ([System.Uri]$resolvedPath).AbsoluteUri
}

function Get-WorkspaceAssociationCandidateUris {
    param(
        [string]$WorkspacePath
    )

    $resolvedWorkspacePath = (Resolve-Path -LiteralPath $WorkspacePath).Path
    $candidateUris = New-Object System.Collections.Generic.List[string]

    $workspaceFiles = @(Get-ChildItem -LiteralPath $resolvedWorkspacePath -Filter '*.code-workspace' -File -ErrorAction SilentlyContinue | Sort-Object Name)
    foreach ($workspaceFile in $workspaceFiles) {
        $candidateUris.Add((Convert-PathToVsCodeFileUri -Path $workspaceFile.FullName))
    }

    $candidateUris.Add((Convert-PathToVsCodeFileUri -Path $resolvedWorkspacePath))
    return $candidateUris.ToArray()
}

function Convert-FileSystemPathToVsCodePath {
    param(
        [string]$Path
    )

    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path
    $normalizedPath = $resolvedPath.Replace('\', '/')

    if ($normalizedPath -match '^(?<drive>[A-Za-z]):(?<rest>/.*)?$') {
        $drive = $Matches.drive.ToLowerInvariant()
        $rest = $Matches.rest
        if ([string]::IsNullOrWhiteSpace($rest)) {
            return "/${drive}:"
        }

        return "/${drive}:$rest"
    }

    return $normalizedPath
}

function Resolve-ExtensionsRoot {
    param(
        [string]$UserDataDirectory
    )

    $userHome = [Environment]::GetFolderPath('UserProfile')
    $directoryName = [System.IO.Path]::GetFileName($UserDataDirectory).ToLowerInvariant()

    switch ($directoryName) {
        'code' {
            return (Join-Path $userHome '.vscode\extensions')
        }
        'code - insiders' {
            return (Join-Path $userHome '.vscode-insiders\extensions')
        }
        default {
            throw "Unable to determine extensions root for VS Code user data directory '$UserDataDirectory'."
        }
    }
}

function Get-SyncProfileMetadata {
    param(
        [string]$UserDataDirectory
    )

    $syncProfilesPath = Join-Path $UserDataDirectory 'User\sync\profiles\lastSyncprofiles.json'
    if (-not (Test-Path -LiteralPath $syncProfilesPath)) {
        return @()
    }

    try {
        $syncPayload = ConvertFrom-JsonCompat -InputText (Get-Content -LiteralPath $syncProfilesPath -Raw)
        $syncContent = $syncPayload['syncData']['content']
        if ([string]::IsNullOrWhiteSpace($syncContent)) {
            return @()
        }

        $profiles = ConvertFrom-JsonCompat -InputText $syncContent
        return @(
            foreach ($profile in @($profiles)) {
                $id = [string]$profile['id']
                $name = [string]$profile['name']
                if (-not [string]::IsNullOrWhiteSpace($id) -and -not [string]::IsNullOrWhiteSpace($name)) {
                    [pscustomobject]@{
                        Id   = $id.Trim()
                        Name = $name.Trim()
                    }
                }
            }
        )
    }
    catch {
        Write-Warning ("Unable to parse profile metadata from {0}: {1}" -f $syncProfilesPath, $_.Exception.Message)
        return @()
    }
}

function Resolve-ProfileNameById {
    param(
        [string]$UserDataDirectory,
        [string]$ProfileId
    )

    if ([string]::IsNullOrWhiteSpace($ProfileId)) {
        return $null
    }

    if ($ProfileId -eq '__default__profile__') {
        return ''
    }

    foreach ($profile in Get-SyncProfileMetadata -UserDataDirectory $UserDataDirectory) {
        if ($profile.Id -eq $ProfileId) {
            return $profile.Name
        }
    }

    return $null
}

function Resolve-ProfileIdByName {
    param(
        [string]$UserDataDirectory,
        [string]$ProfileName
    )

    if ([string]::IsNullOrWhiteSpace($ProfileName)) {
        return '__default__profile__'
    }

    foreach ($profile in Get-SyncProfileMetadata -UserDataDirectory $UserDataDirectory) {
        if ($profile.Name -eq $ProfileName) {
            return $profile.Id
        }
    }

    return $null
}

function Resolve-WorkspaceAssociatedProfile {
    param(
        [string]$UserDataDirectory,
        [string]$WorkspacePath
    )

    if ([string]::IsNullOrWhiteSpace($WorkspacePath) -or -not (Test-Path -LiteralPath $WorkspacePath)) {
        return $null
    }

    $storageJsonPath = Join-Path $UserDataDirectory 'User\globalStorage\storage.json'
    if (-not (Test-Path -LiteralPath $storageJsonPath)) {
        return $null
    }

    try {
        $storage = ConvertFrom-JsonCompat -InputText (Get-Content -LiteralPath $storageJsonPath -Raw)
    }
    catch {
        Write-Warning ("Unable to parse workspace profile associations from {0}: {1}" -f $storageJsonPath, $_.Exception.Message)
        return $null
    }

    $workspaceAssociations = $storage['profileAssociations']['workspaces']
    if ($null -eq $workspaceAssociations) {
        return $null
    }

    foreach ($candidateUri in Get-WorkspaceAssociationCandidateUris -WorkspacePath $WorkspacePath) {
        if (-not $workspaceAssociations.ContainsKey($candidateUri)) {
            continue
        }

        $profileId = [string]$workspaceAssociations[$candidateUri]
        $profileName = Resolve-ProfileNameById -UserDataDirectory $UserDataDirectory -ProfileId $profileId
        if ($profileId -ne '__default__profile__' -and $null -eq $profileName) {
            Write-Warning ("Workspace association for {0} points to profile id '{1}', but no matching profile name was found." -f $candidateUri, $profileId)
            return $null
        }

        return [pscustomobject]@{
            ProfileId    = $profileId
            ProfileName  = $profileName
            WorkspaceUri = $candidateUri
        }
    }

    return $null
}

function Get-NamedProfiles {
    param(
        [string]$UserDataDirectory
    )

    $profileRoot = Join-Path $UserDataDirectory 'User\profiles'
    $profileDirectories = @(Get-ChildItem -LiteralPath $profileRoot -Directory -ErrorAction SilentlyContinue)

    $names = @(Get-SyncProfileMetadata -UserDataDirectory $UserDataDirectory | Select-Object -ExpandProperty Name) | Sort-Object -Unique

    if ($profileDirectories.Count -gt $names.Count) {
        Write-Warning ("Resolved {0} named profile(s) from sync metadata for {1} local profile folder(s). Unnamed local profiles will not be targeted explicitly." -f $names.Count, $profileDirectories.Count)
    }

    return @($names)
}

function Read-JsonArrayFile {
    param(
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return @()
    }

    $raw = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return @()
    }

    $parsed = ConvertFrom-JsonCompat -InputText $raw
    return @($parsed)
}

function Write-JsonFile {
    param(
        [string]$Path,
        [object]$Value
    )

    $directory = Split-Path -Path $Path -Parent
    if (-not [string]::IsNullOrWhiteSpace($directory) -and -not (Test-Path -LiteralPath $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }

    $json = $Value | ConvertTo-Json -Depth 50
    $maxAttempts = 5
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            Set-Content -LiteralPath $Path -Value $json -Encoding utf8
            return
        }
        catch {
            if ($attempt -ge $maxAttempts -or -not (Test-IsRetryableFileWriteException -Exception $_.Exception)) {
                throw
            }

            Start-Sleep -Milliseconds (200 * $attempt)
        }
    }
}

function Remove-PathWithRetry {
    param(
        [Parameter(Mandatory)]
        [string]$LiteralPath
    )

    if (-not (Test-Path -LiteralPath $LiteralPath)) {
        return
    }

    $maxAttempts = 5
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            Remove-Item -LiteralPath $LiteralPath -Recurse -Force -ErrorAction Stop
            return
        }
        catch {
            if ($attempt -ge $maxAttempts -or -not (Test-IsRetryableFileWriteException -Exception $_.Exception)) {
                throw
            }

            Start-Sleep -Milliseconds (200 * $attempt)
        }
    }
}

function Sync-InstallDirectoryContents {
    param(
        [Parameter(Mandatory)]
        [string]$SourcePath,

        [Parameter(Mandatory)]
        [string]$DestinationPath
    )

    if (-not (Test-Path -LiteralPath $DestinationPath)) {
        New-Item -ItemType Directory -Path $DestinationPath -Force | Out-Null
        return
    }

    $sourceEntries = @{}
    foreach ($sourceItem in Get-ChildItem -LiteralPath $SourcePath -Force) {
        $sourceEntries[$sourceItem.Name] = $sourceItem
    }

    foreach ($destinationItem in Get-ChildItem -LiteralPath $DestinationPath -Force) {
        $sourceItem = $sourceEntries[$destinationItem.Name]
        if ($null -eq $sourceItem) {
            Remove-PathWithRetry -LiteralPath $destinationItem.FullName
            continue
        }

        if ($sourceItem.PSIsContainer -ne $destinationItem.PSIsContainer) {
            Remove-PathWithRetry -LiteralPath $destinationItem.FullName
            continue
        }

        if ($sourceItem.PSIsContainer) {
            Sync-InstallDirectoryContents -SourcePath $sourceItem.FullName -DestinationPath $destinationItem.FullName
        }
    }
}

function New-ExtensionLocationObject {
    param(
        [string]$FileSystemPath
    )

    # Match VS Code's native extensions.json location format exactly:
    # only $mid, path (forward-slash, lowercase drive), and scheme.
    # Extra fields (fsPath, _sep, external) are VS Code URI internals
    # that can cause install hangs when VS Code reads them back.
    return @{
        '$mid' = 1
        path   = (Convert-FileSystemPathToVsCodePath -Path $FileSystemPath)
        scheme = 'file'
    }
}

function New-ExtensionRegistryEntry {
    param(
        [string]$ExtensionId,
        [string]$Version,
        [string]$InstallPath,
        [hashtable]$ExistingEntry
    )

    $metadata = @{}
    if ($null -ne $ExistingEntry -and $ExistingEntry.ContainsKey('metadata')) {
        foreach ($key in $ExistingEntry['metadata'].Keys) {
            $metadata[$key] = $ExistingEntry['metadata'][$key]
        }
    }

    $metadata['installedTimestamp'] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $metadata['source'] = 'vsix'
    if (-not $metadata.ContainsKey('pinned')) {
        $metadata['pinned'] = $true
    }

    $identifier = @{ id = $ExtensionId }
    if ($null -ne $ExistingEntry -and $ExistingEntry.ContainsKey('identifier') -and $ExistingEntry['identifier'].ContainsKey('uuid')) {
        $identifier['uuid'] = $ExistingEntry['identifier']['uuid']
    }

    return @{
        identifier       = $identifier
        version          = $Version
        location         = (New-ExtensionLocationObject -FileSystemPath $InstallPath)
        relativeLocation = [System.IO.Path]::GetFileName($InstallPath)
        metadata         = $metadata
    }
}

function Sync-ExtensionRegistryFile {
    param(
        [string]$RegistryPath,
        [string]$ExtensionId,
        [string]$Version,
        [string]$InstallPath,
        [string[]]$IdsToRemove
    )

    $entries = Read-JsonArrayFile -Path $RegistryPath
    $existingEntry = $null
    foreach ($entry in $entries) {
        $entryId = [string]$entry['identifier']['id']
        if ($entryId -eq $ExtensionId) {
            $existingEntry = $entry
            break
        }
    }

    $updatedEntries = @(
        foreach ($entry in $entries) {
            $entryId = [string]$entry['identifier']['id']
            if ($IdsToRemove -contains $entryId) {
                continue
            }

            $entry
        }
    )

    $newEntry = New-ExtensionRegistryEntry -ExtensionId $ExtensionId -Version $Version -InstallPath $InstallPath -ExistingEntry $existingEntry
    $updatedEntries += , $newEntry
    Write-JsonFile -Path $RegistryPath -Value $updatedEntries

    return $newEntry
}

function Get-LegacyExtensionIds {
    param(
        [string]$ExtensionId
    )

    if ($ExtensionId -eq 'dynfxdigital.metaflow-ai') {
        return @('dynfxdigital.metaflow')
    }

    return @()
}

function Remove-ExtensionDirectories {
    param(
        [string]$ExtensionsRoot,
        [string[]]$ExtensionIds,
        [string]$CurrentInstallDirectory
    )

    foreach ($extensionId in @($ExtensionIds)) {
        if ([string]::IsNullOrWhiteSpace($extensionId)) {
            continue
        }

        $matchingDirectories = @(Get-ChildItem -LiteralPath $ExtensionsRoot -Directory -Filter "$extensionId-*" -ErrorAction SilentlyContinue)
        foreach ($directory in $matchingDirectories) {
            if ($directory.FullName -eq $CurrentInstallDirectory) {
                continue
            }

            try {
                Remove-Item -LiteralPath $directory.FullName -Recurse -Force -ErrorAction Stop
                Write-Host ("Removed superseded extension folder: {0}" -f $directory.FullName)
            }
            catch {
                Write-Warning ("Unable to remove superseded extension folder {0}: {1}" -f $directory.FullName, $_.Exception.Message)
            }
        }
    }
}

function Install-VsixPayloadToExtensionStore {
    param(
        [string]$ResolvedVsixPath,
        [string]$ExtensionsRoot
    )

    $extractRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("metaflow-vsix-" + [System.Guid]::NewGuid().ToString('N'))

    try {
        Expand-ZipArchiveCompat -ArchivePath $ResolvedVsixPath -DestinationPath $extractRoot

        $extensionSource = Join-Path $extractRoot 'extension'
        $packageJsonPath = Join-Path $extensionSource 'package.json'
        if (-not (Test-Path -LiteralPath $packageJsonPath)) {
            throw "VSIX archive does not contain extension/package.json: $ResolvedVsixPath"
        }

        $packageJson = ConvertFrom-JsonCompat -InputText (Get-Content -LiteralPath $packageJsonPath -Raw)
        $publisher = [string]$packageJson['publisher']
        $name = [string]$packageJson['name']
        $version = [string]$packageJson['version']
        if ([string]::IsNullOrWhiteSpace($publisher) -or [string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($version)) {
            throw "VSIX manifest is missing publisher, name, or version in $packageJsonPath"
        }

        $extensionId = "$publisher.$name"
        $installPath = Join-Path $ExtensionsRoot ("{0}-{1}" -f $extensionId, $version)
        $legacyIds = Get-LegacyExtensionIds -ExtensionId $extensionId
        $idsToRemove = @($extensionId) + $legacyIds

        New-Item -ItemType Directory -Path $ExtensionsRoot -Force | Out-Null
        New-Item -ItemType Directory -Path $installPath -Force | Out-Null

        Write-Host ''
        Write-Host 'Installing VSIX payload via direct file overlay.'
        Write-Host ("Extension Id: {0}" -f $extensionId)
        Write-Host ("Install Path: {0}" -f $installPath)

        Write-Host 'Pruning files removed from the VSIX payload.'
        Sync-InstallDirectoryContents -SourcePath $extensionSource -DestinationPath $installPath

        foreach ($item in Get-ChildItem -LiteralPath $extensionSource -Force) {
            Copy-Item -LiteralPath $item.FullName -Destination $installPath -Recurse -Force
        }

        Remove-ExtensionDirectories -ExtensionsRoot $ExtensionsRoot -ExtensionIds $legacyIds -CurrentInstallDirectory $installPath
        Remove-ExtensionDirectories -ExtensionsRoot $ExtensionsRoot -ExtensionIds @($extensionId) -CurrentInstallDirectory $installPath

        $registryPath = Join-Path $ExtensionsRoot 'extensions.json'
        $registryEntry = Sync-ExtensionRegistryFile -RegistryPath $registryPath -ExtensionId $extensionId -Version $version -InstallPath $installPath -IdsToRemove $idsToRemove

        return [pscustomobject]@{
            ExtensionId   = $extensionId
            Version       = $version
            InstallPath   = $installPath
            RegistryEntry = $registryEntry
            IdsToRemove   = $idsToRemove
        }
    }
    finally {
        Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Register-ExtensionForProfile {
    param(
        [string]$UserDataDirectory,
        [string]$ProfileName,
        [pscustomobject]$InstalledExtension
    )

    $targetLabel = if ([string]::IsNullOrWhiteSpace($ProfileName)) {
        'default'
    }
    else {
        $ProfileName
    }

    Write-Host ''
    Write-Host ("Syncing install into profile: {0}" -f $targetLabel)

    if ([string]::IsNullOrWhiteSpace($ProfileName)) {
        Write-Host 'Default profile uses the global installed extension list.'
        return
    }

    $profileId = Resolve-ProfileIdByName -UserDataDirectory $UserDataDirectory -ProfileName $ProfileName
    if ([string]::IsNullOrWhiteSpace($profileId) -or $profileId -eq '__default__profile__') {
        throw "Unable to resolve local profile id for profile '$ProfileName'."
    }

    $profileRegistryPath = Join-Path $UserDataDirectory ("User\profiles\{0}\extensions.json" -f $profileId)
    Sync-ExtensionRegistryFile -RegistryPath $profileRegistryPath -ExtensionId $InstalledExtension.ExtensionId -Version $InstalledExtension.Version -InstallPath $InstalledExtension.InstallPath -IdsToRemove $InstalledExtension.IdsToRemove | Out-Null

    Write-Host ("Updated profile registry: {0}" -f $profileRegistryPath)
}

if (-not (Test-Path -Path $VsixPath)) {
    throw "VSIX not found: $VsixPath"
}

if ($AllProfiles -and -not [string]::IsNullOrWhiteSpace($ProfileName)) {
    throw 'Specify either -AllProfiles or -ProfileName, not both.'
}

$resolvedVsixPath = (Resolve-Path -Path $VsixPath).Path
$resolvedCliPath = Resolve-CliExecutablePath -CommandName $Cli -ExplicitPath $CliPath
$userDataDirectory = Resolve-UserDataDirectory -ResolvedCliPath $resolvedCliPath -CommandName $Cli
$extensionsRoot = Resolve-ExtensionsRoot -UserDataDirectory $userDataDirectory

$effectiveProfileName = $ProfileName
$workspaceAssociation = $null
if (-not $AllProfiles -and [string]::IsNullOrWhiteSpace($effectiveProfileName) -and -not [string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $workspaceAssociation = Resolve-WorkspaceAssociatedProfile -UserDataDirectory $userDataDirectory -WorkspacePath $WorkspaceRoot
    if ($null -ne $workspaceAssociation) {
        $effectiveProfileName = $workspaceAssociation.ProfileName
    }
}

$installTargets = if ($AllProfiles) {
    $namedProfiles = Get-NamedProfiles -UserDataDirectory $userDataDirectory
    @('') + $namedProfiles
}
elseif ([string]::IsNullOrWhiteSpace($effectiveProfileName)) {
    @('')
}
else {
    @($effectiveProfileName)
}

Write-Host 'Preparing VSIX install...'
Write-Host "CLI: $resolvedCliPath"
Write-Host "VSIX: $resolvedVsixPath"
Write-Host "Extensions Root: $extensionsRoot"
if ($AllProfiles) {
    Write-Host ("Profiles: default + {0} named local profile(s)" -f ($installTargets.Count - 1))
}
elseif ($null -ne $workspaceAssociation) {
    if ([string]::IsNullOrWhiteSpace($effectiveProfileName)) {
        Write-Host ("Profile: default (associated with workspace {0})" -f $workspaceAssociation.WorkspaceUri)
    }
    else {
        Write-Host ("Profile: {0} (associated with workspace {1})" -f $effectiveProfileName, $workspaceAssociation.WorkspaceUri)
    }
}
elseif ([string]::IsNullOrWhiteSpace($effectiveProfileName)) {
    Write-Host 'Profile: default'
}
else {
    Write-Host "Profile: $effectiveProfileName"
}
Write-Host ("Mode: direct VSIX overlay (task timeout setting: {0}s)" -f $TimeoutSeconds)

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$completedTargets = New-Object System.Collections.Generic.List[string]
$failedTargets = New-Object System.Collections.Generic.List[string]

try {
    $installedExtension = Install-VsixPayloadToExtensionStore -ResolvedVsixPath $resolvedVsixPath -ExtensionsRoot $extensionsRoot

    foreach ($installTarget in $installTargets) {
        $targetLabel = if ([string]::IsNullOrWhiteSpace($installTarget)) {
            'default'
        }
        else {
            $installTarget
        }

        try {
            Register-ExtensionForProfile -UserDataDirectory $userDataDirectory -ProfileName $installTarget -InstalledExtension $installedExtension
            $completedTargets.Add($targetLabel)
        }
        catch {
            if ($AllProfiles -and (Test-IsRetryableFileWriteException -Exception $_.Exception)) {
                Write-Warning ("Skipping profile '{0}' because its extension registry is locked by another process. Close the corresponding VS Code window and rerun this install task to update it." -f $targetLabel)
                $failedTargets.Add($targetLabel)
                continue
            }

            throw
        }
    }
}
finally {
    $stopwatch.Stop()
}

Write-Host ''
Write-Host ("Install completed in {0:n1}s." -f $stopwatch.Elapsed.TotalSeconds)
if ($completedTargets.Count -gt 1) {
    Write-Host ("Installed into profiles: {0}" -f ([string]::Join(', ', $completedTargets.ToArray())))
}
if ($failedTargets.Count -gt 0) {
    Write-Warning ("Skipped locked profiles: {0}" -f ([string]::Join(', ', $failedTargets.ToArray())))
}
Write-Host 'Done. Reload VS Code window to pick up the extension.'
