// Native macOS development installers; ad-hoc signing only, no notarization or publication.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, copyFileSync, rmSync, statSync, readdirSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBranding, assertPrepared, verifyAgentFreshness } from './build-linux.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const write = (file, content) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content); };
export function parseMacArgs(args) {
  assert.equal(args.length, 2, 'Expected arguments: --arch x64|arm64');
  assert.equal(args[0], '--arch', 'Unknown argument');
  assert.ok(['x64', 'arm64'].includes(args[1]), 'Unsupported macOS arch');
  return args[1];
}
export function assertSourcePin(actual, expected) {
  assert.match(expected, /^[a-f0-9]{40}$/, 'Expected an exact source commit');
  assert.equal(actual, expected, 'Source pin mismatch');
}
export function macBuildEnvironment(lock, arch, inherited = process.env) {
  assert.ok(['x64', 'arm64'].includes(arch), 'Unsupported macOS arch');
  return { ...inherited, APP_NAME: 'Moderado IDE', BINARY_NAME: 'moderado-ide', CI_BUILD: 'no',
    DISABLE_UPDATE: 'yes', OS_NAME: 'osx', RELEASE_VERSION: lock.sources.vscodium.version,
    BUILD_SOURCEVERSION: lock.sources.codeOss.commit, MS_COMMIT: lock.sources.codeOss.commit, MS_TAG: lock.sources.codeOss.version,
    VSCODE_ARCH: arch, npm_config_arch: arch, VSCODE_QUALITY: 'stable', SHOULD_BUILD_CLI: 'no',
    SHOULD_BUILD_REH: 'no', SHOULD_BUILD_REH_WEB: 'no',
    MAX_OLD_SPACE_SIZE: inherited.MODERADO_BUILD_HEAP_MB || '12288',
    NODE_OPTIONS: `--max-old-space-size=${inherited.MODERADO_BUILD_HEAP_MB || '12288'}` };
}
export function macEditorBuildCommands(arch) {
  assert.ok(['x64', 'arm64'].includes(arch), 'Unsupported macOS arch');
  return [
    ['npm', ['run', 'gulp', 'vscode-min-prepack']],
    ['npm', ['run', 'copy-policy-dto', '--prefix', 'build']],
    ['node', ['build/lib/policies/policyGenerator.ts', 'build/lib/policies/policyData.jsonc', 'darwin']],
    ['npm', ['run', 'gulp', `vscode-darwin-${arch}-min-packing`]],
  ];
}
export function adHocSignMacApp(app, execute = run) {
  // Apple Silicon requires signed native code. '-' is an unauthenticated local
  // measurement, not an owner identity or a distribution certificate.
  execute('codesign', ['--force', '--deep', '--sign', '-', app]);
  execute('codesign', ['--verify', '--deep', '--strict', app]);
}
function run(command, args, cwd = root, env = process.env) {
  console.log(`Build: ${command} ${args.join(' ')} (${cwd})`);
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed`);
}
function output(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || `${command} failed`);
  return result.stdout.trim();
}
export function createMacIcon(repo, editor, execute = run) {
  const ico = readFileSync(join(repo, 'branding/moderado-ide.ico'));
  assert.equal(ico.readUInt16LE(2), 1, 'Expected ICO image');
  const png = ico.subarray(ico.readUInt32LE(18), ico.readUInt32LE(18) + ico.readUInt32LE(14));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Expected embedded PNG');
  const work = join(repo, 'build/macos-icon');
  const iconset = join(work, 'moderado.iconset');
  mkdirSync(iconset, { recursive: true });
  const source = join(work, 'source.png'); write(source, png);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) execute('sips', ['-z', String(size * scale), String(size * scale), source, '--out', join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)]);
  }
  mkdirSync(join(editor, 'resources/darwin'), { recursive: true });
  execute('iconutil', ['-c', 'icns', iconset, '-o', join(editor, 'resources/darwin/code.icns')]);
}
export function macArtifactManifest(directory, names, lock, sourceVersion, arch) {
  return { sourceVersion, target: `darwin-${arch}`, node: process.version,
    sources: Object.fromEntries(Object.entries(lock.sources).map(([name, source]) => [name, source.commit])),
    signed: false, published: false, artifacts: names.map(name => ({ name, bytes: statSync(join(directory, name)).size,
      sha256: createHash('sha256').update(readFileSync(join(directory, name))).digest('hex') })) };
}
function checkoutPinned(location, source) {
  assertSourcePin(source.commit, source.commit);
  if (!existsSync(join(location, '.git'))) {
    assert.ok(!existsSync(location) || readdirSync(location).length === 0, `Refusing nonempty unversioned checkout: ${location}`);
    mkdirSync(location, { recursive: true });
    run('git', ['init', '--quiet'], location);
    run('git', ['remote', 'add', 'origin', source.repository], location);
    run('git', ['fetch', '--depth', '1', 'origin', source.commit], location);
    run('git', ['checkout', '--detach', source.commit], location);
  }
  assertSourcePin(output('git', ['rev-parse', 'HEAD'], location), source.commit);
}
function main() {
  const arch = parseMacArgs(process.argv.slice(2));
  assert.equal(process.platform, 'darwin', 'macOS installers require a native macOS runner');
  assert.equal(process.arch, arch, 'Use a runner and Node executable matching the target arch');
  const lock = json(join(root, 'sources.lock.json'));
  assertSourcePin(json(join(root, 'vendor/moderado/VENDORED.json')).pinnedCommit, lock.sources.moderado.commit);
  const checkout = join(root, 'build/vscodium'); const editor = join(checkout, 'vscode');
  checkoutPinned(checkout, lock.sources.vscodium); checkoutPinned(editor, lock.sources.codeOss);
  assert.equal(process.version.slice(1), readFileSync(join(editor, '.nvmrc'), 'utf8').trim(), 'Use the pinned editor Node version');
  const env = macBuildEnvironment(lock, arch);
  for (const tool of ['jq', 'gsed', 'python3', 'clang', 'sips', 'iconutil', 'hdiutil', 'ditto', 'codesign']) output('which', [tool]);
  const tools = join(checkout, '.moderado-tools'); mkdirSync(tools, { recursive: true });
  if (!existsSync(join(tools, 'sed'))) symlinkSync(output('which', ['gsed']), join(tools, 'sed'));
  env.PATH = `${tools}:${env.PATH}`;
  const preparation = { vscodium: lock.sources.vscodium.commit, codeOss: lock.sources.codeOss.commit, node: process.version, arch };
  const marker = join(checkout, '.moderado-macos-prepared.json'); const preparing = join(checkout, '.moderado-macos-preparing.json');
  if (existsSync(marker)) {
    assertPrepared(json(marker), preparation);
    assert.ok(existsSync(join(editor, 'node_modules/gulp')), 'Prepared dependencies missing');
  } else {
    assert.ok(!existsSync(preparing), 'Partial macOS preparation; recreate the pinned build checkout before retrying');
    copyFileSync(join(root, 'branding/product.json'), join(checkout, 'product.json'));
    write(preparing, JSON.stringify(preparation));
    run('bash', ['./prepare_vscode.sh'], checkout, env);
    write(marker, JSON.stringify(preparation)); rmSync(preparing);
  }
  applyBranding(root, editor); createMacIcon(root, editor);
  const vendor = join(root, 'vendor/moderado'); const extension = join(root, 'extensions/moderado-agent');
  for (const cwd of [vendor, extension]) run('npm', ['ci'], cwd, env);
  run('npm', ['run', 'build'], vendor, env);
  for (const task of ['test', 'typecheck', 'compile']) run('npm', ['run', task], extension, env);
  const target = join(editor, 'extensions/moderado-agent'); rmSync(target, { recursive: true, force: true }); mkdirSync(target, { recursive: true });
  copyFileSync(join(extension, 'package.json'), join(target, 'package.json'));
  for (const directory of ['dist', 'assets']) cpSync(join(extension, directory), join(target, directory), { recursive: true });
  for (const [command, args] of macEditorBuildCommands(arch)) run(command, args, editor, env);
  const app = join(checkout, `VSCode-darwin-${arch}`, 'Moderado IDE.app'); const resources = join(app, 'Contents/Resources');
  const product = json(join(resources, 'app/product.json'));
  for (const [key, expected] of Object.entries(json(join(root, 'branding/product.json')))) assert.deepEqual(product[key], expected, `Packaged branding ${key}`);
  assertSourcePin(product.commit, lock.sources.codeOss.commit);
  verifyAgentFreshness(resources, extension);
  const iconName = output('plutil', ['-extract', 'CFBundleIconFile', 'raw', '-o', '-', join(app, 'Contents/Info.plist')]);
  assert.equal(iconName, `${json(join(editor, 'package.json')).name}.icns`, 'Packaged icon name');
  assert.deepEqual(readFileSync(join(resources, iconName)), readFileSync(join(editor, 'resources/darwin/code.icns')), 'Packaged macOS icon mismatch');
  copyFileSync(join(editor, 'LICENSE.txt'), join(resources, 'LICENSE.txt'));
  copyFileSync(join(root, 'LICENSE'), join(resources, 'Moderado IDE LICENSE'));
  const executable = join(app, 'Contents/MacOS', product.nameShort);
  assert.ok(existsSync(executable), 'Packaged editor executable missing');
  assert.equal(output('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(app, 'Contents/Info.plist')]), product.darwinBundleIdentifier);
  adHocSignMacApp(app);
  run(executable, ['-e', `const {createRequire}=require('node:module'); const r=createRequire(${JSON.stringify(join(resources, 'app/package.json'))}); for(const name of ['@vscodium/native-keymap/build/Release/keymapping.node','@vscode/spdlog','@vscode/sqlite3','@parcel/watcher','node-pty']) r(name);`], root, { ...env, ELECTRON_RUN_AS_NODE: '1', NODE_PATH: join(resources, 'app/node_modules.asar') });
  const sourceVersion = readFileSync(join(root, 'VERSION'), 'utf8').trim();
  assert.match(sourceVersion, /^v\d+\.\d+\.\d+\+\d{6}[0-9a-z]+$/);
  const directory = join(root, `build/installers/macos-${arch}`); mkdirSync(directory, { recursive: true });
  const name = `moderado-ide-${sourceVersion.slice(1)}-macos-${arch}`;
  const stage = join(root, `build/macos-dmg-${arch}`); rmSync(stage, { recursive: true, force: true }); mkdirSync(stage, { recursive: true });
  run('ditto', [app, join(stage, 'Moderado IDE.app')]); symlinkSync('/Applications', join(stage, 'Applications'));
  const names = [`${name}.dmg`, `${name}.zip`];
  for (const artifact of names) rmSync(join(directory, artifact), { force: true });
  run('hdiutil', ['create', '-volname', 'Moderado IDE', '-srcfolder', stage, '-format', 'UDZO', '-ov', join(directory, names[0])]);
  run('hdiutil', ['verify', join(directory, names[0])]);
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, join(directory, names[1])]);
  const manifest = { ...macArtifactManifest(directory, names, lock, sourceVersion, arch), builtFromCommit: output('git', ['rev-parse', 'HEAD']), purpose: 'unsigned-development', distributionSigned: false, adHocSigned: true, notarized: false };
  write(join(directory, 'build-manifest.json'), JSON.stringify(manifest, null, 2));
  write(join(directory, 'SHA256SUMS'), manifest.artifacts.map(artifact => `${artifact.sha256}  ${artifact.name}\n`).join(''));
  console.log(`Verified macOS development artifacts (ad-hoc signature only): ${directory}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
