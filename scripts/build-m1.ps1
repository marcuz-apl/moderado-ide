param(
  [string]$Checkout = (Join-Path $PSScriptRoot '..\build\vscodium'),
  [switch]$AssetsOnly,
  [switch]$PackingOnly
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$checkout = (Resolve-Path -LiteralPath $Checkout).Path
function Invoke-CheckedNativeCommand {
  param(
    [Parameter(Mandatory)][scriptblock]$Command,
    [Parameter(Mandatory)][string]$FailureMessage
  )

  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    & $Command
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) { throw "$FailureMessage (exit code $exitCode)" }
}

if (!$checkout.StartsWith($root + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Checkout must be inside the IDE workspace.'
}
$lock = Get-Content -Raw -LiteralPath (Join-Path $root 'sources.lock.json') | ConvertFrom-Json
$outerRevision = (& git -C $checkout rev-parse HEAD).Trim()
$innerRevision = (& git -C (Join-Path $checkout 'vscode') rev-parse HEAD).Trim()
if ($outerRevision -ne $lock.sources.vscodium.commit -or $innerRevision -ne $lock.sources.codeOss.commit) {
  throw 'Editor source checkout does not match sources.lock.json.'
}

Invoke-CheckedNativeCommand { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'branding\make-icon.ps1') } 'Icon generation failed.'
Invoke-CheckedNativeCommand { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'apply-branding.ps1') -Checkout $checkout } 'Branding failed.'

# Build the bundled agent extension and install it into the editor checkout so
# the packaged IDE ships with it. A failure must not silently produce an
# editor without the agent.
Invoke-CheckedNativeCommand { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'build-agent-extension.ps1') -Checkout $checkout -SkipTests } 'Agent extension build or install failed.'

$env:APP_NAME = 'Moderado IDE'
$env:BINARY_NAME = 'moderado-ide'
$env:CI_BUILD = 'no'
$env:DISABLE_UPDATE = 'yes'
$env:MS_COMMIT = $lock.sources.codeOss.commit
$env:OS_NAME = 'windows'
$env:RELEASE_VERSION = $lock.sources.vscodium.version
$env:SHOULD_BUILD_CLI = 'no'
$env:SHOULD_BUILD_MSI = 'no'
$env:SHOULD_BUILD_MSI_NOUP = 'no'
$env:SHOULD_BUILD_REH = 'no'
$env:SHOULD_BUILD_REH_WEB = 'no'
$env:VSCODE_ARCH = 'x64'
$env:VSCODE_QUALITY = 'stable'
# The prepack/packing gulp process holds every extension stream in memory at once.
# At 8192 MiB it intermittently died with "JavaScript heap out of memory", which
# surfaced as several unrelated failures (tsgo exit 1/2 with no diagnostics,
# `npm list` failing inside vsce, esbuild failing). Raise it; override with
# MODERADO_BUILD_HEAP_MB when the machine has less headroom.
$heapMb = if ($env:MODERADO_BUILD_HEAP_MB) { $env:MODERADO_BUILD_HEAP_MB } else { '12288' }
$env:MAX_OLD_SPACE_SIZE = $heapMb
$env:NODE_OPTIONS = "--max-old-space-size=$heapMb"
$env:VSCODE_SKIP_NODE_VERSION_CHECK = 'yes'
$env:Path = 'C:\Program Files\7-Zip;' + $env:Path
Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue
Remove-Item Env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD -ErrorAction SilentlyContinue

function Find-Python311 {
  $candidates = @()
  $cmd = Get-Command python3.11 -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { $candidates += $cmd.Source }
  $candidates += 'C:\Python311\python.exe'
  $candidates += 'C:\Program Files\Python311\python.exe'
  $candidates += (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe')
  $candidates += (Join-Path $env:USERPROFILE '.local\bin\python3.11.exe')
  $candidates += (Join-Path $env:LOCALAPPDATA 'uv\python\cpython-3.11-windows-x86_64-none\python.exe')
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      try {
        $version = & $candidate -c 'import sys; print(sys.version)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $version -match '^3\.11\.') {
          return $candidate
        }
      } catch {
        # continue to next candidate
      }
    }
  }
  return $null
}

$python = $null
try {
  $pyResult = & py -3.11 -c 'import sys; print(sys.executable)' 2>&1
  if ($LASTEXITCODE -eq 0 -and $pyResult) {
    $python = ($pyResult | Select-Object -First 1).Trim()
  }
} catch {
  # py launcher failed; fall back to direct executable search
}
if (!$python) {
  $python = Find-Python311
}
if ($python) {
  $env:PYTHON = $python
  $env:npm_config_python = $python
}
$vs = (& (Join-Path $PSScriptRoot 'ensure-windows-build-tools.ps1') | Select-Object -Last 1).Trim()
Write-Output "Detected Visual Studio 2022 installation: $vs"
$env:vs2022_install = $vs
$env:npm_config_msvs_version = '2022'
$env:GYP_MSVS_VERSION = '2022'

$bash = 'C:\Program Files\Git\bin\bash.exe'
$posixCheckout = (& 'C:\Program Files\Git\usr\bin\cygpath.exe' -u $checkout).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Git Bash path conversion failed.' }
if (!$AssetsOnly) {
  $prepack = if ($PackingOnly) { '' } else { 'npm run gulp vscode-min-prepack && ' }
  Invoke-CheckedNativeCommand { & $bash -c "cd '$posixCheckout/vscode' && ${prepack}npm run gulp vscode-win32-x64-min-packing" } 'Editor packing failed.'
}
$assetDir = Join-Path $checkout 'assets'
[System.IO.Directory]::CreateDirectory($assetDir) | Out-Null
$expected = @(
  "Moderado IDE-win32-x64-$($lock.sources.vscodium.version).zip",
  "Moderado IDESetup-x64-$($lock.sources.vscodium.version).exe",
  "Moderado IDEUserSetup-x64-$($lock.sources.vscodium.version).exe"
)
$zip = Join-Path $assetDir $expected[0]
if (Test-Path -LiteralPath $zip) {
  $archive = Join-Path $assetDir 'previous'
  [System.IO.Directory]::CreateDirectory($archive) | Out-Null
  Move-Item -LiteralPath $zip -Destination (Join-Path $archive ((Get-Date -Format 'yyyyMMddHHmmss') + '.zip'))
}
# Ship the MIT license texts in the portable editor.
#
# The upstream packaging copies Electron's `LICENSES.chromium.html` but not the
# Code OSS `LICENSE.txt`, so an IDE package built straight from it
# redistributes MIT-licensed code with no copy of that license. Add it, plus
# IDE's own license, before the archive is created. This runs before
# `prepare_assets.sh` so the files land in the zip and both installers.
$portable = Join-Path $checkout 'VSCode-win32-x64'
if (Test-Path -LiteralPath $portable) {
  Copy-Item -LiteralPath (Join-Path $checkout 'vscode\LICENSE.txt') -Destination (Join-Path $portable 'LICENSE.txt') -Force
  Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination (Join-Path $portable 'Moderado IDE LICENSE') -Force
}
$assetStart = [System.DateTime]::UtcNow
Invoke-CheckedNativeCommand { & $bash -c "cd '$posixCheckout' && . ./prepare_assets.sh" } 'Windows asset packaging failed.'

$artifacts = foreach ($name in $expected) {
  $file = Get-Item -LiteralPath (Join-Path $assetDir $name) -ErrorAction Stop
  if ($file.LastWriteTimeUtc -lt $assetStart.AddSeconds(-2)) { throw "Stale build artifact: $name" }
  [ordered]@{ name = $file.Name; sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash; bytes = $file.Length }
}
$manifest = [ordered]@{
  # The commit this build was produced from. `desktopVersion` alone is not a
  # sufficient identity: the version hook bumps VERSION on every commit, so a
  # docs-only commit would otherwise invalidate an otherwise good manifest.
  builtFromCommit = (& git -C $root rev-parse HEAD).Trim()
  desktopVersion = (Get-Content -Raw -LiteralPath (Join-Path $root 'VERSION')).Trim()
  target = 'windows-x64'
  sources = [ordered]@{
    vscodium = $outerRevision
    codeOss = $innerRevision
  }
  pinnedAgentRevisionForMilestone2 = $lock.sources.moderado.commit
  artifacts = @($artifacts)
}
[System.IO.File]::WriteAllText((Join-Path $assetDir 'build-manifest.json'), ($manifest | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
