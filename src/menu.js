import toolsData from "./tools.json";

const { categories, tools } = toolsData;

/**
 * Build the main menu: categories + About / Help / Links.
 */
export function buildMainMenu() {
  const rows = categories.map((category) => [
    {
      text: `${category.emoji} ${category.name}`.trim(),
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
  const categoryTools = tools.filter((tool) => tool.category === categoryId);

  const rows = categoryTools.map((tool) => [
    { text: `🔗 ${tool.name}`, url: tool.url },
  ]);

  rows.push([{ text: "⬅️ Back", callback_data: "back:main" }]);

  return { inline_keyboard: rows };
}

/**
 * Build the menu shown under About and Links screens.
 */
export function buildAboutMenu(links) {
  const rows = links.map((link) => [
    { text: `🔗 ${link.label}`, url: link.url },
  ]);

  rows.push([{ text: "⬅️ Back", callback_data: "back:main" }]);

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
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return "❌ Category not found.";

  const categoryTools = tools.filter((tool) => tool.category === categoryId);
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