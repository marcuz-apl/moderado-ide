import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('../../', import.meta.url));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('real Debian archive installs a working launcher and consistent desktop/runtime metadata', () => {
  const root = mkdtempSync(join(tmpdir(), 'moderado-deb-'));
  try {
    mkdirSync(join(root, 'scripts'));
    cpSync(join(source, 'scripts/build-deb.sh'), join(root, 'scripts/build-deb.sh'));
    cpSync(join(source, 'packaging'), join(root, 'packaging'), { recursive: true });
    writeFileSync(join(root, 'VERSION'), 'v0.1.23+261007b\n');
    const editor = join(root, 'build/vscodium/VSCode-linux-x64');
    mkdirSync(join(editor, 'bin'), { recursive: true });
    writeFileSync(join(editor, 'moderado-ide'), '#!/bin/sh\necho electron\n', { mode: 0o755 });
    writeFileSync(join(editor, 'bin/moderado-ide'), '#!/bin/sh\nprintf "launcher:%s\\n" "$1"\n', { mode: 0o755 });
    writeFileSync(join(editor, 'chrome-sandbox'), 'sandbox fixture', { mode: 0o4755 });
    chmodSync(join(editor, 'chrome-sandbox'), 0o4755);
    run(join(root, 'scripts/build-deb.sh'), [], root);
    const output = join(root, 'build/installers');
    const archive = join(output, readdirSync(output).find(name => name.endsWith('.deb')));
    const unpacked = join(root, 'unpacked');
    run('dpkg-deb', ['--extract', archive, unpacked], root);
    const launcher = join(unpacked, 'usr/bin/moderado-ide');
    assert.equal(readlinkSync(launcher), '/opt/moderado-ide/bin/moderado-ide');
    assert.equal(run(join(unpacked, readlinkSync(launcher)), ['--version'], root).trim(), 'launcher:--version');
    const desktop = readFileSync(join(unpacked, 'usr/share/applications/moderado-ide.desktop'), 'utf8');
    assert.match(desktop, /^Exec=moderado-ide %U$/m);
    assert.match(desktop, /^StartupWMClass=Moderado IDE$/m);
    assert.equal(run('dpkg-deb', ['--field', archive, 'Version'], root).trim(), '0.1.23+261007b');
    assert.equal(run('dpkg-deb', ['--field', archive, 'Architecture'], root).trim(), 'amd64');
    for (const field of ['Conflicts', 'Replaces', 'Breaks']) assert.equal(run('dpkg-deb', ['--field', archive, field], root).trim(), '');
    const dependencies = run('dpkg-deb', ['--field', archive, 'Depends'], root);
    for (const name of ['libxkbfile1', 'libatk-bridge2.0-0', 'libatk1.0-0', 'libexpat1', 'libnspr4', 'libudev1', 'xdg-utils']) assert.match(dependencies, new RegExp(`\\b${name}\\b`));
    assert.equal(statSync(join(unpacked, 'opt/moderado-ide/chrome-sandbox')).mode & 0o7777, 0o4755);
    assert.match(run('dpkg-deb', ['--contents', archive], root), /rwsr-xr-x root\/root.*chrome-sandbox/);
    const size = Number(run('dpkg-deb', ['--field', archive, 'Installed-Size'], root));
    assert.ok(size > 0 && size < 120000, 'size must describe the small fixture, not a hardcoded app size');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('x64 Debian builder rejects a host architecture that would mislabel its payload', () => {
  const root = mkdtempSync(join(tmpdir(), 'moderado-deb-arch-'));
  try {
    mkdirSync(join(root, 'scripts'));
    cpSync(join(source, 'scripts/build-deb.sh'), join(root, 'scripts/build-deb.sh'));
    writeFileSync(join(root, 'VERSION'), 'v0.1.23+261007b\n');
    const editor = join(root, 'build/vscodium/VSCode-linux-x64');
    mkdirSync(editor, { recursive: true });
    writeFileSync(join(editor, 'moderado-ide'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'dpkg'), '#!/bin/sh\necho arm64\n', { mode: 0o755 });
    const result = spawnSync(join(root, 'scripts/build-deb.sh'), [], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8', timeout: 10000,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requires amd64.*arm64/);
    assert.deepEqual(readdirSync(join(root, 'build/installers')), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
