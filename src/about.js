/**
 * Owner profile and social links.
 * Edit this file to update the About section.
 */
export const owner = {
  name: "Erffan",
  tagline: "Developer & Tool Builder",
  bio: "I build small, focused tools and publish them under ErffanHub. This bot is a personal toolbox that collects and organizes them in one place.",
  links: [
    {
      label: "Telegram",
      url: "https://t.me/erffan_hub",
    },
    {
      label: "Twitter / X",
      url: "https://x.com/Erffanhub_00",
    },
    {
      label: "GitHub",
      url: "https://github.com/erffanhub-00",
    },
    {
      label: "Gist",
      url: "https://gist.github.com/erffanhub-00",
    },
  ],
};

/**
 * Text shown in the About screen.
 * @returns {string}
 */
export function getAboutText() {
  return [
    `👤 *${owner.name}*`,
    `_${owner.tagline}_`,
    "",
    owner.bio,
  ].join("\n");
}

/**
 * Text shown in the Help screen.
 * @returns {string}
 */
export function getHelpText() {
  return [
    "📖 *Help*",
    "",
    "This bot is a personal toolbox. It organizes tools into categories and opens them in your browser.",
    "",
    "*Commands*",
    "/start — Open the main menu",
    "/help — Show this help message",
    "/about — About the owner",
    "",
    "*How it works*",
    "1. Pick a category from the main menu.",
    "2. Pick a tool from the list.",
    "3. The tool opens in your browser.",
    "",
    "Use the *Back* button to return to the previous menu.",
  ].join("\n");
}