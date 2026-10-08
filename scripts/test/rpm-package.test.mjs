import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('../../', import.meta.url));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}

test('real RPM preserves the payload, uses VERSION, and provides the CLI launcher', () => {
  const root = mkdtempSync(join(tmpdir(), 'moderado-rpm-'));
  try {
    mkdirSync(join(root, 'scripts'));
    cpSync(join(source, 'scripts/build-rpm.sh'), join(root, 'scripts/build-rpm.sh'));
    cpSync(join(source, 'packaging'), join(root, 'packaging'), { recursive: true });
    for (const file of ['LICENSE', 'README.md']) cpSync(join(source, file), join(root, file));
    writeFileSync(join(root, 'VERSION'), 'v0.1.23+2610084\n');
    const editor = join(root, 'editor');
    mkdirSync(join(editor, 'bin'), { recursive: true });
    writeFileSync(join(editor, 'moderado-ide'), '#!/bin/sh\necho electron\n', { mode: 0o755 });
    writeFileSync(join(editor, 'bin/moderado-ide'), '#!/bin/sh\necho launcher\n', { mode: 0o755 });
    writeFileSync(join(editor, 'chrome-sandbox'), 'sandbox fixture', { mode: 0o4755 });
    chmodSync(join(editor, 'chrome-sandbox'), 0o4755);
    const foreign = join(editor, 'resources/app/node_modules.asar.unpacked/tool/bin/linux-arm64');
    mkdirSync(foreign, { recursive: true });
    cpSync('/bin/true', join(foreign, 'unused-tool'));
    run(join(root, 'scripts/build-rpm.sh'), [editor], root);
    const output = join(root, 'build/installers');
    const archive = join(output, readdirSync(output).find(name => name.endsWith('.rpm')));
    assert.equal(run('rpm', ['-qp', '--qf', '%{VERSION}+%{RELEASE} %{ARCH}', archive], root), '0.1.23+2610084 x86_64');
    const files = run('rpm', ['-qp', '--dump', archive], root);
    assert.match(files, /\/usr\/bin\/moderado-ide .*\/opt\/moderado-ide\/bin\/moderado-ide/m);
    assert.match(files, /\/opt\/moderado-ide\/chrome-sandbox .*0104755 root root/m);
    const dependencies = run('rpm', ['-qp', '--requires', archive], root);
    assert.doesNotMatch(dependencies, /libc6|libgcc1|libglib2\.0-0|libgtk-3-0/);
    assert.match(dependencies, /xdg-utils/);
    assert.doesNotMatch(dependencies, /libc\.so\.6/, 'foreign utility must not create host dependencies');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
