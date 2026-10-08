import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { macBuildEnvironment, assertSourcePin, createMacIcon, macArtifactManifest, parseMacArgs, macEditorBuildCommands, adHocSignMacApp } from '../build-macos.mjs';

const lock = { sources: { vscodium: { commit: 'a'.repeat(40), version: '1.135.06055' }, codeOss: { commit: 'b'.repeat(40) }, moderado: { commit: 'c'.repeat(40) } } };
test('mac target and upstream commands remain native and pinned', () => {
  assert.equal(parseMacArgs(['--arch', 'arm64']), 'arm64');
  assert.throws(() => parseMacArgs(['--arch', 'universal']), /arch/);
  assert.throws(() => parseMacArgs(['--publish']), /argument/);
  const env = macBuildEnvironment(lock, 'arm64', {});
  assert.equal(env.OS_NAME, 'osx'); assert.equal(env.VSCODE_ARCH, 'arm64');
  assert.equal(env.MS_COMMIT, lock.sources.codeOss.commit); assert.equal(env.CI_BUILD, 'no');
  assert.equal(env.SHOULD_BUILD_REH, 'no'); assert.equal(env.DISABLE_UPDATE, 'yes');
  assert.equal(env.MAX_OLD_SPACE_SIZE, '12288');
  assert.equal(env.NODE_OPTIONS, '--max-old-space-size=12288');
});
test('source pins reject unexpected revisions and malformed commits', () => {
  assertSourcePin('a'.repeat(40), 'a'.repeat(40));
  assert.throws(() => assertSourcePin('b'.repeat(40), 'a'.repeat(40)), /pin/);
  assert.throws(() => assertSourcePin('main', 'main'), /commit/);
});
test('native icon generation uses existing PNG and argument arrays', () => {
  const root = mkdtempSync(join(tmpdir(), 'moderado-mac-icon-'));
  try {
    mkdirSync(join(root, 'branding'));
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
    writeFileSync(join(root, 'branding/moderado-ide.ico'), Buffer.concat([ico, png]));
    const calls = [];
    createMacIcon(root, join(root, 'editor'), (command, args) => calls.push({ command, args }));
    assert.equal(calls.filter(call => call.command === 'sips').length, 10);
    assert.deepEqual(calls.at(-1).args.slice(0, 2), ['-c', 'icns']);
    assert.equal(calls.at(-1).command, 'iconutil');
    assert.deepEqual(readFileSync(join(root, 'build/macos-icon/source.png')), png);
    assert.ok(calls.at(-1).args.includes(join(root, 'editor/resources/darwin/code.icns')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('artifact metadata records actual checksums and unsigned unpublished sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'moderado-mac-artifacts-'));
  try {
    writeFileSync(join(root, 'test.zip'), 'abc');
    const manifest = macArtifactManifest(root, ['test.zip'], lock, 'v0.1.23+2610081', 'x64');
    assert.equal(manifest.signed, false); assert.equal(manifest.published, false);
    assert.equal(manifest.sourceVersion, 'v0.1.23+2610081'); assert.equal(manifest.target, 'darwin-x64');
    assert.equal(manifest.sources.codeOss, lock.sources.codeOss.commit);
    assert.equal(manifest.artifacts[0].bytes, 3);
    assert.equal(manifest.artifacts[0].sha256, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('mac editor packing commands match pinned upstream and avoid signing', () => {
  assert.deepEqual(macEditorBuildCommands('arm64'), [
    ['npm', ['run', 'gulp', 'vscode-min-prepack']],
    ['npm', ['run', 'copy-policy-dto', '--prefix', 'build']],
    ['node', ['build/lib/policies/policyGenerator.ts', 'build/lib/policies/policyData.jsonc', 'darwin']],
    ['npm', ['run', 'gulp', 'vscode-darwin-arm64-min-packing']],
  ]);
  assert.throws(() => macEditorBuildCommands('universal'), /arch/);
});

test('development app is ad-hoc signed then verified with native codesign', () => {
  const calls = [];
  adHocSignMacApp('/tmp/Moderado IDE.app', (command, args) => calls.push([command, args]));
  assert.deepEqual(calls, [
    ['codesign', ['--force', '--deep', '--sign', '-', '/tmp/Moderado IDE.app']],
    ['codesign', ['--verify', '--deep', '--strict', '/tmp/Moderado IDE.app']],
  ]);
});
