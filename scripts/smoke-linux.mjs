// Offline activation check against the packaged Linux editor, with isolated state.
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const portable = join(root, '.cache/vscodium/VSCode-linux-x64');
const fixture = mkdtempSync(join(root, '.cache/linux-hostcheck-'));
for (const folder of ['profile', 'workspace', 'extensions', 'user-data']) mkdirSync(join(fixture, folder));
mkdirSync(join(fixture, 'profile/.moderado'));
writeFileSync(join(fixture, 'profile/.moderado/config.json'), '{}');
const resultFile = join(fixture, 'result.json');
writeFileSync(join(fixture, 'test.cjs'), `
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vscode = require('vscode');
exports.run = async () => {
  const extension = vscode.extensions.getExtension('moderado.moderado-agent');
  assert.ok(extension, 'Packaged agent missing');
  const api = await extension.activate();
  assert.equal(extension.isActive, true);
  for (const method of ['startRun', 'listSessions', 'cancel']) assert.equal(typeof api[method], 'function');
  const expected = ['moderado.openChat', 'moderado.openSettings', 'moderado.selectModel', 'moderado.configureProvider', 'moderado.cancelRun', 'moderado.showSessions', 'moderado.togglePlanMode'];
  const commands = await vscode.commands.getCommands(true);
  for (const command of expected) assert.ok(commands.includes(command), command);
  const { sessions, invalid } = api.listSessions();
  assert.deepEqual(sessions, []);
  assert.deepEqual(invalid, []);
  const turn = await api.startRun('Say hello.', { planMode: true });
  assert.equal(turn.status, 'completed');
  assert.equal(turn.model, 'mock/free-tool-model');
  assert.equal(turn.finalMessage, 'Mock assistant response.');
  assert.equal(api.listSessions().sessions.length, 1);
  fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify({ ok: true, active: extension.isActive, extensionPath: extension.extensionPath, commands: expected, sessions: 1, fakeTurn: { status: turn.status, model: turn.model, steps: turn.totalSteps } }, null, 2));
};
`);
const env = { ...process.env, HOME: join(fixture, 'profile'), XDG_CONFIG_HOME: join(fixture, 'profile/.config'), XDG_CACHE_HOME: join(fixture, 'profile/.cache') };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn('xvfb-run', ['-a', join(portable, 'moderado-ide'), '--no-sandbox', '--disable-gpu', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes', '--user-data-dir', join(fixture, 'user-data'), '--extensions-dir', join(fixture, 'extensions'), '--extensionDevelopmentPath', join(portable, 'resources/app/extensions/moderado-agent'), '--extensionTestsPath', join(fixture, 'test.cjs'), join(fixture, 'workspace')], { env, stdio: 'inherit', detached: true });
let expired = false;
let forced;
const timeout = setTimeout(() => {
  expired = true;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  forced = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 5000);
}, 90000);
try {
  const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept); });
  assert.equal(expired, false, 'Editor-host check timed out');
  assert.equal(code, 0, 'Editor-host process failed');
  const result = JSON.parse(readFileSync(resultFile, 'utf8'));
  assert.equal(result.ok, true);
  assert.equal(resolve(result.extensionPath), join(portable, 'resources/app/extensions/moderado-agent'));
  console.log(`Packaged Linux agent activated: ${resultFile}`);
} finally {
  // The wrapper can exit before Electron; terminate any remaining test descendants.
  if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  clearTimeout(timeout);
  clearTimeout(forced);
}
