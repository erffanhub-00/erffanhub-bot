// Cloudflare Worker cron: once a minute, call the bot's cleanup
// endpoint with the owner's signed Telegram init data, so
// self-deleting messages are swept on a real timer instead of only
// on the next user interaction.
//
// How it works: Telegram's own Mini App SDK calls endpoints with
// `Authorization: TMA <base64(initData)>`, where initData is the
// Telegram WebApp init data (user + auth_date + HMAC-SHA256 hash,
// signed with the bot token). This Worker builds exactly that — it
// is the owner's own bot token, used to call the owner's own
// endpoint. The platform verifies the signature before the endpoint
// runs; if it ever rejects the call (401), the lazy sweep inside the
// bot (on every incoming update) still cleans up — nothing breaks.
//
// Deploy:
//   cd cleanup-worker
//   npx wrangler login
//   npx wrangler secret put BOT_TOKEN   # the bot API token from BotFather (NOT the tgcloud CLI token)
//   # set OWNER_ID in wrangler.toml to your Telegram user id (same as
//   # OWNER_TELEGRAM_ID in tgcloud/lib/config.js), then:
//   npx wrangler deploy
//
// Verify: open the Worker URL (wrangler prints it) — it runs one
// sweep immediately and returns the result as JSON. Or watch the
// live logs: npx wrangler tail. A 401 means the platform refused the
// signed call; the bot's lazy cleanup still applies.

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCleanup(env));
  },
  // Manual test: GET the Worker URL to run one sweep right now.
  async fetch(request, env) {
    const res = await runCleanup(env);
    return new Response(JSON.stringify(res), {
      headers: { 'content-type': 'application/json' },
    });
  },
};

async function runCleanup(env) {
  try {
    const initData = await buildInitData(env);
    const res = await fetch(`${env.APP_URL}/api/cleanup`, {
      method: 'POST',
      headers: {
        Authorization: 'TMA ' + btoa(initData),
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    const body = await res.json().catch(() => ({}));
    console.log('cleanup', res.status, JSON.stringify(body));
    return { status: res.status, body };
  } catch (err) {
    console.log('cleanup failed', err?.message || err);
    return { status: 0, error: String(err?.message || err) };
  }
}

// Build Telegram WebApp init data for the owner and sign it the way
// Telegram does: HMAC-SHA256 over the data-check-string (fields
// sorted alphabetically, `key=value` joined with `\n`) with the key
// SHA256(bot_token). auth_date is fresh every call.
async function buildInitData(env) {
  const user = JSON.stringify({
    id: Number(env.OWNER_ID),
    first_name: 'Erfan',
    username: 'erffan_hub',
    language_code: 'fa',
  });
  const authDate = Math.floor(Date.now() / 1000);
  const pairs = [
    ['auth_date', String(authDate)],
    ['user', user],
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const checkString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const tokenHash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(env.BOT_TOKEN),
  );
  const key = await crypto.subtle.importKey(
    'raw',
    tokenHash,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(checkString),
  );
  const hash = [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return new URLSearchParams({ user, auth_date: String(authDate), hash }).toString();
}
