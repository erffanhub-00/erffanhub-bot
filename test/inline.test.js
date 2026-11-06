import test from "node:test";
import assert from "node:assert/strict";
import {
  handleInlineQuery,
  escapeFts,
  parseInlineQuery,
  shortId,
} from "../src/inline.js";
import { makeEnv, stubFetch, telegramCalls } from "./helpers.js";

function makeSearchDb(rows, { fail = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare() {
      return {
        bind(...args) {
          calls.push(args);
          return {
            all: async () => {
              if (fail) throw new Error("boom");
              return { results: rows };
            },
          };
        },
      };
    },
  };
}

test("parseInlineQuery splits term and type, unknown types are ignored", () => {
  assert.deepEqual(parseInlineQuery("react | pdf"), { query: "react", fileTypeFilter: "pdf" });
  assert.deepEqual(parseInlineQuery("react | exe"), { query: "react", fileTypeFilter: null });
  assert.deepEqual(parseInlineQuery("react"), { query: "react", fileTypeFilter: null });
  assert.deepEqual(parseInlineQuery("  | pdf"), { query: "", fileTypeFilter: "pdf" });
});

test("escapeFts strips FTS5 syntax and reserved words", () => {
  assert.equal(escapeFts('hello "world"'), "hello world");
  assert.equal(escapeFts("a OR b AND not c"), "a b c");
  assert.equal(escapeFts("foo-bar (baz)"), "foo bar baz");
});

test("shortId is deterministic", () => {
  assert.equal(shortId("abc"), shortId("abc"));
  assert.notEqual(shortId("abc"), shortId("abd"));
});

test("inline: a stranger's query never reaches Telegram", async () => {
  const { calls, restore } = stubFetch();
  try {
    const env = makeEnv({ DB: makeSearchDb([]) });
    await handleInlineQuery({ id: "q1", from: { id: 999 }, query: "x" }, env);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test("inline: empty query returns the hint article", async () => {
  const { calls, restore } = stubFetch();
  try {
    await handleInlineQuery({ id: "q1", from: { id: 123 }, query: "   " }, makeEnv());
    const answered = telegramCalls(calls, "answerInlineQuery");
    assert.equal(answered.length, 1);
    assert.equal(answered[0].payload.results[0].id, "hint");
    assert.equal(answered[0].payload.is_personal, true);
  } finally {
    restore();
  }
});

test("inline: matching files come back as documents with unique ids", async () => {
  const { calls, restore } = stubFetch();
  const rows = [
    { file_id: "f1", file_name: "notes.pdf", file_extension: "pdf" },
    { file_id: "f2", file_name: "notes2.pdf", file_extension: "pdf" },
  ];
  try {
    const env = makeEnv({ DB: makeSearchDb(rows) });
    await handleInlineQuery({ id: "q1", from: { id: 123 }, query: "notes" }, env);
    const answered = telegramCalls(calls, "answerInlineQuery");
    assert.equal(answered.length, 1);
    const results = answered[0].payload.results;
    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.type === "document"));
    assert.equal(new Set(results.map((r) => r.id)).size, 2);
    assert.equal(results[0].document_file_id, "f1");
  } finally {
    restore();
  }
});

test("inline: the type filter is passed to the query", async () => {
  const { calls, restore } = stubFetch();
  const db = makeSearchDb([]);
  try {
    await handleInlineQuery({ id: "q1", from: { id: 123 }, query: "notes | pdf" }, makeEnv({ DB: db }));
    assert.equal(db.calls.length, 1);
    assert.equal(db.calls[0][1], "pdf");
    const answered = telegramCalls(calls, "answerInlineQuery");
    assert.equal(answered[0].payload.results[0].id, "no_result");
  } finally {
    restore();
  }
});

test("inline: a database failure returns the error article, not a crash", async () => {
  const { calls, restore } = stubFetch();
  try {
    const env = makeEnv({ DB: makeSearchDb([], { fail: true }) });
    await handleInlineQuery({ id: "q1", from: { id: 123 }, query: "notes" }, env);
    const answered = telegramCalls(calls, "answerInlineQuery");
    assert.equal(answered[0].payload.results[0].id, "search_error");
  } finally {
    restore();
  }
});

test("inline: a query of only FTS syntax finds nothing without hitting the DB", async () => {
  const { calls, restore } = stubFetch();
  const db = makeSearchDb([]);
  try {
    await handleInlineQuery({ id: "q1", from: { id: 123 }, query: '"""' }, makeEnv({ DB: db }));
    assert.equal(db.calls.length, 0);
    const answered = telegramCalls(calls, "answerInlineQuery");
    assert.equal(answered[0].payload.results[0].id, "no_result");
  } finally {
    restore();
  }
});
