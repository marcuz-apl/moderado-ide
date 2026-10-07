import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBranding, verifyPackage, assertPrepared } from '../build-linux.mjs';

test('Linux branding reuses the existing mark, PNG and product identifiers', () => {
  const root = mkdtempSync(join(tmpdir(), 'moderado-linux-'));
  try {
    mkdirSync(join(root, 'branding'));
    mkdirSync(join(root, 'editor'));
    writeFileSync(join(root, 'branding/product.json'), JSON.stringify({ nameShort: 'Moderado IDE', applicationName: 'moderado-ide', linuxIconName: 'moderado-ide', updateUrl: '' }));
    writeFileSync(join(root, 'editor/product.json'), JSON.stringify({ inherited: true, nameShort: 'VSCodium' }));
    writeFileSync(join(root, 'branding/code-icon.svg'), '<svg>Moderado</svg>');
    for (const variant of ['dark', 'light', 'hcDark', 'hcLight']) writeFileSync(join(root, `branding/letterpress-${variant}.svg`), `<svg>${variant}</svg>`);
    const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
    const ico = Buffer.alloc(22); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4); ico.writeUInt32LE(png.length, 14); ico.writeUInt32LE(22, 18);
    writeFileSync(join(root, 'branding/moderado-ide.ico'), Buffer.concat([ico, png]));
    applyBranding(root, join(root, 'editor'));
    const product = JSON.parse(readFileSync(join(root, 'editor/product.json')));
    assert.equal(product.inherited, true); assert.equal(product.applicationName, 'moderado-ide');
    assert.deepEqual(readFileSync(join(root, 'editor/resources/linux/code.png')), png);
    assert.equal(readFileSync(join(root, 'editor/src/vs/workbench/browser/media/code-icon.svg'), 'utf8'), '<svg>Moderado</svg>');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('verification refuses a package missing the agent or native keyboard binary', () => {
  const root = mkdtempSync(join(tmpdir(), 'moderado-linux-'));
  try {
    const write = (name, content = 'fixture') => { mkdirSync(join(root, name, '..'), { recursive: true }); writeFileSync(join(root, name), content); };
    write('resources/app/product.json', JSON.stringify({ nameShort: 'Moderado IDE', applicationName: 'moderado-ide', dataFolderName: '.moderado-ide', linuxIconName: 'moderado-ide', urlProtocol: 'moderado-ide', updateUrl: '' }));
    for (const name of ['moderado-ide', 'LICENSE.txt', 'LICENSES.chromium.html', 'Moderado IDE LICENSE']) write(name);
    assert.throws(() => verifyPackage(root), /missing.*moderado-agent/);
    for (const name of ['extension.js', 'agent-core.js']) write(`resources/app/extensions/moderado-agent/dist/${name}`);
    assert.throws(() => verifyPackage(root), /missing.*keymapping/);
    write('resources/app/node_modules.asar.unpacked/@vscodium/native-keymap/build/Release/keymapping.node');
    assert.doesNotThrow(() => verifyPackage(root));
  }
  finally { rmSync(root, { recursive: true, force: true }); }
});


test('stale preparation is rejected instead of skipping upstream preparation', () => {
  assert.throws(() => assertPrepared({ codeOss: 'old', node: 'v24.18.0' }, { codeOss: 'new', node: 'v24.18.0' }), /prepared.*mismatch/i);
  assert.doesNotThrow(() => assertPrepared({ codeOss: 'same' }, { codeOss: 'same' }));
});

test('packaging-only refuses an agent that differs from the freshly built extension', async () => {
  const { verifyAgentFreshness } = await import('../build-linux.mjs');
  const root = mkdtempSync(join(tmpdir(), 'moderado-freshness-'));
  try {
    const extension = join(root, 'source'); const packed = join(root, 'portable/resources/app/extensions/moderado-agent');
    for (const base of [extension, packed]) { mkdirSync(join(base, 'dist'), { recursive: true }); writeFileSync(join(base, 'package.json'), base === extension ? '{"name":"moderado-agent"}' : '{\n  "name": "moderado-agent"\n}'); writeFileSync(join(base, 'dist/extension.js'), 'entry'); }
    writeFileSync(join(extension, 'dist/agent-core.js'), 'fresh'); writeFileSync(join(packed, 'dist/agent-core.js'), 'stale');
    assert.throws(() => verifyAgentFreshness(join(root, 'portable'), extension), /stale/i);
    writeFileSync(join(packed, 'dist/agent-core.js'), 'fresh'); assert.doesNotThrow(() => verifyAgentFreshness(join(root, 'portable'), extension));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
