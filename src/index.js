import { handleUpdate } from "./bot.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Register the Telegram command menu.
    if (url.pathname === "/setup-commands") {
      const res = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/setMyCommands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: { type: "default" },
            commands: [
              { command: "start", description: "Open the main menu" },
              { command: "help", description: "Show help" },
              { command: "about", description: "About the owner" },
              { command: "links", description: "Social links" },
            ],
          }),
        }
      );
      return new Response(await res.text(), { status: 200 });
    }

    // Read the currently registered commands.
    if (url.pathname === "/get-commands") {
      const res = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/getMyCommands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: { type: "default" } }),
        }
      );
      return new Response(await res.text(), { status: 200 });
    }

    // Telegram webhook.
    if (request.method === "POST" && url.pathname === "/webhook") {
      if (env.WEBHOOK_SECRET) {
        const incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (incoming !== env.WEBHOOK_SECRET) {
          return new Response("Forbidden", { status: 403 });
        }
      }

      try {
        const update = await request.json();
        ctx.waitUntil(handleUpdate(update, env));
      } catch {
        // Ignore malformed updates.
      }

      return new Response("OK", { status: 200 });
    }

    return new Response("ErffanHub Toolbox", { status: 200 });
  },
};