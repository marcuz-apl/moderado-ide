import type { ApprovalRequest } from '@moderado/contracts';

export const DEFAULT_AUTO_APPROVE = {
  readFiles: true,
  editFiles: true,
  executeCommands: false,
  fetchWeb: true,
  useMcp: true,
} as const;

export type AutoApproveCategory = keyof typeof DEFAULT_AUTO_APPROVE;
export type AutoApprovePreferences = Record<AutoApproveCategory, boolean>;

const READ_TOOLS = new Set(['read_file', 'list_files', 'search_files', 'git_diff', 'get_definition', 'get_references']);
const EDIT_TOOLS = new Set(['edit_file', 'write_file', 'apply_patch']);
const COMMAND_TOOLS = new Set(['run_command', 'run_diagnostics']);
const WEB_TOOLS = new Set(['web_search', 'web_fetch']);

export function autoApproveCategoryForTool(toolName: string): AutoApproveCategory | undefined {
  if (READ_TOOLS.has(toolName)) return 'readFiles';
  if (EDIT_TOOLS.has(toolName)) return 'editFiles';
  if (COMMAND_TOOLS.has(toolName)) return 'executeCommands';
  if (WEB_TOOLS.has(toolName)) return 'fetchWeb';
  if (toolName.startsWith('mcp.')) return 'useMcp';
  return undefined;
}

export function autoApproveDecision(
  request: Pick<ApprovalRequest, 'requestId' | 'toolName'>,
  preferences: AutoApprovePreferences,
): { requestId: string; status: 'approved' } | undefined {
  const category = autoApproveCategoryForTool(request.toolName);
  if (!category || !preferences[category]) return undefined;
  return { requestId: request.requestId, status: 'approved' };
}
