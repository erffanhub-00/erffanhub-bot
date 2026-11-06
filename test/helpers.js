/**
 * Shared fakes for the bot tests: an in-memory D1 stand-in and a fetch stub
 * that records every Telegram API call instead of hitting the network.
 */

export function makeDb(saved = []) {
  return {
    saved,
    prepare(sql) {
      const isSelect = sql.trimStart().toUpperCase().startsWith("SELECT");
      return {
        bind(...args) {
          return {
            all: async () => ({
              results: isSelect ? saved.filter((r) => r.file_id === args[0]) : [],
            }),
            run: async () => {
              if (!isSelect) {
                saved.push({
                  file_id: args[0],
                  file_name: args[1],
                  file_extension: args[2],
                  category: args[3],
                });
              }
              return {};
            },
          };
        },
      };
    },
  };
}

export function makeEnv(overrides = {}) {
  return {
    BOT_TOKEN: "test-token",
    OWNER_TELEGRAM_ID: "123",
    STORAGE_GROUP_ID: "-100",
    WEBHOOK_SECRET: "test-secret",
    DB: makeDb(),
    ...overrides,
  };
}

/**
 * Replace global fetch with a stub. Returns the recorded calls and a
 * restore function. The stub answers like Telegram by default.
 */
export function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const payload = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, method: init?.method, payload });
    if (handler) return handler({ url, method: init?.method, payload, calls });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: true }),
      text: async () => '{"ok":true,"result":true}',
    };
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

export function telegramCalls(calls, method) {
  return calls.filter((c) => c.url.endsWith(`/${method}`));
}
