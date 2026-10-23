import { describe, expect, it, vi } from 'vitest';
import { ApprovalRequest } from '@moderado/contracts';
import { ApprovalCoordinator, buildApprovalRequest, hasCompletePreview } from '../src/approval.js';

function request(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    requestId: 'req-1',
    toolName: 'write_file',
    actionSummary: 'Create notes.md',
    exactPayload: { targetFile: 'notes.md', contentPreview: 'hello' },
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('hasCompletePreview', () => {
  it('requires a target file and content for a write', () => {
    expect(hasCompletePreview(request())).toBe(true);
    expect(hasCompletePreview(request({ exactPayload: { contentPreview: 'x' } }))).toBe(false);
    expect(hasCompletePreview(request({ exactPayload: { targetFile: 'a.md' } }))).toBe(false);
  });

  it('accepts a generated multi-file patch diff without a single target file', () => {
    const diff = [
      '--- a/first.txt',
      '+++ b/first.txt',
      '@@ -1,1 +1,1 @@',
      '-first old',
      '+first new',
      '--- a/second.txt',
      '+++ b/second.txt',
      '@@ -1,1 +1,1 @@',
      '-second old',
      '+second new',
    ].join('\n');
    expect(hasCompletePreview(request({ toolName: 'apply_patch', exactPayload: { diffPreview: diff } }))).toBe(true);
  });

  it('still refuses an apply_patch summary that is not a generated diff', () => {
    expect(hasCompletePreview(request({ toolName: 'apply_patch', exactPayload: { diffPreview: 'Patch 2 files' } }))).toBe(false);
    expect(hasCompletePreview(request({ toolName: 'apply_patch', exactPayload: { targetFile: 'a.txt', contentPreview: 'x' } }))).toBe(false);
    expect(hasCompletePreview(request({ toolName: 'apply_patch', exactPayload: {} }))).toBe(false);
  });

  it('requires a command array and cwd to run a command', () => {
    expect(
      hasCompletePreview(
        request({ toolName: 'run_command', exactPayload: { command: ['npm', 'test'], cwd: 'C:\\ws' } }),
      ),
    ).toBe(true);
    expect(hasCompletePreview(request({ toolName: 'run_command', exactPayload: { command: ['npm', 'test'] } }))).toBe(false);
    expect(hasCompletePreview(request({ toolName: 'run_command', exactPayload: { cwd: 'C:\\ws' } }))).toBe(false);
  });

  it('rejects truncated write and edit previews but accepts an untruncated boundary value', () => {
    const boundary = 'x'.repeat(200_000);
    expect(hasCompletePreview(buildApprovalRequest({
      toolName: 'write_file', actionSummary: 'Write file', payload: { targetFile: 'a.txt', contentPreview: boundary },
    }))).toBe(true);

    const oversized = 'x'.repeat(200_001);
    for (const toolName of ['write_file', 'edit_file']) {
      const request = buildApprovalRequest({
        toolName, actionSummary: 'Change file', payload: { targetFile: 'a.txt', contentPreview: oversized },
      });
      expect(hasCompletePreview(request), `${toolName} must reject a capped content preview`).toBe(false);
    }
  });

  it('rejects a multi-file patch truncated after a valid first diff header', () => {
    const diff = [
      '--- a/first.txt',
      '+++ b/first.txt',
      '@@ -1 +1 @@',
      `-${'x'.repeat(199_950)}`,
      '+replacement',
      '--- a/second.txt',
      '+++ b/second.txt',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');
    const request = buildApprovalRequest({
      toolName: 'apply_patch', actionSummary: 'Patch two files', payload: { diffPreview: diff },
    });

    expect(request.exactPayload.diffPreview).toMatch(/\[truncated at 200000 characters\]$/);
    expect(hasCompletePreview(request)).toBe(false);
  });
});

describe('ApprovalCoordinator', () => {
  it('approves when a human approves the exact request', async () => {
    const coordinator = new ApprovalCoordinator({
      prompt: async (req) => ({ requestId: req.requestId, status: 'approved' }),
    });
    const decision = await coordinator.requestApproval(request());
    expect(decision.status).toBe('approved');
    expect(decision.requestId).toBe('req-1');
  });

  it('denies when the decision id does not match the request', async () => {
    const coordinator = new ApprovalCoordinator({
      prompt: async () => ({ requestId: 'some-other-request', status: 'approved' }),
    });
    const decision = await coordinator.requestApproval(request());
    expect(decision.status).toBe('denied');
    expect(decision.reason).toMatch(/did not match/i);
  });

  it('denies a malformed decision', async () => {
    const coordinator = new ApprovalCoordinator({
      prompt: async () => ({ requestId: 'req-1', status: 'maybe' }),
    });
    const decision = await coordinator.requestApproval(request());
    expect(decision.status).toBe('denied');
  });

  it('denies when the UI closes without a decision', async () => {
    const coordinator = new ApprovalCoordinator({ prompt: async () => undefined });
    const decision = await coordinator.requestApproval(request());
    expect(decision.status).toBe('denied');
    expect(decision.reason).toMatch(/closed/i);
  });

  it('denies on the host deadline', async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new ApprovalCoordinator({
        prompt: () => new Promise(() => {}),
        timeoutMs: 1_000,
      });
      const pending = coordinator.requestApproval(request());
      await vi.advanceTimersByTimeAsync(1_100);
      const decision = await pending;
      expect(decision.status).toBe('denied');
      expect(decision.reason).toMatch(/deadline/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('denies on cancellation', async () => {
    const controller = new AbortController();
    const coordinator = new ApprovalCoordinator({ prompt: () => new Promise(() => {}) });
    const pending = coordinator.requestApproval(request(), controller.signal);
    controller.abort();
    expect((await pending).status).toBe('denied');
  });

  it('denies everything in a non-interactive context', async () => {
    const prompt = vi.fn();
    const coordinator = new ApprovalCoordinator({ prompt, nonInteractive: true });
    const decision = await coordinator.requestApproval(request());
    expect(decision.status).toBe('denied');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('denies a write that carries no complete preview', async () => {
    const coordinator = new ApprovalCoordinator({
      prompt: async (req) => ({ requestId: req.requestId, status: 'approved' }),
    });
    const decision = await coordinator.requestApproval(request({ exactPayload: { targetFile: 'a.md' } }));
    expect(decision.status).toBe('denied');
    expect(decision.reason).toMatch(/complete preview/i);
  });

  it('denies in-flight requests when the view is disposed', async () => {
    const coordinator = new ApprovalCoordinator({ prompt: () => new Promise(() => {}) });
    const pending = coordinator.requestApproval(request());
    expect(coordinator.pendingCount).toBe(1);
    coordinator.denyAll('ui_closed');
    expect((await pending).status).toBe('denied');
    expect(coordinator.pendingCount).toBe(0);
  });

  it('rejects a malformed approval request outright', async () => {
    const coordinator = new ApprovalCoordinator({ prompt: async () => ({ requestId: 'req-1', status: 'approved' }) });
    const decision = await coordinator.requestApproval({ requestId: '' } as ApprovalRequest);
    expect(decision.status).toBe('denied');
  });
});
