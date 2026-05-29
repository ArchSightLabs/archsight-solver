param(
    [Parameter(Mandatory = $true)]
    [string]$Server,

    [string]$User = "",
    [int]$Port = 22,
    [string]$IdentityFile = "",
    [string]$DeployPath = "~/archsight-solver/deploy",
    [string]$Tag = "",
    [switch]$BuildAndPush,
    [switch]$LegacyBuilder,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$buildScript = Join-Path $scriptRoot "build-image.ps1"

function ConvertTo-BashSingleQuoted {
    param([string]$Value)

    return "'" + $Value.Replace("'", "'\''") + "'"
}

function Invoke-CheckedCommand {
    param(
        [string]$CommandName,
        [string[]]$CommandArgs
    )

    & $CommandName @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "$CommandName 执行失败，退出码 $LASTEXITCODE"
    }
}

$sshTarget = if ($User) { "$User@$Server" } else { $Server }
$deployPathQuoted = ConvertTo-BashSingleQuoted $DeployPath
$deployScriptQuoted = ConvertTo-BashSingleQuoted "./deploy.sh"
$tagArg = if ($Tag) { " " + (ConvertTo-BashSingleQuoted $Tag) } else { "" }

$remoteBody = @(
    "set -euo pipefail",
    "cd ${deployPathQuoted}",
    "if [ ! -f ${deployScriptQuoted} ]; then echo '错误: deploy/deploy.sh 不存在，请先同步 deploy 目录。'; exit 1; fi",
    "chmod +x ${deployScriptQuoted}",
    "${deployScriptQuoted}${tagArg}"
) -join "; "
$remoteCommand = "bash -lc " + (ConvertTo-BashSingleQuoted $remoteBody)

Write-Host "仓库根目录: $repoRoot"
Write-Host "远程主机:   $sshTarget"
Write-Host "远程目录:   $DeployPath"
if ($Tag) {
    Write-Host "镜像标签:   $Tag"
} else {
    Write-Host "镜像标签:   使用服务器 .env 中的 IMAGE_TAG"
}

if ($BuildAndPush) {
    $buildArgs = @("-Push")
    if ($Tag) {
        $buildArgs += @("-Tag", $Tag)
    }
    if ($LegacyBuilder) {
        $buildArgs += "-LegacyBuilder"
    }

    Write-Host "开始构建并推送镜像..."
    if ($DryRun) {
        Write-Host "Dry run: $buildScript $($buildArgs -join ' ')"
    } else {
        & $buildScript @buildArgs
    }
}

$sshArgs = @()
if ($Port -ne 22) {
    $sshArgs += @("-p", [string]$Port)
}
if ($IdentityFile) {
    $sshArgs += @("-i", $IdentityFile)
}
$sshArgs += @($sshTarget, $remoteCommand)

Write-Host "开始远程部署..."
if ($DryRun) {
    Write-Host "Dry run: ssh $($sshArgs -join ' ')"
    return
}

Invoke-CheckedCommand "ssh" $sshArgs

Write-Host "远程部署完成。"
