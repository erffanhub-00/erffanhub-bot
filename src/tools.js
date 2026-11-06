/**
 * Tools and categories data (src/tools.json), validated once at startup so a
 * bad edit fails fast instead of producing a broken menu at runtime.
 */
import toolsData from "./tools.json" with { type: "json" };

export function validateTools(data) {
  if (!data || !Array.isArray(data.categories) || !Array.isArray(data.tools)) {
    throw new Error("tools.json: categories and tools must be arrays");
  }

  const categoryIds = new Set();
  for (const category of data.categories) {
    if (!category.id || !category.name) {
      throw new Error("tools.json: category needs id and name");
    }
    if (categoryIds.has(category.id)) {
      throw new Error(`tools.json: duplicate category id ${category.id}`);
    }
    categoryIds.add(category.id);
  }

  const toolIds = new Set();
  for (const tool of data.tools) {
    if (!tool.id || !tool.name) {
      throw new Error("tools.json: tool needs id and name");
    }
    if (!categoryIds.has(tool.category)) {
      throw new Error(`tools.json: tool ${tool.id} has unknown category ${tool.category}`);
    }
    if (toolIds.has(tool.id)) {
      throw new Error(`tools.json: duplicate tool id ${tool.id}`);
    }
    toolIds.add(tool.id);
    if (!tool.url || !tool.url.startsWith("https://")) {
      throw new Error(`tools.json: tool ${tool.id} url must start with https://`);
    }
  }
}

validateTools(toolsData);

export const categories = toolsData.categories;
export const tools = toolsData.tools;

export function getCategory(categoryId) {
  return categories.find((category) => category.id === categoryId) || null;
}

export function getToolsByCategory(categoryId) {
  return tools.filter((tool) => tool.category === categoryId);
}
