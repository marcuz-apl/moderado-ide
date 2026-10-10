import fs from 'node:fs';
import path from 'node:path';

/**
 * Windows file symlinks require elevated or Developer Mode privileges. Use a
 * junction instead so tests still exercise reparse-point rejection without
 * requiring a privileged test environment.
 */
export function createUnsafeSymlink(target: string, linkPath: string): void {
  if (process.platform !== 'win32') {
    fs.symlinkSync(target, linkPath, fs.statSync(target).isDirectory() ? 'dir' : 'file');
    return;
  }

  const targetDirectory = fs.statSync(target).isDirectory() ? target : path.dirname(target);
  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.symlinkSync(targetDirectory, linkPath, 'junction');
}
