/**
 * Worker entry point: routing and the two admin endpoints.
 * Every protected route requires the webhook secret; without it, 403.
 */
import { handleUpdate } from "./bot.js";
import { proxyTelegram } from "./telegram.js";
import { COMMANDS } from "./commands.js";

function hasValidSecret(request, env) {
  if (!env.WEBHOOK_SECRET) return false;
  return request.headers.get("X-Telegram-Bot-Api-Secret-Token") === env.WEBHOOK_SECRET;
}

const ADMIN_ENDPOINTS = {
  "/setup-commands": {
    method: "setMyCommands",
    payload: { scope: { type: "default" }, commands: COMMANDS },
  },
  "/get-commands": {
    method: "getMyCommands",
    payload: { scope: { type: "default" } },
  },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Admin endpoints: register or read the Telegram command menu.
    const admin = ADMIN_ENDPOINTS[url.pathname];
    if (admin) {
      if (!hasValidSecret(request, env)) {
        return new Response("Forbidden", { status: 403 });
      }
      return proxyTelegram(admin.method, admin.payload, env);
    }

    // Telegram webhook.
    if (request.method === "POST" && url.pathname === "/webhook") {
      if (!hasValidSecret(request, env)) {
        return new Response("Forbidden", { status: 403 });
      }

      try {
        const update = await request.json();
        ctx.waitUntil(handleUpdate(update, env));
      } catch {
        // Ignore malformed updates.
      }

      // Always 200: a non-200 makes Telegram retry the update.
      return new Response("OK", { status: 200 });
    }

    return new Response("ErffanHub Toolbox", { status: 200 });
  },
};
