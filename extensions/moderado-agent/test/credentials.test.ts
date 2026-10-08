import { describe, expect, it } from 'vitest';
import { credentialReference, EditorCredentialStore, MemoryCredentialStore, newCredentialReference, WindowsCredentialStore } from '../src/credentials.js';

describe('immutable credential references', () => {
  it('stages unique keys without replacing an existing canonical key', async () => {
    const canonical = credentialReference(' Test Provider ');
    const first = newCredentialReference(' Test Provider ');
    const second = newCredentialReference(' Test Provider ');
    expect(first).toMatch(/^moderado\/provider\/test-provider-[a-f0-9-]{36}$/);
    expect(second).not.toBe(first);
    const secrets = new MemoryCredentialStore();
    const editor = new EditorCredentialStore({ get: key => secrets.get(key), store: (key, value) => secrets.set(key, value), delete: key => secrets.delete(key) });
    await editor.set(canonical, 'old-key');
    await editor.set(first, 'new-key');
    expect(await editor.get(canonical)).toBe('old-key');
    expect(await editor.get(first)).toBe('new-key');
  });

  it('bounds references and rejects empty or oversized provider identifiers', () => {
    expect(newCredentialReference('x'.repeat(201))).toHaveLength(256);
    expect(() => newCredentialReference('x'.repeat(202))).toThrow();
    expect(() => newCredentialReference('  ')).toThrow();
  });
});

describe('editor secret storage', () => {
  it('persists provider keys across adapter instances and deletes them', async () => {
    const values = new Map<string, string>();
    const secrets = {
      get: async (key: string) => values.get(key),
      store: async (key: string, value: string) => { values.set(key, value); },
      delete: async (key: string) => { values.delete(key); },
    };
    const reference = 'moderado/provider/test';
    await new EditorCredentialStore(secrets).set(reference, 'private-key');
    const reopened = new EditorCredentialStore(secrets);
    expect(await reopened.get(reference)).toBe('private-key');
    await reopened.delete(reference);
    expect(await reopened.get(reference)).toBeUndefined();
  });

  it('bounds a stalled secret-storage operation', async () => {
    const store = new EditorCredentialStore({
      get: () => new Promise(() => {}), store: async () => {}, delete: async () => {},
    }, 10);
    await expect(store.get('moderado/provider/test')).rejects.toThrow('Editor secret storage operation failed.');
  });

  it('rejects malformed references and oversized keys before storing', async () => {
    let writes = 0;
    const store = new EditorCredentialStore({
      get: async () => undefined, store: async () => { writes += 1; }, delete: async () => {},
    });
    await expect(store.set('../private', 'key')).rejects.toThrow();
    await expect(store.set('moderado/provider/test', 'x'.repeat(65_537))).rejects.toThrow();
    expect(writes).toBe(0);
  });

  it('sanitizes storage failures for reads, writes and deletion', async () => {
    const fail = async () => { throw new Error('private-key'); };
    const store = new EditorCredentialStore({ get: fail, store: fail, delete: fail });
    for (const operation of [store.get('moderado/provider/test'), store.set('moderado/provider/test', 'private-key'), store.delete('moderado/provider/test')]) {
      await expect(operation).rejects.toThrow(/^Editor secret storage operation failed\.$/);
    }
  });
});

describe('Windows credential deletion outcomes', () => {
  it.each([
    ['deleted credential', { ok: true }],
    ['credential already absent', { ok: false, errorCode: 1168 }],
  ])('succeeds for %s', async (_name, outcome) => {
    const store = new WindowsCredentialStore(async (file, args, input) => {
      expect(file).toBe('powershell.exe');
      expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-EncodedCommand']);
      expect(JSON.parse(input)).toEqual({ operation: 'delete', reference: 'moderado/provider/test' });
      return { stdout: JSON.stringify(outcome), stderr: '' };
    });
    await expect(store.delete('moderado/provider/test')).resolves.toBeUndefined();
  });
  it.each([
    ['access denied', '{"ok":false,"errorCode":5}'],
    ['other native failure', '{"ok":false,"errorCode":87}'],
    ['malformed JSON', 'secret malformed response'],
    ['missing outcome', '{}'],
    ['wrong outcome type', '{"ok":"true"}'],
  ])('denies %s without leaking bridge data', async (_name, stdout) => {
    const store = new WindowsCredentialStore(async () => ({ stdout, stderr: 'secret bridge error' }));
    await expect(store.delete('moderado/provider/private')).rejects.toThrow('Windows Credential Manager operation failed.');
  });
});
