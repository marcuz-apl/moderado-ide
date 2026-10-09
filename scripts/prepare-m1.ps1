$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$lock = Get-Content -Raw -LiteralPath (Join-Path $root 'sources.lock.json') | ConvertFrom-Json
$checkout = Join-Path $root 'build\vscodium'
if (Test-Path -LiteralPath $checkout) { throw 'Prepared checkout already exists. Use scripts/build-m1.ps1.' }

& git clone --branch $lock.sources.vscodium.tag --single-branch $lock.sources.vscodium.repository $checkout
if ($LASTEXITCODE -ne 0) { throw 'VSCodium clone failed.' }
if ((& git -C $checkout rev-parse HEAD).Trim() -ne $lock.sources.vscodium.commit) { throw 'VSCodium revision mismatch.' }

Copy-Item -LiteralPath (Join-Path $root 'branding\product.json') -Destination (Join-Path $checkout 'product.json') -Force
$env:APP_NAME = 'Moderado IDE'
$env:BINARY_NAME = 'moderado-ide'
$env:CI_BUILD = 'no'
$env:DISABLE_UPDATE = 'yes'
$env:MS_COMMIT = $lock.sources.codeOss.commit
$env:OS_NAME = 'windows'
$env:RELEASE_VERSION = $lock.sources.vscodium.version
$env:SHOULD_BUILD_CLI = 'no'
$env:VSCODE_ARCH = 'x64'
$env:VSCODE_QUALITY = 'stable'
$env:VSCODE_SKIP_NODE_VERSION_CHECK = 'yes'
$posixCheckout = (& 'C:\Program Files\Git\usr\bin\cygpath.exe' -u $checkout).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Git Bash path conversion failed.' }
$bash = 'C:\Program Files\Git\bin\bash.exe'
& $bash -c "cd '$posixCheckout' && . ./get_repo.sh && . ./prepare_vscode.sh"
if ($LASTEXITCODE -ne 0) { throw 'Pinned Code OSS fetch or VSCodium preparation failed.' }
if ((& git -C (Join-Path $checkout 'vscode') rev-parse HEAD).Trim() -ne $lock.sources.codeOss.commit) { throw 'Code OSS revision mismatch.' }

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
if (!$python) { throw 'Python 3.11 is required.' }
$env:PYTHON = $python
$env:npm_config_python = $python
$vs = (& (Join-Path $PSScriptRoot 'ensure-windows-build-tools.ps1') | Select-Object -Last 1).Trim()
Write-Output "Detected Visual Studio 2022 installation: $vs"
$env:vs2022_install = $vs
$env:npm_config_msvs_version = '2022'
$env:GYP_MSVS_VERSION = '2022'
& $bash -c "cd '$posixCheckout/vscode' && npm ci"
if ($LASTEXITCODE -ne 0) { throw 'Pinned Code OSS dependency installation failed.' }
Write-Output 'Prepared pinned source. Run scripts/build-m1.ps1 next.'
