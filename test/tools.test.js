import test from "node:test";
import assert from "node:assert/strict";
import { validateTools, categories, tools, getCategory, getToolsByCategory } from "../src/tools.js";

test("validateTools accepts the shipped tools.json", () => {
  assert.doesNotThrow(() => validateTools({ categories, tools }));
});

test("validateTools rejects a tool with an unknown category", () => {
  assert.throws(
    () => validateTools({ categories, tools: [{ id: "x", name: "X", category: "nope", url: "https://example.com" }] }),
    /unknown category/
  );
});

test("validateTools rejects duplicate tool ids", () => {
  const dup = [
    { id: "a", name: "A", category: "dev", url: "https://example.com/a" },
    { id: "a", name: "B", category: "dev", url: "https://example.com/b" },
  ];
  assert.throws(() => validateTools({ categories, tools: dup }), /duplicate tool id/);
});

test("validateTools rejects duplicate category ids", () => {
  const dup = [
    { id: "dev", name: "Dev" },
    { id: "dev", name: "Dev again" },
  ];
  assert.throws(() => validateTools({ categories: dup, tools: [] }), /duplicate category id/);
});

test("validateTools rejects a non-https tool url", () => {
  assert.throws(
    () => validateTools({ categories, tools: [{ id: "x", name: "X", category: "dev", url: "http://example.com" }] }),
    /must start with https/
  );
});

test("validateTools rejects a category without id or name", () => {
  assert.throws(() => validateTools({ categories: [{ id: "x" }], tools: [] }), /needs id and name/);
  assert.throws(() => validateTools({ categories: "nope", tools: [] }), /must be arrays/);
});

test("getCategory returns the category or null", () => {
  assert.equal(getCategory("dev").name, "Dev Tools");
  assert.equal(getCategory("nope"), null);
});

test("getToolsByCategory only returns tools of that category", () => {
  const dev = getToolsByCategory("dev");
  assert.ok(dev.length > 0);
  assert.ok(dev.every((t) => t.category === "dev"));
  assert.deepEqual(getToolsByCategory("text"), []);
});
