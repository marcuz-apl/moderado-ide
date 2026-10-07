// Export an immutable CLI snapshot without modifying the CLI checkout.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(readFileSync(join(root, 'sources.lock.json'))).sources.moderado;
const source = realpathSync(resolve(root, process.argv[2] || '.cache/moderado-v0.4.8'));
assert.ok(source.startsWith(join(root, '.cache') + sep), 'Source must be an IDE-local cached upstream checkout');
function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: source, encoding: 'utf8', shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
assert.equal(run('git', ['rev-parse', `${lock.tag}^{}`]), lock.commit, 'Pinned tag commit mismatch');
assert.equal(run('git', ['rev-parse', lock.tag]), lock.tagObject, 'Pinned tag object mismatch');
const staging = mkdtempSync(join(root, '.cache/vendor-staging-'));
const target = join(root, 'vendor/moderado');
try {
  run('git', ['archive', '--format=tar', `--output=${join(staging, 'snapshot.tar')}`, lock.commit, 'packages', 'package.json', 'tsconfig.base.json', 'LICENSE']);
  run('tar', ['-xf', join(staging, 'snapshot.tar'), '-C', staging]);
  function excludeTests(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) if (item.isDirectory()) {
      const child = join(directory, item.name);
      if (['test', 'tests', '__tests__'].includes(item.name)) rmSync(child, { recursive: true });
      else excludeTests(child);
    }
  }
  excludeTests(join(staging, 'packages'));
  assert.ok(readFileSync(join(target, 'package.json')).length && readFileSync(join(target, 'package-lock.json')).length, 'IDE npm wrapper missing');
  rmSync(join(target, 'packages'), { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(join(staging, 'packages'), join(target, 'packages'), { recursive: true });
  for (const file of ['tsconfig.base.json', 'LICENSE']) cpSync(join(staging, file), join(target, file));
  cpSync(join(staging, 'package.json'), join(target, 'workspace-package.json'));
  const files = [];
  function collect(directory, prefix = '') {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', 'VENDORED.json', 'tsconfig.tsbuildinfo'].includes(item.name)) continue;
      const relative = `${prefix}/${item.name}`;
      if (item.isDirectory()) collect(join(directory, item.name), relative);
      else files.push(relative);
    }
  }
  collect(target); files.sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
  const entries = files.map(file => `${file} ${createHash('sha256').update(readFileSync(join(target, file))).digest('hex').toUpperCase()}\n`).join('');
  const record = { pinnedCommit: lock.commit, sourceRepository: lock.repository, fileCount: files.length, treeHash: createHash('sha256').update(entries).digest('hex') };
  writeFileSync(join(target, 'VENDORED.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(`Vendored ${files.length} files from ${lock.tag} (${lock.commit})`);
} finally { rmSync(staging, { recursive: true, force: true }); }
