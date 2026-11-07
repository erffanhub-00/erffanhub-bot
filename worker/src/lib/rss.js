// RSS 2.0 (<item>) and Atom (<entry>) parsing by hand, no dependencies.
// Only the fields the Worker needs are extracted: title, link,
// description/summary/content, pubDate/updated, guid/id.

import { validateUrl } from "./validate.js";

export const MAX_FEED_BYTES = 2 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 3;

export function decodeEntities(text) {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function stripTags(text) {
  return decodeEntities(text.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

// Extract the inner text of the first <tag ...>...</tag> (or self-closing
// <tag ... />) inside a block. Handles CDATA sections.
function tagText(block, tag) {
  const pattern = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>|<${tag}(?:\\s[^>]*)?/>`,
    "i",
  );
  const match = block.match(pattern);
  if (!match) return "";
  const raw = match[1] ?? "";
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  const text = cdata ? cdata[1] : raw;
  return stripTags(text);
}

function tagAttr(block, tag, attr) {
  const pattern = new RegExp(`<${tag}\\b[^>]*?\\b${attr}\\s*=\\s*"([^"]*)"`, "i");
  const match = block.match(pattern);
  if (match) return decodeEntities(match[1]);
  const single = new RegExp(`<${tag}\\b[^>]*?\\b${attr}\\s*=\\s*'([^']*)'`, "i");
  const singleMatch = block.match(single);
  return singleMatch ? decodeEntities(singleMatch[1]) : "";
}

// Atom <link> carries the URL in its href attribute; prefer rel="alternate"
// (or no rel) over rel="self" and friends.
function atomLink(block) {
  const links = [...block.matchAll(/<link\b[^>]*>/gi)];
  for (const [tag] of links) {
    const rel = /rel\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? "";
    const href = /href\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? "";
    if (href && (rel === "" || rel === "alternate")) return decodeEntities(href);
  }
  for (const [tag] of links) {
    const href = /href\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? "";
    if (href) return decodeEntities(href);
  }
  return "";
}

function parseDate(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function parseItemBlock(block, isAtom) {
  const title = tagText(block, "title");
  let link = "";
  if (isAtom) {
    link = atomLink(block) || tagText(block, "link");
  } else {
    link = tagText(block, "link") || tagAttr(block, "link", "href");
  }
  const description =
    tagText(block, "description") ||
    tagText(block, "summary") ||
    tagText(block, "content:encoded") ||
    tagText(block, "content") ||
    "";
  const publishedAt = parseDate(
    tagText(block, "pubDate") ||
      tagText(block, "updated") ||
      tagText(block, "published") ||
      tagText(block, "dc:date") ||
      "",
  );
  const guid = tagText(block, "guid") || tagText(block, "id") || link;
  if (!title || !link) return null;
  return { guid, title, link, description, published_at: publishedAt };
}

export function parseRss(xml) {
  if (typeof xml !== "string" || xml === "") return [];
  const items = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks) {
    const item = parseItemBlock(block, false);
    if (item) items.push(item);
  }
  const entryBlocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of entryBlocks) {
    const item = parseItemBlock(block, true);
    if (item) items.push(item);
  }
  return items;
}

// Normalize a link for dedupe: lowercase host, drop tracking params
// (utm_*, fbclid, gclid), strip fragment and trailing slash.
export function normalizeLink(link) {
  let url;
  try {
    url = new URL(String(link).trim());
  } catch {
    return String(link).trim().toLowerCase();
  }
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    if (
      key.toLowerCase().startsWith("utm_") ||
      key.toLowerCase() === "fbclid" ||
      key.toLowerCase() === "gclid"
    ) {
      url.searchParams.delete(key);
    }
  }
  url.hash = "";
  let path = url.pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  url.pathname = path;
  return url.toString();
}

export function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = normalizeLink(item.link ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// Fetch one feed with manual redirect handling (max 3, each target
// re-validated), an 8s timeout and a 2 MB response cap.
// Throws an Error whose message is a short machine-readable code.
export async function fetchFeed(url, fetchImpl = fetch) {
  const first = validateUrl(url);
  if (!first.ok) throw new Error(first.reason ?? "invalid_url");
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchImpl(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "ErffanHub/1.0 (RSS reader)", accept: "application/rss+xml, application/xml, text/xml, */*" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers?.get?.("location");
      if (!location) throw new Error("redirect_without_location");
      if (hop === MAX_REDIRECTS) throw new Error("too_many_redirects");
      const next = new URL(location, current).toString();
      const check = validateUrl(next);
      if (!check.ok) throw new Error(check.reason ?? "invalid_url");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`http_${response.status}`);
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_FEED_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // ignore cancel errors
        }
        throw new Error("response_too_large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
  throw new Error("too_many_redirects");
}
