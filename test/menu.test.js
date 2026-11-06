import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildMainMenu, buildCategoryMenu, buildAboutMenu, getCategoryText, getLinksText } from "../src/menu.js";

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

test("unknown category menu has only the back button", () => {
  const menu = buildCategoryMenu("nope");
  assert.equal(menu.inline_keyboard.length, 1);
  assert.equal(menu.inline_keyboard[0][0].callback_data, "back:main");
});

test("about menu lists every link plus back, links text is stable", () => {
  const links = [
    { label: "A", url: "https://example.com/a" },
    { label: "B", url: "https://example.com/b" },
  ];
  const menu = buildAboutMenu(links);
  const buttons = menu.inline_keyboard.flat();
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].url, "https://example.com/a");
  assert.equal(buttons[2].callback_data, "back:main");
  assert.match(getLinksText(), /Links/);
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
