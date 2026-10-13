import toolsData from "./tools.json";

const { categories, tools } = toolsData;

/**
 * Build the main menu (list of categories).
 * @returns {object} Telegram inline keyboard markup
 */
export function buildMainMenu() {
  const rows = categories.map((category) => [
    {
      text: `${category.emoji} ${category.name}`.trim(),
      callback_data: `cat:${category.id}`,
    },
  ]);

  return { inline_keyboard: rows };
}

/**
 * Build the menu for a specific category (list of tools + back button).
 * The back button is always included, even when the category is empty.
 * @param {string} categoryId
 * @returns {object} Telegram inline keyboard markup
 */
export function buildCategoryMenu(categoryId) {
  const categoryTools = tools.filter((tool) => tool.category === categoryId);

  const rows = categoryTools.map((tool) => [
    {
      text: `🔗 ${tool.name}`,
      url: tool.url,
    },
  ]);

  rows.push([
    {
      text: "⬅️ Back",
      callback_data: "back:main",
    },
  ]);

  return { inline_keyboard: rows };
}

/**
 * Text shown at the top of the main menu.
 * @returns {string}
 */
export function getMainMenuText() {
  return "📦 *ErffanHub Toolbox*\n\nSelect a category:";
}

/**
 * Text shown at the top of a category menu.
 * Handles the empty-category case.
 * @param {string} categoryId
 * @returns {string}
 */
export function getCategoryText(categoryId) {
  const category = categories.find((c) => c.id === categoryId);
  if (!category) {
    return "❌ Category not found.";
  }

  const categoryTools = tools.filter((tool) => tool.category === categoryId);
  if (categoryTools.length === 0) {
    return `📂 *${category.name}*\n\n⚠️ No tools in this category yet.`;
  }

  return `📂 *${category.name}*\n\nSelect a tool:`;
}