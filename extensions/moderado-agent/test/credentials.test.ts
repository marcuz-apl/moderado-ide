import { describe, expect, it } from 'vitest';
import { WindowsCredentialStore } from '../src/credentials.js';

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
