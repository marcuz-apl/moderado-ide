/**
 * Which old chats a cleanup would touch.
 *
 * Nothing here deletes anything: the list is a proposal, and the editor asks
 * the user before a single record is removed. History is the user's, so pruning
 * is never a background effect.
 */

/** The fewest chats a cleanup may keep. */
export const MIN_RETENTION_COUNT = 10;

/** The most chats a cleanup may keep. */
export const MAX_RETENTION_COUNT = 1_000;

/** The chats kept when nothing has been configured. */
export const DEFAULT_RETENTION_COUNT = 50;

export interface RetainableChat {
  id: string;
  title: string;
  updatedAt: string;
}

/**
 * The chats beyond the newest `keep`, oldest first.
 *
 * `protectedId` (the chat on screen) is never proposed, however old it is: a
 * cleanup must not remove the conversation the user is reading.
 */
export function cleanupCandidates(
  chats: readonly RetainableChat[],
  keep: number,
  protectedId?: string,
): RetainableChat[] {
  const limit = Math.max(0, Math.floor(keep));
  return [...chats]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(limit)
    .filter((chat) => chat.id !== protectedId)
    .reverse();
}
