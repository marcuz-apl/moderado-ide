import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../../', import.meta.url));
const playwrightPath = process.env.MODERADO_PLAYWRIGHT_PATH;
const require = createRequire(join(root, 'extensions/moderado-agent/package.json'));

test('Settings refreshes models and provider controls, preserves drafts, and closes during loading', { skip: !playwrightPath }, async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'moderado-settings-renderer-'));
  let browser;
  try {
    const { build } = require('esbuild');
    const bundle = join(fixture, 'view.cjs');
    await build({ entryPoints: [join(root, 'extensions/moderado-agent/src/chat-view.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
    const { chatHtml, viewSnapshot } = require(bundle);
    const { chromium } = await import(pathToFileURL(playwrightPath).href);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.messages = [];
      window.acquireVsCodeApi = () => ({ postMessage: message => window.messages.push(message) });
    });
    await page.goto('about:blank');
    const settings = { open: true, preset: 'other', providers: [
      { value: 'other', label: 'Other', custom: true, requiresApiKey: true },
      { value: 'local', label: 'Local', requiresApiKey: false },
    ], savedConnections: [], activeConnectionId: '', profilePath: '', baseUrl: 'http://localhost:4788/v1', displayName: '',
      apiKeyStored: false, models: [], defaultModel: 'auto', status: 'Loading models…', modelTab: 'free', page: 'api' };
    const state = { transcript: [], running: false, pendingApproval: null, settings };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(chatHtml(state, () => ''), { waitUntil: 'load' });
    const update = async () => page.evaluate(snapshot => window.dispatchEvent(new MessageEvent('message', { data: { type: 'update', ...snapshot } })), viewSnapshot(state, () => ''));
    await page.locator('#settings-model-search').fill('local-model');
    await page.locator('#settings-base-url').fill('http://localhost:5999/v1');
    await page.locator('#settings-base-url').evaluate(field => field.setSelectionRange(8, 12));
    settings.models = [ { id: 'auto', isFree: true, accessTier: 'local' }, { id: 'local-model', isFree: true, accessTier: 'local' } ];
    settings.status = '2 model(s) available.';
    await update();
    assert.equal(await page.locator('#settings-model-select option').count(), 2, 'discovery must refresh the open pane');
    assert.equal(await page.locator('#settings-base-url').inputValue(), 'http://localhost:5999/v1', 'discovery must retain a typed endpoint');
    assert.equal(await page.locator('#settings-model-search').inputValue(), 'local-model');
    assert.equal(await page.locator('.model-card:not([hidden])').count(), 1);
    assert.deepEqual(await page.evaluate(() => ({ id: document.activeElement.id, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd })), { id: 'settings-base-url', start: 8, end: 12 });
    await page.locator('#settings-model-select').selectOption('local-model');
    const chosen = await page.evaluate(() => window.messages.at(-1));
    assert.equal(chosen.type, 'chooseModel');
    assert.equal(chosen.id, 'local-model');
    settings.defaultModel = chosen.id;
    await update();
    await page.locator('#settings-save').click();
    assert.equal((await page.evaluate(() => window.messages.at(-1))).modelId, 'local-model');
    settings.preset = 'local'; settings.baseUrl = 'http://localhost:11434/v1'; settings.models = []; settings.status = 'Loading models…';
    await update();
    assert.equal(await page.locator('#settings-base-url').count(), 0, 'provider change must refresh its controls');
    await page.locator('#close-settings').click();
    assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'closeSettings');
    settings.open = false;
    await update();
    assert.equal(await page.locator('#settings-host').innerHTML(), '');
    assert.equal(await page.locator('#composer').isVisible(), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await rm(fixture, { recursive: true, force: true });
  }
});
