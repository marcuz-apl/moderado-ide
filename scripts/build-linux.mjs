// Local Linux x64 development build. Uses only pinned upstream and Node APIs.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, existsSync, realpathSync, statSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, value); };

export function assertPrepared(actual, expected) {
  assert.deepEqual(actual, expected, 'Prepared source/toolchain mismatch; recreate the pinned editor checkout');
}

export function applyBranding(repo, editor) {
  const product = { ...json(join(editor, 'product.json')), ...json(join(repo, 'branding/product.json')) };
  write(join(editor, 'product.json'), JSON.stringify(product, null, 2));
  const ico = readFileSync(join(repo, 'branding/moderado-ide.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'Expected ICO image');
  const png = ico.subarray(ico.readUInt32LE(18), ico.readUInt32LE(18) + ico.readUInt32LE(14));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Expected embedded PNG');
  write(join(editor, 'resources/linux/code.png'), png);
  for (const target of ['src/vs/workbench/browser/media/code-icon.svg', 'src/vs/sessions/browser/media/vscode-icon.svg']) {
    write(join(editor, target), readFileSync(join(repo, 'branding/code-icon.svg')));
  }
  for (const variant of ['dark', 'light', 'hcDark', 'hcLight']) {
    write(join(editor, `src/vs/workbench/browser/parts/editor/media/letterpress-${variant}.svg`), readFileSync(join(repo, `branding/letterpress-${variant}.svg`)));
  }
}

export function verifyPackage(portable) {
  const product = json(join(portable, 'resources/app/product.json'));
  for (const [key, value] of Object.entries({ nameShort: 'Moderado IDE', applicationName: 'moderado-ide', dataFolderName: '.moderado-ide', linuxIconName: 'moderado-ide', urlProtocol: 'moderado-ide', updateUrl: '' })) assert.equal(product[key], value, key);
  for (const file of ['moderado-ide', 'LICENSE.txt', 'LICENSES.chromium.html', 'Moderado IDE LICENSE', 'resources/app/extensions/moderado-agent/dist/extension.js', 'resources/app/extensions/moderado-agent/dist/agent-core.js', 'resources/app/node_modules.asar.unpacked/@vscodium/native-keymap/build/Release/keymapping.node']) {
    assert.ok(existsSync(join(portable, file)), `Package missing ${file}`);
    assert.ok(statSync(join(portable, file)).size > 0, `Package empty ${file}`);
  }
}

export function verifyAgentFreshness(portable, extension) {
  assert.deepEqual(json(join(portable, 'resources/app/extensions/moderado-agent/package.json')), json(join(extension, 'package.json')), 'Packaged agent manifest is stale; run the full build');
  for (const file of ['dist/extension.js', 'dist/agent-core.js']) {
    assert.deepEqual(readFileSync(join(portable, 'resources/app/extensions/moderado-agent', file)), readFileSync(join(extension, file)), `Packaged agent is stale: ${file}; run the full build`);
  }
}

function run(command, args, cwd = root, env = process.env) {
  console.log(`Build: ${command} ${args.join(' ')} (${cwd})`);
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
function output(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout.trim();
}

function main() {
  assert.equal(process.platform, 'linux', 'Run this build inside Linux/WSL');
  assert.equal(process.arch, 'x64', 'This local build targets Linux x64');
  assert.ok(!realpathSync(root).startsWith('/mnt/'), 'Build from the WSL/Linux filesystem');
  const checkout = join(root, 'build/vscodium');
  const editor = join(checkout, 'vscode');
  const lock = json(join(root, 'sources.lock.json'));
  assert.equal(json(join(root, 'vendor/moderado/VENDORED.json')).pinnedCommit, lock.sources.moderado.commit, 'Vendored agent does not match the source lock');
  const packageOnly = process.argv.includes('--package-only');
  assert.equal(process.version.slice(1), readFileSync(join(editor, '.nvmrc'), 'utf8').trim(), 'Use the editor-pinned Node version');
  for (const [name, location] of [['vscodium', checkout], ['codeOss', editor]]) {
    assert.equal(output('git', ['rev-parse', 'HEAD'], location), lock.sources[name].commit, `${name} source pin`);
  }
  const env = { ...process.env, APP_NAME: 'Moderado IDE', BINARY_NAME: 'moderado-ide', CI_BUILD: 'no', DISABLE_UPDATE: 'yes', OS_NAME: 'linux', RELEASE_VERSION: lock.sources.vscodium.version, MS_COMMIT: lock.sources.codeOss.commit, VSCODE_ARCH: 'x64', VSCODE_QUALITY: 'stable', SHOULD_BUILD_CLI: 'no', SHOULD_BUILD_REH: 'no', SHOULD_BUILD_REH_WEB: 'no', VSCODE_SKIP_NODE_VERSION_CHECK: 'yes', MAX_OLD_SPACE_SIZE: process.env.MODERADO_BUILD_HEAP_MB || '12288', npm_config_build_from_source_native_keymap: 'false' };
  env.NODE_OPTIONS = `--max-old-space-size=${env.MAX_OLD_SPACE_SIZE}`;
  const marker = join(checkout, '.moderado-linux-prepared.json');
  const preparation = { vscodium: lock.sources.vscodium.commit, codeOss: lock.sources.codeOss.commit, node: process.version };
  const preparing = join(checkout, '.moderado-linux-preparing.json');
  if (existsSync(marker)) {
    assertPrepared(json(marker), preparation);
    assert.ok(existsSync(join(editor, 'node_modules/gulp')), 'Prepared dependencies missing; recreate the pinned editor checkout');
  }
  if (!existsSync(marker)) {
    assert.ok(!existsSync(preparing), 'Partial preparation detected; inspect the log and recreate the pinned editor checkout before retrying');
    for (const tool of ['jq', 'pkg-config', 'gcc', 'g++', 'make', 'python3']) output('which', [tool], root);
    for (const library of ['x11', 'xkbfile', 'libsecret-1', 'krb5']) run('pkg-config', ['--exists', library]);
    copyFileSync(join(root, 'branding/product.json'), join(checkout, 'product.json'));
    write(preparing, JSON.stringify(preparation));
    run('bash', ['./prepare_vscode.sh'], checkout, env);
    write(marker, JSON.stringify(preparation, null, 2));
    rmSync(preparing);
  }
  if (process.argv.includes('--prepare-only')) return;
  const nativeMarker = join(checkout, '.moderado-linux-native.json');
  if (existsSync(nativeMarker)) assertPrepared(json(nativeMarker), preparation);
  else {
    // Use the pinned upstream Electron/Chromium toolchain for native ABI compatibility.
    const tools = join(checkout, '.moderado-tools'); mkdirSync(tools, { recursive: true });
    if (!existsSync(join(tools, 'python'))) symlinkSync(output('which', ['python3'], root), join(tools, 'python'));
    run('npm', ['ci', '--prefix', 'build'], editor, env);
    run('bash', ['-c', 'source ./build/azure-pipelines/linux/setup-env.sh && npm ci'], editor, { ...env, npm_config_arch: 'x64', PATH: `${tools}:${env.PATH}` });
    write(nativeMarker, JSON.stringify(preparation));
  }
  applyBranding(root, editor);
  const vendor = join(root, 'vendor/moderado');
  const extension = join(root, 'extensions/moderado-agent');
  for (const cwd of [vendor, extension]) if (!existsSync(join(cwd, 'node_modules'))) run('npm', ['ci'], cwd, env);
  run('npm', ['run', 'build'], vendor, env);
  for (const task of ['test', 'typecheck', 'compile']) run('npm', ['run', task], extension, env);
  const target = join(editor, 'extensions/moderado-agent');
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  copyFileSync(join(extension, 'package.json'), join(target, 'package.json'));
  for (const directory of ['dist', 'assets']) cpSync(join(extension, directory), join(target, directory), { recursive: true });
  if (!packageOnly) {
    run('npm', ['run', 'gulp', 'vscode-min-prepack'], editor, env);
    run('npm', ['run', 'copy-policy-dto', '--prefix', 'build'], editor, env);
    run('node', ['build/lib/policies/policyGenerator.ts', 'build/lib/policies/policyData.jsonc', 'linux'], editor, env);
    run('npm', ['run', 'gulp', 'vscode-linux-x64-min-packing'], editor, env);
  }
  const portable = join(checkout, 'VSCode-linux-x64');
  copyFileSync(join(editor, 'LICENSE.txt'), join(portable, 'LICENSE.txt'));
  copyFileSync(join(root, 'LICENSE'), join(portable, 'Moderado IDE LICENSE'));
  verifyPackage(portable);
  verifyAgentFreshness(portable, extension);
  const product = json(join(portable, 'resources/app/product.json'));
  assert.equal(product.commit, lock.sources.codeOss.commit, 'Packaged editor source pin');
  assert.deepEqual(readFileSync(join(portable, 'resources/app/resources/linux/code.png')), readFileSync(join(editor, 'resources/linux/code.png')), 'Packaged Linux icon is stale');
  run(join(portable, 'moderado-ide'), ['-e', `const {createRequire}=require('node:module'); const r=createRequire(${JSON.stringify(join(portable, 'resources/app/package.json'))}); for(const name of ['@vscodium/native-keymap/build/Release/keymapping.node','@vscode/spdlog','@vscode/sqlite3','@parcel/watcher','node-pty']) { r(name); console.log('Native module loaded:',name); }`], portable, { ...env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: join(portable, 'resources/app/node_modules.asar') });
  const assets = join(checkout, 'assets'); mkdirSync(assets, { recursive: true });
  const name = `Moderado IDE-linux-x64-${lock.sources.vscodium.version}.tar.gz`;
  const archive = join(assets, name);
  run('tar', ['-czf', archive, '-C', portable, '.']);
  run('tar', ['-tzf', archive]);
  const manifest = { builtFromCommit: output('git', ['rev-parse', 'HEAD'], root), sourceChanges: output('git', ['status', '--porcelain', '--untracked-files=all'], root), desktopVersion: readFileSync(join(root, 'VERSION'), 'utf8').trim(), target: 'linux-x64', purpose: 'local-wsl-development', node: process.version, sources: Object.fromEntries(Object.entries(lock.sources).map(([key, value]) => [key, value.commit])), signed: false, published: false, artifacts: [{ name, bytes: statSync(archive).size, sha256: createHash('sha256').update(readFileSync(archive)).digest('hex') }] };
  write(join(assets, 'build-manifest-linux.json'), JSON.stringify(manifest, null, 2));
  console.log(`Linux build verified: ${archive}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
