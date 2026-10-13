import { handleUpdate } from "./bot.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Temporary endpoint to register the webhook.
    // Remove this block after the webhook is set.
    if (url.pathname === "/setup-webhook") {
      const res = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: "https://erffanhub-bot.erffanhub.workers.dev/webhook",
            secret_token: env.WEBHOOK_SECRET,
          }),
        }
      );
      const text = await res.text();
      return new Response(text, { status: 200 });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
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
        // Silently ignore malformed updates.
      }

      return new Response("OK", { status: 200 });
    }

    return new Response("ErffanHub Toolbox", { status: 200 });
  },
};