import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMainMenu, buildCategoryMenu, getCategoryText } from "../src/menu.js";

const toolsData = JSON.parse(readFileSync(new URL("../src/tools.json", import.meta.url)));

test("main menu lists every category and never shows undefined", () => {
  const menu = buildMainMenu();
  const texts = menu.inline_keyboard.flat().map((b) => b.text);
  for (const category of toolsData.categories) {
    assert.ok(texts.some((t) => t.includes(category.name)));
  }
  assert.ok(texts.every((t) => !t.includes("undefined")));
});

test("category menu lists the tools of that category", () => {
  const menu = buildCategoryMenu("dev");
  const texts = menu.inline_keyboard.flat().map((b) => b.text);
  assert.ok(texts.some((t) => t.includes("Website Erffan")));
});

test("empty category says so instead of showing a broken menu", () => {
  assert.match(getCategoryText("text"), /No tools in this category yet/);
});

test("unknown category is reported, not crashed on", () => {
  assert.equal(getCategoryText("nope"), "❌ Category not found.");
});

test("tools.json is consistent: known categories, unique ids, https urls", () => {
  const categoryIds = new Set(toolsData.categories.map((c) => c.id));
  const toolIds = new Set();
  for (const tool of toolsData.tools) {
    assert.ok(categoryIds.has(tool.category), `unknown category ${tool.category}`);
    assert.ok(!toolIds.has(tool.id), `duplicate id ${tool.id}`);
    toolIds.add(tool.id);
    assert.ok(tool.url.startsWith("https://"), `not https: ${tool.id}`);
  }
});
