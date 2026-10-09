import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../../.github/workflows/build-and-release.yml', import.meta.url), 'utf8');
const windowsBuildTools = readFileSync(new URL('../ensure-windows-build-tools.ps1', import.meta.url), 'utf8');
const releaseVerifier = readFileSync(new URL('../verify-release.ps1', import.meta.url), 'utf8');
const iconBuilder = readFileSync(new URL('../../branding/make-icon.ps1', import.meta.url), 'utf8');
const brandingScript = readFileSync(new URL('../apply-branding.ps1', import.meta.url), 'utf8');
const vendorScript = readFileSync(new URL('../vendor-moderado.ps1', import.meta.url), 'utf8');
const windowsScripts = ['../prepare-m1.ps1', '../build-m1.ps1']
  .map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('installer builds run only by explicit platform and architecture dispatch', () => {
  assert.doesNotMatch(workflow, /^  (push|pull_request):/m);
  assert.match(workflow, /platform:[\s\S]*options: \[all, both, linux, windows, macos, macos-intel\]/);
  assert.match(workflow, /source_ref:[\s\S]*type: string[\s\S]*default: ''/);
  assert.match(workflow, /default: all/);
  assert.match(workflow, /timeout-minutes: 180/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /node scripts\/build-linux\.mjs/);
  assert.match(workflow, /scripts\/build-deb\.sh/);
  assert.match(workflow, /scripts\/build-rpm\.sh/);
  assert.match(workflow, /if: \$\{\{ inputs\.platform == 'all' \|\| inputs\.platform == 'linux' \}\}/);
  assert.match(workflow, /node scripts\/build-macos\.mjs --arch arm64/);
  assert.match(workflow, /node scripts\/build-macos\.mjs --arch x64/);
  assert.match(workflow, /ref: \$\{\{ inputs\.source_ref \|\| github\.sha \}\}/);
  assert.match(workflow, /runs-on: macos-15-intel/);
  assert.match(workflow, /runs-on: macos-14/);
  assert.equal((workflow.match(/brew install gnu-sed jq/g) ?? []).length, 2);
});

test('publishing requires a complete default build and external actions are immutable', () => {
  assert.match(workflow, /publish:[\s\S]*needs: \[linux, windows, macos-arm64, macos-x64\]/);
  assert.match(workflow, /publish:[\s\S]*if: \$\{\{ inputs\.platform == 'all' && inputs\.source_ref == '' \}\}/);
  assert.match(workflow, /publish:[\s\S]*actions: read[\s\S]*contents: write/);
  assert.match(workflow, /actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(workflow, /scripts\/publish-release\.mjs/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  const actions = [...workflow.matchAll(/uses: (\S+)/g)].map(match => match[1]);
  assert.ok(actions.length > 0);
  for (const action of actions) assert.match(action, /^actions\/[a-z-]+@[a-f0-9]{40}$/);
  assert.match(workflow, /scripts\/ensure-windows-build-tools\.ps1 -InstallIfMissing/);
  assert.match(windowsBuildTools, /Microsoft\.VisualStudio\.Component\.VC\.14\.44\.17\.14\.x86\.x64\.Spectre/);
  assert.match(windowsBuildTools, /https:\/\/aka\.ms\/vs\/17\/release\/vs_buildtools\.exe/);
  assert.match(windowsBuildTools, /https:\/\/aka\.ms\/vs\/17\/release\/channel/);
  assert.match(windowsBuildTools, /Get-AuthenticodeSignature -LiteralPath \$bootstrapper/);
  assert.match(windowsBuildTools, /-version '\[17\.0,18\.0\)'/);
  assert.match(windowsBuildTools, /'install', '--installPath'[\s\S]*'--channelUri', 'https:\/\/aka\.ms\/vs\/17\/release\/channel'[\s\S]*'Microsoft\.VisualStudio\.Workload\.VCTools'/);
  assert.match(windowsBuildTools, /'modify', '--installPath'[\s\S]*'--channelId', 'VisualStudio\.17\.Release'/);
  assert.match(windowsBuildTools, /Start-Process -FilePath \$bootstrapper -ArgumentList \$arguments -Wait -PassThru/);
  assert.match(windowsBuildTools, /Microsoft\.VCToolsVersion\.default\.txt/);
  assert.match(windowsBuildTools, /lib\\spectre\\\$architecture\\libcmt\.lib/);
  assert.match(windowsScripts[1], /function Invoke-CheckedNativeCommand[\s\S]*\$ErrorActionPreference = 'Continue'[\s\S]*\$exitCode = \$LASTEXITCODE[\s\S]*if \(\$exitCode -ne 0\)/);
  assert.match(windowsScripts[1], /Invoke-CheckedNativeCommand \{ & powershell[\s\S]*build-agent-extension\.ps1/);
  assert.match(windowsScripts[1], /Invoke-CheckedNativeCommand \{ & \$bash -c/);
  assert.match(windowsScripts[1], /\$env:MAX_OLD_SPACE_SIZE = \$heapMb/,
    'the editor gulp script reads MAX_OLD_SPACE_SIZE while NODE_OPTIONS alone does not set it');
  assert.match(windowsScripts[0], /\$env:MAX_OLD_SPACE_SIZE = \$heapMb/,
    'pinned editor preparation writes the heap size into its gulp command');
  assert.match(releaseVerifier, /changed files=\$\(\$dirty\.Count\): \$dirtyDetail/,
    'dirty source file names are included in release verification evidence');
  for (const script of windowsScripts) {
    assert.match(script, /ensure-windows-build-tools\.ps1/);
    assert.match(script, /\$env:npm_config_msvs_version = '2022'/);
    assert.match(script, /\$env:GYP_MSVS_VERSION = '2022'/);
  }
  assert.doesNotMatch(workflow, /Installer\\setup\.exe[^\r\n]*--wait/);
  assert.doesNotMatch(workflow, /Installer\\vs_installer\.exe/);
  assert.equal((workflow.match(/GITHUB_TOKEN: \$\{\{ github\.token \}\}/g) ?? []).length, 2);
  assert.match(workflow, /NODE_VERSION: '24\.18\.0'/);
});

test('release builds keep generated branding and vendor metadata out of tracked source', () => {
  assert.match(iconBuilder, /Join-Path \$generated 'moderado-ide\.ico'/);
  assert.match(brandingScript, /branding\\generated\\moderado-ide\.ico/);
  assert.match(workflow, /vendor-moderado\.ps1[^\r\n]*-MetadataPath 'build\\vendor-moderado\.json'/);
  assert.match(vendorScript, /\[string\]\$MetadataPath/);
  assert.match(vendorScript, /\$trackedMetadata = Join-Path \$target 'VENDORED\.json'/);
  assert.match(vendorScript, /\$metadataPath = if \(\$MetadataPath\)/);
});

test('Windows download names use the Moderado IDE version, not the upstream editor version', () => {
  const windowsBuild = windowsScripts[1];
  assert.match(windowsBuild, /desktopVersion.*Get-Content.*VERSION/);
  assert.match(windowsBuild, /displayVersion.*Matches\['semver'\]/);
  assert.match(windowsBuild, /\$env:MODERADO_VERSION = \$displayVersion/);
  assert.match(windowsBuild, /\$env:MODERADO_FILE_VERSION = "\$displayVersion\.0"/);
  assert.match(windowsBuild, /Moderado IDE-win32-x64-\$displayVersion\.zip/);
  assert.match(windowsBuild, /Moderado IDESetup-x64-\$displayVersion\.exe/);
  assert.match(windowsBuild, /Moderado IDEUserSetup-x64-\$displayVersion\.exe/);
  assert.match(brandingScript, /Version: process\.env\.MODERADO_VERSION \|\| pkg\.version/);
  assert.match(brandingScript, /RawVersion: process\.env\.MODERADO_FILE_VERSION \|\|/);
  assert.match(releaseVerifier, /Moderado IDE-win32-x64-\$displayVersion\.zip/);
});

const python = ['python3', 'python'].find(command => spawnSync(command, ['-c', 'import yaml'], { encoding: 'utf8', shell: false }).status === 0);
test('workflow parses as YAML with valid job steps', { skip: !python && 'No installed PyYAML parser' }, () => {
  const parsed = spawnSync(python, ['-c', 'import sys,json,yaml; print(json.dumps(yaml.safe_load(sys.stdin.read())))'], { input: workflow, encoding: 'utf8', shell: false });
  assert.equal(parsed.status, 0, parsed.stderr);
  const document = JSON.parse(parsed.stdout);
  // PyYAML uses YAML 1.1, where GitHub's `on` key is parsed as boolean true.
  const triggers = document.on ?? document.true;
  assert.deepEqual(Object.keys(triggers), ['workflow_dispatch']);
  assert.equal(triggers.workflow_dispatch.inputs.platform.default, 'all');
  assert.equal(triggers.workflow_dispatch.inputs.source_ref.default, '');
  assert.equal(triggers.workflow_dispatch.inputs.macos_arch, undefined);
  assert.equal(document.permissions.contents, 'read');
  assert.equal(Object.keys(document.jobs).length, 5);
  assert.equal(document.jobs['macos-arm64'].env?.MODERADO_BUILD_HEAP_MB, undefined,
    'arm64 must use the macOS build script heap default instead of a smaller workflow override');
  assert.equal(document.jobs['macos-x64'].env?.MODERADO_BUILD_HEAP_MB, undefined,
    'x64 must use the macOS build script heap default instead of a smaller workflow override');
  assert.equal(document.jobs['macos-x64'].steps[0].with.ref, '${{ inputs.source_ref || github.sha }}');
  assert.equal(document.jobs.publish.if, "${{ inputs.platform == 'all' && inputs.source_ref == '' }}");
  assert.deepEqual(document.jobs.publish.needs, ['linux', 'windows', 'macos-arm64', 'macos-x64']);
  assert.equal(document.jobs.publish.permissions.actions, 'read');
  assert.equal(document.jobs.publish.permissions.contents, 'write');
  for (const [name, job] of Object.entries(document.jobs)) {
    if (name !== 'publish') {
      assert.equal(job['timeout-minutes'], 180);
      assert.match(job.if, /inputs\.platform/);
      const upload = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
      assert.equal(upload.with['if-no-files-found'], 'error');
      const artifact = {
        linux: 'moderado-ide-linux-x64',
        windows: 'moderado-ide-windows-x64',
        'macos-arm64': 'moderado-ide-macos-arm64',
        'macos-x64': 'moderado-ide-macos-x64',
      }[name];
      assert.equal(upload.with.name, artifact);
    }
  }
  for (const job of Object.values(document.jobs)) {
    assert.ok(Array.isArray(job.steps));
    for (const step of job.steps) assert.ok(step.uses || typeof step.run === 'string');
  }
});
