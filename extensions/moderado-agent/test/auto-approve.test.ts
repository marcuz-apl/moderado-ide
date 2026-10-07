import { describe, expect, it } from 'vitest';
import {
  autoApproveCategoryForTool,
  autoApproveDecision,
  DEFAULT_AUTO_APPROVE,
} from '../src/auto-approve.js';

describe('auto-approve defaults', () => {
  it('enables the requested categories but keeps commands disabled', () => {
    expect(DEFAULT_AUTO_APPROVE).toEqual({
      readFiles: true,
      editFiles: true,
      executeCommands: false,
      fetchWeb: true,
      useMcp: true,
    });
  });

  it.each([
    ['read_file', 'readFiles'],
    ['edit_file', 'editFiles'],
    ['apply_patch', 'editFiles'],
    ['write_file', 'editFiles'],
    ['run_command', 'executeCommands'],
    ['run_diagnostics', 'executeCommands'],
    ['web_search', 'fetchWeb'],
    ['mcp.server.tool', 'useMcp'],
  ] as const)('classifies %s as %s', (toolName, category) => {
    expect(autoApproveCategoryForTool(toolName)).toBe(category);
  });

  it('does not auto-approve an unknown tool or a disabled category', () => {
    const request = { requestId: 'request-1', toolName: 'run_command' };
    expect(autoApproveCategoryForTool('unknown_tool')).toBeUndefined();
    expect(autoApproveDecision(request, DEFAULT_AUTO_APPROVE)).toBeUndefined();
    expect(autoApproveDecision(
      { requestId: 'request-2', toolName: 'edit_file' },
      { ...DEFAULT_AUTO_APPROVE, editFiles: false },
    )).toBeUndefined();
  });

  it('returns an approval only for an enabled, recognized category', () => {
    expect(autoApproveDecision(
      { requestId: 'request-3', toolName: 'mcp.server.tool' },
      DEFAULT_AUTO_APPROVE,
    )).toEqual({ requestId: 'request-3', status: 'approved' });
  });
});
