param(
  [switch]$InstallIfMissing
)

$ErrorActionPreference = 'Stop'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$component = 'Microsoft.VisualStudio.Component.VC.14.44.17.14.x86.x64.Spectre'
$toolsComponent = 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64'

if (-not (Test-Path -LiteralPath $vswhere)) {
  throw 'Visual Studio Installer vswhere.exe is missing.'
}

function Find-VisualStudio2022 {
  $path = & $vswhere -latest -products '*' -version '[17.0,18.0)' -requires $toolsComponent -property installationPath | Select-Object -First 1
  if ($path) { return $path.Trim() }
  return $null
}

function Test-SpectreLibraries([string]$installationPath) {
  $versionFile = Join-Path $installationPath 'VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt'
  if (-not (Test-Path -LiteralPath $versionFile)) { return $false }
  $version = (Get-Content -Raw -LiteralPath $versionFile).Trim()
  if ($version -notmatch '^14\.\d+\.\d+$') { return $false }
  $toolset = Join-Path $installationPath "VC\Tools\MSVC\$version"
  foreach ($architecture in 'x64', 'x86') {
    $library = Join-Path $toolset "lib\spectre\$architecture\libcmt.lib"
    if (-not (Test-Path -LiteralPath $library)) { return $false }
  }
  return $true
}

$vs = Find-VisualStudio2022
$ready = $null
if ($vs) {
  $ready = & $vswhere -latest -products '*' -version '[17.0,18.0)' -requires $component -property installationPath | Select-Object -First 1
}

if ((-not $ready -or -not (Test-SpectreLibraries $vs)) -and $InstallIfMissing) {
  $tempDirectory = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
  $bootstrapper = Join-Path $tempDirectory 'vs2022_buildtools.exe'
  Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vs_buildtools.exe' -OutFile $bootstrapper
  $signature = Get-AuthenticodeSignature -LiteralPath $bootstrapper
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation') {
    throw 'The Visual Studio 2022 Build Tools bootstrapper signature is invalid.'
  }

  if ($vs) {
    $arguments = @(
      'modify', '--installPath', "`"$vs`"", '--channelId', 'VisualStudio.17.Release',
      '--add', $component, '--quiet', '--wait', '--norestart'
    )
  } else {
    $vs = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio\2022\BuildTools'
    $arguments = @(
      'install', '--installPath', "`"$vs`"", '--channelUri', 'https://aka.ms/vs/17/release/channel',
      '--add', 'Microsoft.VisualStudio.Workload.VCTools', '--add', $component,
      '--includeRecommended', '--quiet', '--wait', '--norestart'
    )
  }

  Write-Host "Ensuring Visual Studio 2022 C++ tools and Spectre libraries at $vs"
  $process = Start-Process -FilePath $bootstrapper -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -notin @(0, 3010)) { throw "Visual Studio 2022 Build Tools installation failed: $($process.ExitCode)" }

  $ready = & $vswhere -latest -products '*' -version '[17.0,18.0)' -requires $component -property installationPath | Select-Object -First 1
}

if (-not $ready) {
  throw 'Visual Studio 2022 C++ tools with the x86/x64 Spectre component are required. Run scripts/ensure-windows-build-tools.ps1 -InstallIfMissing.'
}
$ready = $ready.Trim()
if (-not (Test-SpectreLibraries $ready)) {
  throw "Spectre static libraries at VC\Tools\MSVC\<version>\lib\spectre\<arch>\libcmt.lib are missing from the selected Visual Studio 2022 toolset at $ready. Run scripts/ensure-windows-build-tools.ps1 -InstallIfMissing."
}

Write-Host "Verified Visual Studio 2022 Spectre libraries: $ready"
if ($env:GITHUB_ENV) {
  "MODERADO_VS_INSTALL=$ready" >> $env:GITHUB_ENV
  "vs2022_install=$ready" >> $env:GITHUB_ENV
  'npm_config_msvs_version=2022' >> $env:GITHUB_ENV
  'GYP_MSVS_VERSION=2022' >> $env:GITHUB_ENV
}
Write-Output $ready
