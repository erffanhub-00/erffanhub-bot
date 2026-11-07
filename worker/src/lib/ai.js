// Workers AI post writing. The system prompt forbids inventing anything:
// the model may use only the facts in the given title and text. Dates,
// numbers, names and facts that are not in the source must not appear.

import { CATEGORIES, parseClassifyText } from "./categories.js";

export const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

export const SYSTEM_PROMPT = [
  "تو نویسنده‌ی پست‌های یک کانال تلگرامی فارسی هستی.",
  "فقط از اطلاعاتی که در عنوان و متن داده شده استفاده کن.",
  "تاریخ، عدد، نام یا واقعیتی که در منبع نیست را نساز و اضافه نکن.",
  "اگر چیزی در منبع مشخص نیست، درباره‌اش چیزی نگو.",
  "پست را فارسی، روان و کوتاه بنویس: یک خط عنوان و بعد ۲ تا ۴ خط کوتاه.",
  "بدون هشتگ اضافه و بدون جمله‌ی تبلیغاتی.",
].join("\n");

const TASK_INSTRUCTIONS = {
  write_post: "از روی این خبر یک پست کانال بنویس.",
  rewrite: "این پست را بازنویسی کن؛ معنا و اطلاعات را عوض نکن.",
  shorten: "این پست را کوتاه‌تر کن؛ فقط مهم‌ترین نکته‌ها بمانند.",
  formal: "این پست را رسمی‌تر و جدی‌تر بازنویسی کن؛ معنا و اطلاعات را عوض نکن.",
};

export function buildAiMessages({ task, title, text, source_url }) {
  const instruction = TASK_INSTRUCTIONS[task] ?? TASK_INSTRUCTIONS.write_post;
  const lines = [instruction];
  if (title) lines.push(`عنوان: ${title}`);
  if (text) lines.push(`متن: ${text}`);
  if (source_url) lines.push(`منبع: ${source_url}`);
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

export function extractAiText(result) {
  if (!result) return "";
  if (typeof result === "string") return result.trim();
  if (typeof result.response === "string") return result.response.trim();
  if (typeof result.text === "string") return result.text.trim();
  return "";
}

export async function writePost(env, input) {
  if (!env?.AI?.run) throw new Error("ai_unavailable");
  const result = await env.AI.run(AI_MODEL, {
    messages: buildAiMessages(input),
    max_tokens: 600,
  });
  const text = extractAiText(result);
  if (!text) throw new Error("ai_empty_response");
  return text;
}

// Classify a batch of news items into topic categories with ONE AI call:
// the titles go in as a numbered list and one category per item comes
// back. Items the model cannot place fall back to 'سایر' (see
// parseClassifyText) — classification never fails the fetch.
export function buildClassifyMessages(items) {
  const lines = items.map((item, i) => {
    const title = String(item.title ?? "").slice(0, 150);
    const text = String(item.text ?? "").slice(0, 200);
    return `${i + 1}. ${title}${text ? " — " + text : ""}`;
  });
  return [
    {
      role: "system",
      content: [
        "تو یک دسته‌بندی‌کننده خبرهای تکنولوژی هستی.",
        "به هر خبر دقیقاً یک دسته از این لیست بده و چیز دیگری ننویس:",
        CATEGORIES.join("، "),
        "برای هر خبر فقط یک خط بنویس به این شکل: شماره. دسته",
      ].join("\n"),
    },
    { role: "user", content: lines.join("\n") },
  ];
}

export async function classifyItems(env, items) {
  if (!env?.AI?.run) throw new Error("ai_unavailable");
  const result = await env.AI.run(AI_MODEL, {
    messages: buildClassifyMessages(items),
    max_tokens: 400,
  });
  const text = extractAiText(result);
  if (!text) throw new Error("ai_empty_response");
  return parseClassifyText(text, items);
}
