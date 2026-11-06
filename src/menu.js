/**
 * Inline keyboards and their texts. Data comes from src/tools.js, so the menu
 * always matches tools.json.
 */
import { categories, getCategory, getToolsByCategory } from "./tools.js";

const BACK_BUTTON = [{ text: "⬅️ Back", callback_data: "back:main" }];

/**
 * Build the main menu: categories + About / Help / Links.
 */
export function buildMainMenu() {
  const rows = categories.map((category) => [
    {
      text: [category.emoji, category.name].filter(Boolean).join(" "),
      callback_data: `cat:${category.id}`,
    },
  ]);

  rows.push([
    { text: "👤 About", callback_data: "about" },
    { text: "📖 Help", callback_data: "help" },
  ]);

  rows.push([{ text: "🔗 Links", callback_data: "links" }]);

  return { inline_keyboard: rows };
}

/**
 * Build the menu for a category: tool links + back button.
 */
export function buildCategoryMenu(categoryId) {
  const rows = getToolsByCategory(categoryId).map((tool) => [
    { text: `🔗 ${tool.name}`, url: tool.url },
  ]);

  rows.push(BACK_BUTTON);

  return { inline_keyboard: rows };
}

/**
 * Build the menu shown under About and Links screens.
 */
export function buildAboutMenu(links) {
  const rows = links.map((link) => [{ text: `🔗 ${link.label}`, url: link.url }]);

  rows.push(BACK_BUTTON);

  return { inline_keyboard: rows };
}

/**
 * Main menu text.
 */
export function getMainMenuText() {
  return "📦 *ErffanHub Toolbox*\n\nSelect a category:";
}

/**
 * Category menu text. Handles empty categories.
 */
export function getCategoryText(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return "❌ Category not found.";

  const categoryTools = getToolsByCategory(categoryId);
  if (categoryTools.length === 0) {
    return `📂 *${category.name}*\n\n⚠️ No tools in this category yet.`;
  }

  return `📂 *${category.name}*\n\nSelect a tool:`;
}

/**
 * Links menu text.
 */
export function getLinksText() {
  return "🔗 *Links*\n\nFind me on:";
}
