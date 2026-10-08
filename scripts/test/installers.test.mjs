import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const source = fileURLToPath(new URL('../../', import.meta.url));

for (const format of ['deb', 'rpm']) {
  for (const custom of [false, true]) {
    test(`${format} creates ${custom ? 'a custom' : 'the default build'} output directory and writes its installer there`, () => {
      const root = mkdtempSync(join(tmpdir(), 'moderado installers '));
      try {
        mkdirSync(join(root, 'scripts'));
        cpSync(join(source, `scripts/build-${format}.sh`), join(root, `scripts/build-${format}.sh`));
        cpSync(join(source, 'packaging'), join(root, 'packaging'), { recursive: true });
        for (const name of ['LICENSE', 'README.md']) cpSync(join(source, name), join(root, name));
        writeFileSync(join(root, 'VERSION'), 'v0.1.22+261007a\n');
        const editor = join(root, 'build/vscodium/VSCode-linux-x64');
        mkdirSync(editor, { recursive: true });
        writeFileSync(join(editor, 'moderado-ide'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        mkdirSync(join(editor, 'bin'));
        writeFileSync(join(editor, 'bin/moderado-ide'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
        const bin = join(root, 'bin');
        mkdirSync(bin);
        // External package builders are replaced; output routing and file copies run normally.
        writeFileSync(join(bin, 'dpkg'), '#!/bin/sh\necho amd64\n', { mode: 0o755 });
        writeFileSync(join(bin, 'dpkg-deb'), '#!/bin/sh\nprintf fixture > "$4"\n', { mode: 0o755 });
        writeFileSync(join(bin, 'rpmbuild'), '#!/bin/sh\ntopdir=${4#_topdir }\nmkdir -p "$topdir/RPMS/x86_64"\nprintf fixture > "$topdir/RPMS/x86_64/moderado-ide-0.1.22-261007a.x86_64.rpm"\n', { mode: 0o755 });
        const output = custom ? join(root, 'custom output/installers') : join(root, 'build/installers');
        const args = custom ? [editor, output] : [];
        const result = spawnSync(join(root, `scripts/build-${format}.sh`), args, {
          cwd: tmpdir(), env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8', timeout: 10000,
        });
        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(output), true, 'output directory must be created');
        assert.equal(readdirSync(output).filter(name => name.endsWith(`.${format}`)).length, 1);
        assert.equal(readdirSync(root).some(name => name.endsWith(`.${format}`)), false);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
}
