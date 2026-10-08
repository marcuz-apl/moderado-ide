import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../../.github/workflows/build-and-release.yml', import.meta.url), 'utf8');

test('installer builds run only by explicit platform and architecture dispatch', () => {
  assert.doesNotMatch(workflow, /^  (push|pull_request):/m);
  assert.match(workflow, /platform:[\s\S]*options: \[all, both, linux, windows, macos\]/);
  assert.match(workflow, /macos_arch:[\s\S]*options: \[both, arm64, x64\]/);
  assert.match(workflow, /default: all/);
  assert.match(workflow, /timeout-minutes: 180/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /node scripts\/build-linux\.mjs/);
  assert.match(workflow, /scripts\/build-deb\.sh/);
  assert.match(workflow, /scripts\/build-rpm\.sh/);
  assert.match(workflow, /if: \$\{\{ inputs\.platform == 'all' \|\| inputs\.platform == 'linux' \}\}/);
  assert.match(workflow, /node scripts\/build-macos\.mjs --arch arm64/);
  assert.match(workflow, /node scripts\/build-macos\.mjs --arch x64/);
  assert.match(workflow, /runs-on: macos-14/);
  assert.match(workflow, /runs-on: macos-15-intel/);
  assert.equal((workflow.match(/brew install gnu-sed jq/g) ?? []).length, 2);
});

test('publishing stays disabled and external actions are immutable', () => {
  assert.match(workflow, /publish:[\s\S]*if: \$\{\{ false \}\}/);
  assert.doesNotMatch(workflow, /contents: write|\$\{\{\s*secrets\.|gh release|softprops/);
  const actions = [...workflow.matchAll(/uses: (\S+)/g)].map(match => match[1]);
  assert.ok(actions.length > 0);
  for (const action of actions) assert.match(action, /^actions\/[a-z-]+@[a-f0-9]{40}$/);
  assert.match(workflow, /Microsoft\.VisualStudio\.Component\.VC\.14\.50\.18\.0\.x86\.x64\.Spectre/);
  assert.match(workflow, /https:\/\/aka\.ms\/vs\/17\/release\/vs_buildtools\.exe/);
  assert.match(workflow, /Get-AuthenticodeSignature \$bootstrapper/);
  assert.match(workflow, /Start-Process -FilePath \$bootstrapper -ArgumentList @\([\s\S]*'--channelId', 'VisualStudio\.17\.Release'[\s\S]*'--wait'[\s\S]*\) -Wait -PassThru/);
  assert.match(workflow, /Installer\\vswhere\.exe/);
  assert.doesNotMatch(workflow, /Installer\\setup\.exe[^\r\n]*--wait/);
  assert.doesNotMatch(workflow, /Installer\\vs_installer\.exe/);
  assert.equal((workflow.match(/GITHUB_TOKEN: \$\{\{ github\.token \}\}/g) ?? []).length, 2);
  assert.match(workflow, /NODE_VERSION: '24\.18\.0'/);
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
  assert.equal(triggers.workflow_dispatch.inputs.macos_arch.default, 'both');
  assert.equal(document.permissions.contents, 'read');
  assert.equal(Object.keys(document.jobs).length, 5);
  assert.equal(document.jobs.publish.if, '${{ false }}');
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
