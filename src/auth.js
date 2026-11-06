/**
 * Owner check. The bot is private: only the owner can use it.
 */
export function isOwner(userId, env) {
  return Boolean(env.OWNER_TELEGRAM_ID) && String(userId) === String(env.OWNER_TELEGRAM_ID);
}
