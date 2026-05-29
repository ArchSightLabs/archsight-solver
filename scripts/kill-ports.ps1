param(
    [string[]]$Ports = @()
)

function Get-PortOrDefault {
    param(
        [string]$Value,
        [int]$DefaultValue
    )

    $parsed = 0
    if ([int]::TryParse($Value, [ref]$parsed) -and $parsed -gt 0) {
        return $parsed
    }
    return $DefaultValue
}

$defaultPorts = @(
    (Get-PortOrDefault -Value $env:BEAM_SOLVER_BACKEND_PORT -DefaultValue 6240),
    (Get-PortOrDefault -Value $env:BEAM_SOLVER_FRONTEND_PORT -DefaultValue 6241),
    (Get-PortOrDefault -Value $env:APP_HOST_PORT -DefaultValue 18082)
)

function Resolve-PortList {
    param(
        [string[]]$Values
    )

    $parsedPorts = @()
    foreach ($value in $Values) {
        foreach ($item in ([string]$value -split ",")) {
            $parsed = 0
            if ([int]::TryParse($item.Trim(), [ref]$parsed) -and $parsed -gt 0) {
                $parsedPorts += $parsed
            }
        }
    }
    return $parsedPorts | Select-Object -Unique
}

$explicitPorts = Resolve-PortList -Values $Ports
$hasExplicitPorts = $explicitPorts.Count -gt 0
$ports = if ($hasExplicitPorts) { $explicitPorts } else { $defaultPorts | Select-Object -Unique }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$currentPid = $PID

function Get-ProcessTable {
    $table = @{}
    Get-CimInstance Win32_Process | ForEach-Object {
        $table[[int]$_.ProcessId] = $_
    }
    return $table
}

function Add-Candidate {
    param(
        [hashtable]$Candidates,
        [int]$ProcessId,
        [string]$Reason
    )

    if ($ProcessId -le 0 -or $ProcessId -eq $currentPid) {
        return
    }

    if (-not $Candidates.ContainsKey($ProcessId)) {
        $Candidates[$ProcessId] = $Reason
    }
}

function Add-Descendants {
    param(
        [hashtable]$Candidates,
        [hashtable]$ProcessTable,
        [int]$ProcessId,
        [string]$Reason
    )

    $children = $ProcessTable.Values | Where-Object { [int]$_.ParentProcessId -eq $ProcessId }
    foreach ($child in $children) {
        Add-Candidate -Candidates $Candidates -ProcessId ([int]$child.ProcessId) -Reason $Reason
        Add-Descendants -Candidates $Candidates -ProcessTable $ProcessTable -ProcessId ([int]$child.ProcessId) -Reason $Reason
    }
}

function Add-ProjectDevAncestors {
    param(
        [hashtable]$Candidates,
        [hashtable]$ProcessTable,
        [int]$ProcessId
    )

    $cursor = $ProcessId
    while ($ProcessTable.ContainsKey($cursor)) {
        $process = $ProcessTable[$cursor]
        $parentId = [int]$process.ParentProcessId
        if (-not $ProcessTable.ContainsKey($parentId)) {
            break
        }

        $parent = $ProcessTable[$parentId]
        $commandLine = [string]$parent.CommandLine
        $isProjectDevLauncher = $commandLine.Contains($projectRoot) -and (
            $commandLine -match "python(\.exe)?\s+app\.py" -or
            $commandLine -match "\bflask\b" -or
            $commandLine -match "\bgunicorn\b" -or
            $commandLine -match "\bvite\b" -or
            $commandLine -match "npm(\.cmd)?\s+run\s+dev"
        )

        if (-not $isProjectDevLauncher) {
            break
        }

        Add-Candidate -Candidates $Candidates -ProcessId $parentId -Reason "project dev launcher"
        Add-Descendants -Candidates $Candidates -ProcessTable $ProcessTable -ProcessId $parentId -Reason "project dev launcher child"
        $cursor = $parentId
    }
}

function Add-OrphanProjectDevProcesses {
    param(
        [hashtable]$Candidates,
        [hashtable]$ProcessTable
    )

    foreach ($process in $ProcessTable.Values) {
        $commandLine = [string]$process.CommandLine
        $isProjectDevProcess = $commandLine.Contains($projectRoot) -and (
            $commandLine -match "python(\.exe)?\s+app\.py" -or
            $commandLine -match "\bflask\b" -or
            $commandLine -match "\bgunicorn\b" -or
            $commandLine -match "\bvite\b" -or
            $commandLine -match "npm(\.cmd)?\s+run\s+dev"
        )

        if ($isProjectDevProcess) {
            Add-Candidate -Candidates $Candidates -ProcessId ([int]$process.ProcessId) -Reason "project dev process"
            Add-Descendants -Candidates $Candidates -ProcessTable $ProcessTable -ProcessId ([int]$process.ProcessId) -Reason "project dev child"
        }
    }
}

function Stop-Candidates {
    param(
        [hashtable]$Candidates,
        [hashtable]$ProcessTable
    )

    foreach ($entry in $Candidates.GetEnumerator()) {
        $processId = [int]$entry.Key
        if (-not $ProcessTable.ContainsKey($processId)) {
            continue
        }

        $process = $ProcessTable[$processId]
        Write-Host "Stopping $($process.Name) (PID: $processId) - $($entry.Value)" -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

$maxAttempts = 3
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Write-Host "Cleanup attempt $attempt/$maxAttempts..." -ForegroundColor Cyan

    $processTable = Get-ProcessTable
    $candidates = @{}

    foreach ($port in $ports) {
        Write-Host "Checking port $port..." -ForegroundColor Cyan
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

        if (-not $connections) {
            Write-Host "Port $port is not in use." -ForegroundColor Gray
            continue
        }

        $ownerProcessIds = $connections.OwningProcess | Select-Object -Unique
        foreach ($ownerProcessId in $ownerProcessIds) {
            Add-Candidate -Candidates $candidates -ProcessId ([int]$ownerProcessId) -Reason "listening on port $port"
            Add-Descendants -Candidates $candidates -ProcessTable $processTable -ProcessId ([int]$ownerProcessId) -Reason "child of port $port owner"
            Add-ProjectDevAncestors -Candidates $candidates -ProcessTable $processTable -ProcessId ([int]$ownerProcessId)
        }
    }

    if (-not $hasExplicitPorts) {
        Add-OrphanProjectDevProcesses -Candidates $candidates -ProcessTable $processTable
    }

    if ($candidates.Count -eq 0) {
        break
    }

    Stop-Candidates -Candidates $candidates -ProcessTable $processTable
    Start-Sleep -Milliseconds 700
}

$remaining = Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue
if ($remaining) {
    Write-Host "Some ports are still in use:" -ForegroundColor Red
    $remaining | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
    exit 1
}

Write-Host "Cleanup completed. Ports are free: $($ports -join ', ')" -ForegroundColor Green
