param(
    [string]$Registry = "",
    [string]$Namespace = "",
    [string]$Repository = "",
    [string]$ImageRepository = "",
    [string]$Tag = "",
    [string]$EnvFile = "deploy/.env",
    [string]$EnableBusuanzi = "",
    [switch]$Push,
    [switch]$LegacyBuilder,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
Set-Location $repoRoot

$envValues = @{}
$resolvedEnvFile = Join-Path $repoRoot $EnvFile
if (Test-Path $resolvedEnvFile) {
    Get-Content $resolvedEnvFile | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            return
        }
        $key, $value = $line.Split("=", 2)
        $envValues[$key.Trim()] = $value.Trim()
    }
}

function Resolve-ConfigValue {
    param(
        [string]$Candidate,
        [string]$EnvironmentName,
        [string]$EnvFileName,
        [string]$Fallback
    )

    if ($Candidate) {
        return $Candidate
    }
    $environmentValue = [Environment]::GetEnvironmentVariable($EnvironmentName)
    if ($environmentValue) {
        return $environmentValue
    }
    if ($envValues.ContainsKey($EnvFileName) -and $envValues[$EnvFileName]) {
        return $envValues[$EnvFileName]
    }
    return $Fallback
}

$Registry = Resolve-ConfigValue $Registry "IMAGE_REGISTRY" "IMAGE_REGISTRY" "registry.cn-hangzhou.aliyuncs.com"
$Namespace = Resolve-ConfigValue $Namespace "IMAGE_NAMESPACE" "IMAGE_NAMESPACE" "your-namespace"
$Repository = Resolve-ConfigValue $Repository "IMAGE_REPOSITORY_NAME" "IMAGE_REPOSITORY_NAME" "archsight-solver"
$ImageRepository = Resolve-ConfigValue $ImageRepository "IMAGE_REPOSITORY" "IMAGE_REPOSITORY" ""
$Tag = Resolve-ConfigValue $Tag "IMAGE_TAG" "IMAGE_TAG" "latest"
$EnableBusuanzi = Resolve-ConfigValue $EnableBusuanzi "VITE_ENABLE_BUSUANZI" "VITE_ENABLE_BUSUANZI" "false"

$remoteRepository = if ($ImageRepository) { $ImageRepository } else { "$Registry/$Namespace/$Repository" }
$remoteImage = "$remoteRepository`:$Tag"
$localImage = "$Repository`:$Tag"

Write-Host "Repository root: $repoRoot"
Write-Host "Local image:     $localImage"
Write-Host "Remote image:    $remoteImage"
Write-Host "Busuanzi stats:  $EnableBusuanzi"

if ($DryRun) {
    Write-Host "Dry run: image tags resolved; docker build was not executed."
    return
}

$oldBuildKit = $env:DOCKER_BUILDKIT
if ($LegacyBuilder) {
    $env:DOCKER_BUILDKIT = "0"
    Write-Host "Legacy builder enabled (DOCKER_BUILDKIT=0)."
}

try {
    & docker build --build-arg "VITE_ENABLE_BUSUANZI=$EnableBusuanzi" -t $localImage -t $remoteImage .
    if ($LASTEXITCODE -ne 0) {
        throw "docker build failed with exit code $LASTEXITCODE"
    }

    if ($Push) {
        & docker push $remoteImage
        if ($LASTEXITCODE -ne 0) {
            throw "docker push failed with exit code $LASTEXITCODE"
        }
    }

    Write-Host "Done."
    Write-Host "Local image:  $localImage"
    Write-Host "Remote image: $remoteImage"
}
finally {
    if ($LegacyBuilder) {
        if ($null -eq $oldBuildKit) {
            Remove-Item Env:DOCKER_BUILDKIT -ErrorAction SilentlyContinue
        } else {
            $env:DOCKER_BUILDKIT = $oldBuildKit
        }
    }
}
