import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { canonicalizeRoot } from '@moderado/tools';
import { describe, expect, it } from 'vitest';
import { createSession, SessionStore } from '../src/sessions.js';
import { createFileAttachment, imageContextDirectory, preparePrompt, saveImageContext } from '../src/attachments.js';

function fixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'moderado-delete-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'moderado-delete-workspace-'));
  const store = new SessionStore(home);
  const session = store.save(createSession(workspace));
  return { home, workspace, store, session, target: store.getSessionPath(session) };
}

describe('single session deletion', () => {
  it('removes only the requested session and treats missing as idempotent', () => {
    const { store, workspace, session, target } = fixture();
    const other = store.save(createSession(workspace));
    expect(store.deleteSession(workspace, session.id)).toBe(true);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(store.getSessionPath(other))).toBe(true);
    expect(store.deleteSession(workspace, session.id)).toBe(false);
  });

  it('rejects invalid ids and mismatched or corrupt records without deleting', () => {
    const { store, workspace, session, target } = fixture();
    for (const id of ['../config', '', '/tmp/session', 'not-a-uuid'])
      expect(() => store.deleteSession(workspace, id)).toThrow();
    for (const record of [{ ...session, id: crypto.randomUUID() }, { ...session, workspaceRoot: os.tmpdir() }, '{corrupt']) {
      fs.writeFileSync(target, typeof record === 'string' ? record : JSON.stringify(record));
      expect(() => store.deleteSession(workspace, session.id)).toThrow();
      expect(fs.existsSync(target)).toBe(true);
    }
  });

  it('rejects symlinked session files and each profile directory', () => {
    for (const level of ['file', 'workspace', 'sessions', 'profile', 'home']) {
      const { store, workspace, session, target, home } = fixture();
      const dir = store.getDirectory(workspace);
      const unsafe = level === 'file' ? target : level === 'workspace' ? dir : level === 'sessions' ? path.dirname(dir) : level === 'profile' ? path.dirname(path.dirname(dir)) : home;
      const moved = `${unsafe}-original`;
      fs.renameSync(unsafe, moved);
      fs.symlinkSync(moved, unsafe, level === 'file' ? 'file' : process.platform === 'win32' ? 'junction' : 'dir');
      expect(() => store.deleteSession(workspace, session.id)).toThrow(/unsafe/i);
      expect(fs.existsSync(target)).toBe(true);
    }
  });

  it('removes the session image sidecar without touching other sessions', () => {
    const { store, workspace, session, home } = fixture();
    const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
    const leaf = path.join(home, '.moderado', 'desktop', 'attachments', hash(canonicalizeRoot(workspace)), hash(session.id));
    fs.mkdirSync(leaf, { recursive: true });
    fs.writeFileSync(path.join(leaf, `${hash('task')}.json`), '{}');
    expect(store.deleteSession(workspace, session.id)).toBe(true);
    expect(fs.existsSync(leaf)).toBe(false);
  });

  it('deletes real image snapshots using the exact attachment writer scope', () => {
    const { store, workspace, session, home } = fixture();
    const image = path.join(home, 'image.png');
    fs.writeFileSync(image, Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex'));
    const prompt = preparePrompt('task', [createFileAttachment(image)]);
    const scope = { workspaceRoot: workspace, home, sessionId: session.id };
    saveImageContext(prompt.task, prompt.images, scope);
    const directory = imageContextDirectory(scope);
    expect(fs.readdirSync(directory)).toHaveLength(1);
    expect(store.deleteSession(workspace, session.id)).toBe(true);
    expect(fs.existsSync(directory)).toBe(false);
  });

  it('refuses symlinked image snapshot files or sidecar parents before deleting the chat', () => {
    for (const level of ['snapshot', 'leaf', 'attachments', 'desktop']) {
      const { store, workspace, session, home, target } = fixture();
      const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
      const attachments = path.join(home, '.moderado', 'desktop', 'attachments');
      const leaf = path.join(attachments, hash(canonicalizeRoot(workspace)), hash(session.id));
      fs.mkdirSync(leaf, { recursive: true });
      const snapshot = path.join(leaf, `${hash('task')}.json`);
      fs.writeFileSync(snapshot, '{}');
      const unsafe = level === 'snapshot' ? snapshot : level === 'leaf' ? leaf : level === 'attachments' ? attachments : path.dirname(attachments);
      fs.renameSync(unsafe, `${unsafe}-original`);
      fs.symlinkSync(`${unsafe}-original`, unsafe, level === 'snapshot' ? 'file' : process.platform === 'win32' ? 'junction' : 'dir');
      expect(() => store.deleteSession(workspace, session.id)).toThrow(/unsafe/i);
      expect(fs.existsSync(target)).toBe(true);
      expect(fs.readFileSync(snapshot, 'utf8')).toBe('{}');
    }
  });
});
