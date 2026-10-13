import { handleUpdate } from "./bot.js";

export default {
  /**
   * Cloudflare Workers fetch handler.
   * @param {Request} request
   * @param {object} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      // Verify the secret token that Telegram sends with each update.
      // If WEBHOOK_SECRET is not configured, the check is skipped.
      if (env.WEBHOOK_SECRET) {
        const incomingSecret = request.headers.get(
          "X-Telegram-Bot-Api-Secret-Token"
        );
        if (incomingSecret !== env.WEBHOOK_SECRET) {
          return new Response("Forbidden", { status: 403 });
        }
      }

      try {
        const update = await request.json();
        ctx.waitUntil(handleUpdate(update, env));
      } catch {
        // Silently ignore malformed updates; always return 200 to Telegram.
      }

      return new Response("OK", { status: 200 });
    }

    return new Response("ErffanHub Toolbox", { status: 200 });
  },
};