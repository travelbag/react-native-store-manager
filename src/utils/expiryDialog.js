/**
 * Expiry confirmation dialogs are disabled — picking must never be blocked.
 * Kept as a no-op so any leftover callers resolve immediately.
 */
export const confirmExpiringSoonPick = async () => true;
