param(
    [string]$Registry = "",
    [string]$Namespace = "",
    [string]$Repository = "",
    [string]$ImageRepository = "",
    [string]$Tag = "",
    [string]$EnvFile = "deploy/.env",
    [string]$EnableBusuanzi = "",
    [string]$NodeImage = "",
    [string]$PythonImage = "",
    [switch]$RefreshBaseImages,
    [switch]$Push,
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
$NodeImage = Resolve-ConfigValue $NodeImage "NODE_IMAGE" "NODE_IMAGE" "node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3"
$PythonImage = Resolve-ConfigValue $PythonImage "PYTHON_IMAGE" "PYTHON_IMAGE" "python:3.13-slim@sha256:6771159cd4fa5d9bba1258caf0b82e6b73458c694d178ad97c5e925c2d0e1a91"

$remoteRepository = if ($ImageRepository) { $ImageRepository } else { "$Registry/$Namespace/$Repository" }
$remoteImage = "$remoteRepository`:$Tag"
$localImage = "$Repository`:$Tag"

Write-Host "Repository root: $repoRoot"
Write-Host "Local image:     $localImage"
Write-Host "Remote image:    $remoteImage"
Write-Host "Busuanzi stats:  $EnableBusuanzi"
Write-Host "Node base image: $NodeImage"
Write-Host "Python base:     $PythonImage"

if ($DryRun) {
    Write-Host "Dry run: image tags resolved; docker build was not executed."
    return
}

if ($RefreshBaseImages) {
    foreach ($baseImage in @($NodeImage, $PythonImage)) {
        Write-Host "Refreshing base image: $baseImage"
        & docker pull $baseImage
        if ($LASTEXITCODE -ne 0) {
            throw "docker pull failed for $baseImage with exit code $LASTEXITCODE"
        }
    }
}

& docker build `
    --build-arg "NODE_IMAGE=$NodeImage" `
    --build-arg "PYTHON_IMAGE=$PythonImage" `
    --build-arg "VITE_ENABLE_BUSUANZI=$EnableBusuanzi" `
    -t $localImage `
    -t $remoteImage `
    .
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
