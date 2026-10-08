import { describe, expect, it } from 'vitest';
import { EditorCredentialStore, WindowsCredentialStore } from '../src/credentials.js';

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
