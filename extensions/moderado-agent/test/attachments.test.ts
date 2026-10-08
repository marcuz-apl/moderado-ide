import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContextAttachment, createFileAttachment, preparePrompt, saveImageContext, loadImageContext, ImageAttachmentSchema } from '../src/attachments';
const dirs: string[] = [];
function fixture() { const home = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-')); dirs.push(home); const workspaceRoot = path.join(home, 'project'); fs.mkdirSync(workspaceRoot); return { home, workspaceRoot, sessionId: 'test' }; }
const png = Buffer.from('89504e470d0a1a0a0000000049454e44', 'hex');
afterEach(() => dirs.splice(0).forEach(d => fs.rmSync(d, { recursive: true, force: true })));
it('restricts context and rejects outside symlinks', () => { const s = fixture(); fs.writeFileSync(path.join(s.workspaceRoot, 'a.txt'), 'secret'); expect(preparePrompt('task', [createContextAttachment(s.workspaceRoot, 'a.txt')]).task).not.toContain('secret'); fs.writeFileSync(path.join(s.home, 'out'), 'outside'); fs.symlinkSync(path.join(s.home, 'out'), path.join(s.workspaceRoot, 'link'), 'file'); expect(() => createContextAttachment(s.workspaceRoot, 'link')).toThrow(); });
it('accepts outside selections but rejects protected and binary files', () => { const s = fixture(); const f = path.join(s.home, 'a.txt'); fs.writeFileSync(f, 'hello'); expect(createFileAttachment(f).kind).toBe('file'); fs.writeFileSync(path.join(s.home, 'a.png'), png); expect(createFileAttachment(path.join(s.home, 'a.png')).kind).toBe('image'); fs.writeFileSync(path.join(s.home, '.env'), 'secret'); expect(() => createFileAttachment(path.join(s.home, '.env'))).toThrow(); fs.writeFileSync(f, Buffer.from([0, 1, 2])); expect(() => createFileAttachment(f)).toThrow(); });
it('bounds sizes/count and validates images', () => { const s = fixture(); const f = path.join(s.home, 'a.txt'); fs.writeFileSync(f, 'a'.repeat(256 * 1024 + 1)); expect(() => createFileAttachment(f)).toThrow(); fs.writeFileSync(f, 'x'); expect(() => preparePrompt('task', Array(11).fill(createFileAttachment(f)))).toThrow(); expect(ImageAttachmentSchema.safeParse({ id: 'x', label: 'x', mimeType: 'image/png', data: 'bad' }).success).toBe(false); });
it('restores snapshots and rejects corrupt or missing own snapshots', () => { const s = fixture(); const f = path.join(s.home, 'a.png'); fs.writeFileSync(f, png); const p = preparePrompt('task', [createFileAttachment(f)]); saveImageContext(p.task, p.images, s); expect(loadImageContext([{ role: 'user', content: p.task }], s).get(p.task)).toEqual(p.images); expect(loadImageContext([{ role: 'user', content: 'other' }], s).size).toBe(0); const walk = (d: string): string[] => fs.readdirSync(d).flatMap(n => { const f = path.join(d, n); return fs.statSync(f).isDirectory() ? walk(f) : [f]; }); const file = walk(path.join(s.home, '.moderado', 'desktop', 'attachments'))[0]; fs.writeFileSync(file, '{}'); expect(() => loadImageContext([{ role: 'user', content: p.task }], s)).toThrow(/reattach/i); fs.unlinkSync(file); expect(() => loadImageContext([{ role: 'user', content: p.task }], s)).toThrow(/reattach/i); });
it('rejects symlinked state directories', () => { const s = fixture(); fs.mkdirSync(path.join(s.home, '.moderado')); fs.symlinkSync(s.workspaceRoot, path.join(s.home, '.moderado', 'desktop'), process.platform === 'win32' ? 'junction' : 'dir'); expect(() => saveImageContext('task', [], s)).toThrow(); });
it('uses a task for attachment-only sends and bounds user tasks', () => { const s = fixture(); fs.writeFileSync(path.join(s.workspaceRoot, 'a'), 'x'); expect(preparePrompt('', [createContextAttachment(s.workspaceRoot, 'a')]).task).toContain('Review the attached context.'); expect(() => preparePrompt('', [])).toThrow(); expect(() => preparePrompt('a'.repeat(65537), [])).toThrow(); });
it('rejects mismatched MIME, SVG, and oversize individual images', () => { const s = fixture(); const id = '11111111-1111-4111-8111-111111111111'; expect(ImageAttachmentSchema.safeParse({ id, label: 'x', mimeType: 'image/jpeg', data: png.toString('base64') }).success).toBe(false); fs.writeFileSync(path.join(s.home, 'a.svg'), '<svg></svg>'); expect(createFileAttachment(path.join(s.home, 'a.svg')).kind).toBe('file'); const huge = Buffer.alloc(8 * 1024 * 1024 + 1); png.copy(huge); fs.writeFileSync(path.join(s.home, 'a.png'), huge); expect(() => createFileAttachment(path.join(s.home, 'a.png'))).toThrow(); });
it('enforces aggregate limits', () => { const s = fixture(); const f = path.join(s.home, 'a'); fs.writeFileSync(f, 'x'.repeat(256 * 1024)); const a = createFileAttachment(f); expect(() => preparePrompt('task', Array(5).fill(a))).toThrow(); const image = Buffer.alloc(6 * 1024 * 1024); png.copy(image); fs.writeFileSync(f, image); const i = createFileAttachment(f); expect(() => preparePrompt('task', [i, i, i])).toThrow(); });
it('binds snapshots to workspace/session and rejects snapshot symlinks', () => { const s = fixture(); const f = path.join(s.home, 'a.png'); fs.writeFileSync(f, png); const p = preparePrompt('task', [createFileAttachment(f)]); saveImageContext(p.task, p.images, s); expect(() => loadImageContext([{ role: 'user', content: p.task }], { ...s, sessionId: 'other' })).toThrow(/reattach/i); const walk = (d: string): string[] => fs.readdirSync(d).flatMap(n => { const f = path.join(d, n); return fs.statSync(f).isDirectory() ? walk(f) : [f]; }); const snap = walk(path.join(s.home, '.moderado', 'desktop', 'attachments'))[0]; const copy = path.join(s.home, 'snapshot'); fs.copyFileSync(snap, copy); fs.unlinkSync(snap); fs.symlinkSync(copy, snap, 'file'); expect(() => loadImageContext([{ role: 'user', content: p.task }], s)).toThrow(/reattach/i); });
it('makes identical saves idempotent and rejects conflicting snapshots', () => { const s = fixture(); const f = path.join(s.home, 'a.png'); fs.writeFileSync(f, png); const p = preparePrompt('task', [createFileAttachment(f)]); saveImageContext(p.task, p.images, s); expect(() => saveImageContext(p.task, p.images, s)).not.toThrow(); expect(() => saveImageContext(p.task, [{ ...p.images[0], label: 'different.png' }], s)).toThrow(); });
it('binds the generated marker to image IDs', () => { const s = fixture(); const f = path.join(s.home, 'a.png'); fs.writeFileSync(f, png); const p = preparePrompt('task', [createFileAttachment(f)]); expect(p.task).toContain(p.images[0].id); expect(() => saveImageContext(p.task, [{ ...p.images[0], id: '22222222-2222-4222-8222-222222222222' }], s)).toThrow(); });
it('rejects unsafe attachment labels and references', () => { expect(() => preparePrompt('task', [{ id: '11111111-1111-4111-8111-111111111111', kind: 'context', label: 'bad\nlabel', path: 'a' }])).toThrow(); expect(() => preparePrompt('task', [{ id: '11111111-1111-4111-8111-111111111111', kind: 'context', label: 'a', path: 'bad\npath' }])).toThrow(); });
it('caps restored history images across messages', () => { const s = fixture(); const f = path.join(s.home, 'a.png'); const image = Buffer.alloc(6 * 1024 * 1024); png.copy(image); fs.writeFileSync(f, image); const messages = [1, 2, 3].map(n => { const p = preparePrompt(`task ${n}`, [createFileAttachment(f)]); saveImageContext(p.task, p.images, s); return { role: 'user' as const, content: p.task }; }); expect(() => loadImageContext(messages, s)).toThrow(/new session|reattach/i); });
it('validates explicit scope fields in persisted snapshots', () => {
  const s = fixture();
  const file = path.join(s.home, 'a.png');
  fs.writeFileSync(file, png);
  const prompt = preparePrompt('task', [createFileAttachment(file)]);
  saveImageContext(prompt.task, prompt.images, s);
  const walk = (dir: string): string[] => fs.readdirSync(dir).flatMap(name => {
    const candidate = path.join(dir, name);
    return fs.statSync(candidate).isDirectory() ? walk(candidate) : [candidate];
  });
  const snapshot = walk(path.join(s.home, '.moderado', 'desktop', 'attachments'))[0];
  const data = JSON.parse(fs.readFileSync(snapshot, 'utf8'));
  data.workspaceHash = '0'.repeat(64);
  fs.writeFileSync(snapshot, JSON.stringify(data));
  expect(() => loadImageContext([{ role: 'user', content: prompt.task }], s)).toThrow(/reattach/i);
});

it('rejects snapshot symlinks even when the OS ignores O_NOFOLLOW', () => {
  const scope = fixture();
  const image = path.join(scope.home, 'a.png');
  fs.writeFileSync(image, png);
  const prompt = preparePrompt('task', [createFileAttachment(image)]);
  saveImageContext(prompt.task, prompt.images, scope);
  const walk = (dir: string): string[] => fs.readdirSync(dir).flatMap(name => {
    const file = path.join(dir, name);
    return fs.statSync(file).isDirectory() ? walk(file) : [file];
  });
  const snapshot = walk(path.join(scope.home, '.moderado', 'desktop', 'attachments'))[0];
  const original = path.join(scope.home, 'original.json');
  fs.renameSync(snapshot, original);
  fs.symlinkSync(original, snapshot, 'file');
  const realOpen = fs.openSync;
  const open = vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) =>
    realOpen(file, typeof flags === 'number' ? flags & ~(fs.constants.O_NOFOLLOW ?? 0) : flags, mode));
  try {
    expect(() => loadImageContext([{ role: 'user', content: prompt.task }], scope)).toThrow(/reattach/i);
    expect(open).not.toHaveBeenCalled();
  } finally { open.mockRestore(); }
});

it('rejects a snapshot replaced between lstat and open', () => {
  const scope = fixture();
  const image = path.join(scope.home, 'a.png');
  fs.writeFileSync(image, png);
  const prompt = preparePrompt('task', [createFileAttachment(image)]);
  saveImageContext(prompt.task, prompt.images, scope);
  const realOpen = fs.openSync;
  let replaced = false;
  const open = vi.spyOn(fs, 'openSync').mockImplementation((file, flags, mode) => {
    if (!replaced) {
      replaced = true;
      const replacement = `${file}.replacement`;
      fs.copyFileSync(file, replacement);
      fs.unlinkSync(file);
      fs.renameSync(replacement, file);
    }
    return realOpen(file, flags, mode);
  });
  try {
    expect(() => loadImageContext([{ role: 'user', content: prompt.task }], scope)).toThrow(/reattach/i);
  } finally { open.mockRestore(); }
});
