/**
 * Bot commands. Defined once and used by the command menu registration
 * (index.js) and the help text (about.js), so they cannot drift apart.
 */
export const COMMANDS = [
  { command: "start", description: "Open the main menu" },
  { command: "help", description: "Show help" },
  { command: "about", description: "About the owner" },
  { command: "links", description: "Social links" },
];

/**
 * Parse the command name out of a message, e.g. "/start@botname args" -> "start".
 * Returns null when the message is not a command.
 */
export function parseCommand(text) {
  const first = text.trim().split(/\s+/)[0] || "";
  if (!first.startsWith("/")) return null;
  return first.slice(1).split("@")[0] || null;
}
