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

test('Webview preserves settings drafts, browses prompt history, and exposes chat renaming', { skip: !playwrightPath }, async () => {
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
      window.savedState = undefined;
      window.acquireVsCodeApi = () => ({
        postMessage: message => window.messages.push(message),
        getState: () => window.savedState,
        setState: value => { window.savedState = value; },
      });
    });
    await page.goto('about:blank');
    const settings = { open: true, preset: 'other', providers: [
      { value: 'other', label: 'Other', custom: true, requiresApiKey: true },
      { value: 'local', label: 'Local', requiresApiKey: false },
    ], savedConnections: [], activeConnectionId: '', profilePath: '', baseUrl: 'http://localhost:4788/v1', displayName: '',
      apiKeyStored: false, models: [], defaultModel: 'auto', status: 'Loading models…', modelTab: 'free', page: 'api' };
    settings.ideVersion = 'test-version';
    const state = { transcript: [], running: false, pendingApproval: null, settings };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(chatHtml(state, () => ''), { waitUntil: 'load' });
    const update = async () => page.evaluate(snapshot => window.dispatchEvent(new MessageEvent('message', { data: { type: 'update', ...snapshot } })), viewSnapshot(state, () => ''));
    await page.locator('#settings-base-url').fill('http://localhost:5999/v1');
    await page.locator('#settings-api-key').fill('draft-browser-key');
    await page.waitForFunction(() => window.messages.some(message => message.type === 'refreshModels' && message.apiKey === 'draft-browser-key'));
    const preview = await page.evaluate(() => window.messages.at(-1));
    assert.equal(preview.baseUrl, 'http://localhost:5999/v1');
    await page.locator('#settings-base-url').focus();
    await page.locator('#settings-base-url').evaluate(field => field.setSelectionRange(8, 12));
    settings.models = [ { id: 'auto', isFree: true, accessTier: 'local' }, { id: 'local-model', isFree: true, accessTier: 'local' } ];
    settings.status = '';
    await update();
    assert.equal(await page.locator('#settings-model-select option').count(), 2, 'discovery must refresh the open pane');
    assert.equal(await page.locator('#settings-status').textContent(), '', 'successful discovery must not show a model count');
    assert.equal(await page.locator('#settings-base-url').inputValue(), 'http://localhost:5999/v1', 'discovery must retain a typed endpoint');
    assert.equal(await page.locator('#settings-api-key').inputValue(), 'draft-browser-key');
    assert.equal(await page.locator('.model-card').count(), 0);
    assert.equal(await page.locator('#settings-model-search').count(), 0);
    assert.deepEqual(await page.evaluate(() => ({ id: document.activeElement.id, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd })), { id: 'settings-base-url', start: 8, end: 12 });
    await page.locator('#settings-model-select').selectOption('local-model');
    const chosen = await page.evaluate(() => window.messages.at(-1));
    assert.equal(chosen.type, 'chooseModel');
    assert.equal(chosen.id, 'local-model');
    settings.defaultModel = chosen.id;
    await update();
    await page.locator('#settings-save').click();
    const saved = await page.evaluate(() => window.messages.at(-1));
    assert.equal(saved.modelId, 'local-model');
    assert.equal(saved.apiKey, 'draft-browser-key');
    await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', {data: {type: 'providerSaved'}})));
    assert.equal(await page.locator('#settings-api-key').inputValue(), '', 'saved key draft must be cleared');
    settings.preset = 'local'; settings.baseUrl = 'http://localhost:11434/v1'; settings.models = []; settings.status = 'Loading models…';
    await update();
    assert.equal(await page.locator('#settings-base-url').inputValue(), 'http://localhost:11434/v1');
    assert.equal(await page.locator('#settings-api-key').inputValue(), '');
    settings.page = 'about';
    await update();
    assert.equal(await page.locator('#settings-provider').count(), 0);
    assert.ok((await page.locator('.set-content').textContent()).includes('test-version'));
    settings.page = 'features';
    await update();
    await page.locator('[data-preference="allowPaidModels"]').check();
    assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {type: 'setPreference', key: 'allowPaidModels', value: true});
    await page.locator('[data-preference="preferredLanguage"]').selectOption('French');
    assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {type: 'setPreference', key: 'preferredLanguage', value: 'French'});
    assert.equal(await page.locator('[data-page="general"]').count(), 0, 'the General settings tab must be absent');
    settings.page = 'api';
    await update();
    await page.locator('#close-settings').click();
    assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'closeSettings');
    settings.open = false;
    await update();
    assert.equal(await page.locator('#settings-host').innerHTML(), '');
    assert.equal(await page.locator('#composer').isVisible(), true);
    await page.setViewportSize({ width: 320, height: 700 });
    const sessionsBox = await page.locator('#toggle-history').boundingBox();
    const settingsBox = await page.locator('#open-settings').boundingBox();
    assert.ok(sessionsBox.x < settingsBox.x && sessionsBox.y === settingsBox.y);
    assert.equal(await page.locator('#foot-history').count(), 0);
    const hintBox = await page.locator('.composer-hint').boundingBox();
    const cancelBox = await page.locator('#cancel').boundingBox();
    const sendBox = await page.locator('#send').boundingBox();
    assert.ok(hintBox.x < cancelBox.x && cancelBox.x < sendBox.x);
    assert.ok(Math.abs((hintBox.y + hintBox.height / 2) - (sendBox.y + sendBox.height / 2)) < 2);
    await page.locator('#active-ctx').click();
    assert.equal((await page.evaluate(() => window.messages.at(-1))).type, 'openApiConfig');
    const prompt = page.locator('#prompt');
    await prompt.fill('first task');
    await prompt.press('Enter');
    await prompt.fill('second task');
    await prompt.press('Enter');
    await prompt.fill('unsent draft');
    await prompt.press('ArrowUp');
    assert.equal(await prompt.inputValue(), 'second task');
    await prompt.press('ArrowUp');
    assert.equal(await prompt.inputValue(), 'first task');
    await prompt.press('ArrowDown');
    assert.equal(await prompt.inputValue(), 'second task');
    await prompt.press('ArrowDown');
    assert.equal(await prompt.inputValue(), 'unsent draft');
    await prompt.fill('line one\nline two');
    await prompt.evaluate(field => field.setSelectionRange(12, 12));
    await prompt.press('ArrowUp');
    assert.equal(await prompt.inputValue(), 'line one\nline two', 'ArrowUp inside multiline text must move the caret, not browse history');
    assert.equal(await prompt.evaluate(field => field.selectionStart), 3);
    assert.deepEqual(await page.evaluate(() => window.savedState.promptHistory), ['first task', 'second task']);
    state.historyOpen = true;
    state.recents = Array.from({length: 9}, (_, index) => ({id: 'session-'+index, title: 'Chat '+index, updatedAt: 'today'}));
    await update();
    assert.equal(await page.locator('[data-delete-session]').count(), 9);
    await page.locator('[data-delete-session="session-8"]').click();
    assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {type: 'deleteSession', id: 'session-8'});
    await page.locator('[data-rename-session="session-8"]').click();
    assert.deepEqual(await page.evaluate(() => window.messages.at(-1)), {type: 'renameSession', id: 'session-8'});
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await rm(fixture, { recursive: true, force: true });
  }
});
