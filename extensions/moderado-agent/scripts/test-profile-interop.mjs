import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(packageRoot, '../..');
const lock = JSON.parse(readFileSync(join(repositoryRoot, 'sources.lock.json'), 'utf8'));
const expectedCommit = lock.sources?.moderado?.commit;
const cliRoot = process.env.MODERADO_CLI_ROOT;

function fail(message) {
  process.stderr.write(`Pinned CLI profile interop unavailable: ${message}\n`);
  process.exit(2);
}

if (typeof expectedCommit !== 'string' || !/^[0-9a-f]{40}$/i.test(expectedCommit)) {
  fail('sources.lock.json does not contain a valid Moderado commit.');
}
if (!cliRoot) fail('set MODERADO_CLI_ROOT to a checkout of the pinned CLI source.');

const head = spawnSync('git', ['-C', cliRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
if (head.status !== 0) fail(`could not read Git HEAD at ${cliRoot}.`);
if (head.stdout.trim() !== expectedCommit) {
  fail(`checkout is ${head.stdout.trim()}, but sources.lock.json requires ${expectedCommit}.`);
}
for (const file of ['apps/cli/dist/config.js', 'apps/cli/dist/sessions.js']) {
  if (!existsSync(join(cliRoot, file))) fail(`build output is missing: ${file}. Build the pinned CLI checkout first.`);
}

const result = spawnSync('npx', ['vitest', 'run', 'test/profile.test.ts'], {
  cwd: packageRoot,
  env: { ...process.env, MODERADO_CLI_ROOT: cliRoot },
  stdio: 'inherit',
});
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
