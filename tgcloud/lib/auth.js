import { OWNER_TELEGRAM_ID } from './config.js';

// True only for the configured owner. False when the owner id is not
// set yet (0) or the caller id is missing.
export function isOwner(userId) {
  if (!OWNER_TELEGRAM_ID) return false;
  if (userId === null || userId === undefined) return false;
  return String(userId) === String(OWNER_TELEGRAM_ID);
}
