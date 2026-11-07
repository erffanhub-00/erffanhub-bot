import { EndpointError } from 'sdk';
import { isOwner } from '../lib/auth.js';
import { runCleanup } from '../lib/library.js';

// Sweep self-deleting messages (delivered files after 60s, one-off
// notices after 20s). Called once a minute by the Cloudflare Worker
// cron in cleanup-worker/ — the Worker sends the owner's signed
// Telegram init data, exactly the way the Mini App SDK does
// (Authorization: TMA <base64(initData)>). The platform verifies the
// init data before this code runs; the owner check below is a second
// layer. Also callable from the Mini App dashboard while it is open.
// Owner-only. Returns how many messages were swept.
export default async function (input, ctx) {
  if (!isOwner(ctx?.initData?.user?.id)) throw new EndpointError('forbidden');
  const deleted = await runCleanup();
  return { deleted, at: Date.now() };
}
