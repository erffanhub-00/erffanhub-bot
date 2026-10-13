import { handleUpdate } from "./bot.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Temporary endpoint: register the Telegram command menu.
    // Call once: https://<worker>/setup-commands
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
      const text = await res.text();
      return new Response(text, { status: 200 });
    }

    // Temporary endpoint: read the currently registered commands.
    // Call once: https://<worker>/get-commands
    if (url.pathname === "/get-commands") {
      const res = await fetch(
        `https://api.telegram.org/bot${env.BOT_TOKEN}/getMyCommands`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope: { type: "default" } }),
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