import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type ConfigConflict = {
  kind: 'conflict';
  reason: string;
  conflictingKeys: string[];
};

export interface ConfigUpdateResult {
  written: boolean;
  conflict?: ConfigConflict;
  reason?: string;
  attempts: number;
}

function readRaw(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseConfig(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined) return {};
  const parsed = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('config.json is not a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Merges `patch` under the IDE writer lock. Other writers must use this same
 * protocol for concurrent writes to be coordinated. `expected` limits conflict
 * detection to fields the caller owns.
 */
export function updateConfigCoordinated(
  configFile: string,
  patch: Record<string, unknown>,
  options: { timeoutMs?: number; expected?: Record<string, unknown>; now?: () => number } = {},
): ConfigUpdateResult {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const now = options.now ?? Date.now;
  const lockFile = `${configFile}.moderado-lock`;
  const started = now();
  const deadline = started + timeoutMs;

  fs.mkdirSync(path.dirname(configFile), { recursive: true, mode: 0o700 });

  let lockHandle: number | undefined;
  const ownerToken = crypto.randomUUID();
  for (;;) {
    try {
      // `wx` fails if the lock already exists, so two writers cannot share one.
      lockHandle = fs.openSync(lockFile, 'wx', 0o600);
      try {
        fs.writeFileSync(lockHandle, JSON.stringify({ pid: process.pid, token: ownerToken }));
      } catch (writeError) {
        fs.closeSync(lockHandle);
        lockHandle = undefined;
        return { written: false, reason: `Could not record config lock ownership. Inspect ${lockFile} and remove it only after confirming no IDE writer is active.`, attempts: 1 };
      }
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        return { written: false, reason: `Could not lock config.json: ${(error as Error).message}`, attempts: 1 };
      }
      if (now() >= deadline) {
        return {
          written: false,
          attempts: 1,
          conflict: {
            kind: 'conflict',
            reason:
              'The config lock or its recovery marker remained busy. No config was written; manual recovery: inspect both lock files and remove them only after confirming no IDE writer is active.',
            conflictingKeys: Object.keys(patch),
          },
        };
      }
      // Age alone is not proof that an owner is dead. Reap only a lock whose
      // recorded process is gone, while holding a separate exclusive claim.
      try {
        const stat = fs.statSync(lockFile);
        if (now() - stat.mtimeMs > timeoutMs && reapDeadLock(lockFile)) continue;
      } catch {
        continue;
      }
      sleepBriefly();
    }
  }

  try {
    let base: Record<string, unknown>;
    try {
      base = parseConfig(readRaw(configFile));
    } catch (error) {
      return {
        written: false,
        reason: `Refusing to write: ${(error as Error).message}`,
        attempts: 1,
      };
    }

    const conflicting = detectConflicts(base, patch, options.expected);
    if (conflicting.length > 0) {
      return {
        written: false,
        attempts: 1,
        conflict: {
          kind: 'conflict',
          reason:
            'The shared config changed while this IDE was editing it. The file was left untouched so the newer value survives.',
          conflictingKeys: conflicting,
        },
      };
    }

    const temp = `${configFile}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(deepMerge(base, patch), null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, configFile);
    return { written: true, attempts: 1 };
  } finally {
    if (lockHandle !== undefined) {
      try {
        fs.closeSync(lockHandle);
      } catch {
        /* already closed */
      }
    }
    removeOwnedLock(lockFile, ownerToken);
  }
}

/** Keys Desktop would change whose current value is not what it expected. */
export function detectConflicts(
  current: Record<string, unknown>,
  desired: Record<string, unknown>,
  expected?: Record<string, unknown>,
): string[] {
  if (!expected) return [];
  const conflicts: string[] = [];
  for (const [key, want] of Object.entries(expected)) {
    if (!(key in desired)) continue;
    collectConflicts(current[key], want, desired[key], key, conflicts);
  }
  return conflicts;
}

function collectConflicts(
  current: unknown,
  expected: unknown,
  desired: unknown,
  key: string,
  conflicts: string[],
): void {
  if (isPlainObject(expected) && isPlainObject(desired)) {
    for (const [child, expectedValue] of Object.entries(expected)) {
      if (child in desired) collectConflicts(isPlainObject(current) ? current[child] : undefined,
        expectedValue, desired[child], `${key}.${child}`, conflicts);
    }
    return;
  }
  if (JSON.stringify(current) !== JSON.stringify(expected)) conflicts.push(key);
}

interface LockRecord { pid: number; token: string }

function readLock(lockFile: string): LockRecord | undefined {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    if (typeof value !== 'object' || value === null) return undefined;
    const record = value as Partial<LockRecord>;
    return Number.isInteger(record.pid) && typeof record.token === 'string'
      ? { pid: record.pid!, token: record.token } : undefined;
  } catch { return undefined; }
}

function processIsAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

function reapDeadLock(lockFile: string): boolean {
  const claim = `${lockFile}.reap`;
  let claimHandle: number;
  try { claimHandle = fs.openSync(claim, 'wx', 0o600); }
  catch { return false; }
  try {
    const observed = readLock(lockFile);
    if (!observed || processIsAlive(observed.pid)) return false;
    const current = readLock(lockFile);
    if (!current || current.token !== observed.token || current.pid !== observed.pid) return false;
    fs.rmSync(lockFile, { force: true });
    return true;
  } finally {
    fs.closeSync(claimHandle);
    fs.rmSync(claim, { force: true });
  }
}

function removeOwnedLock(lockFile: string, token: string): void {
  const current = readLock(lockFile);
  if (current?.pid === process.pid && current.token === token) fs.rmSync(lockFile, { force: true });
}

/** One-level-deep merge so a sibling's added keys survive; arrays are replaced. */
export function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      out[key] = { ...existing, ...value };
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Short blocking sleep used only while polling for the lock. */
function sleepBriefly(): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
}