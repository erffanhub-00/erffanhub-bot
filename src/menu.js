import toolsData from "./tools.json";

const { categories, tools } = toolsData;

/**
 * Persistent reply keyboard shown at the bottom of the screen.
 * @returns {object} Telegram reply keyboard markup
 */
export function buildReplyKeyboard() {
  return {
    keyboard: [
      [{ text: "📦 Menu" }, { text: "👤 About" }],
      [{ text: "📖 Help" }, { text: "🔗 Links" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/**
 * Build the inline menu for the main screen (categories + About / Help / Links).
 * @returns {object} Telegram inline keyboard markup
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
 * Build the inline menu for a specific category (tools + back button).
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

  rows.push([{ text: "⬅️ Back", callback_data: "back:main" }]);

  return { inline_keyboard: rows };
}

/**
 * Build the inline menu shown under the About screen.
 * @param {Array} links
 * @returns {object} Telegram inline keyboard markup
 */
export function buildAboutMenu(links) {
  const linkRows = links.map((link) => [
    { text: `🔗 ${link.label}`, url: link.url },
  ]);

  linkRows.push([{ text: "⬅️ Back", callback_data: "back:main" }]);

  return { inline_keyboard: linkRows };
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

/**
 * Text shown when the user opens the Links screen.
 * @returns {string}
 */
export function getLinksText() {
  return "🔗 *Links*\n\nFind me on:";
}