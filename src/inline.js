/**
 * Inline queries: @erffanhubbot <search term> searches the indexed files.
 * Owner only. An optional "| type" suffix filters by file extension.
 */
import { isOwner } from "./auth.js";
import { callTelegram } from "./telegram.js";

const ALLOWED_FILE_TYPES = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "mp3",
  "mp4",
  "zip",
  "doc",
  "docx",
  "txt",
];

/**
 * Strip FTS5 syntax from user input so the query cannot break or escape the
 * MATCH expression. Reserved words (or/and/not) are dropped too.
 */
export function escapeFts(query) {
  return query
    .replace(/["()*\-+^~:{}\[\]]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(or|and|not)$/i.test(w))
    .join(" ");
}

/**
 * Parse "term | pdf" into a search term and an optional file-type filter.
 * An unknown or missing type is ignored instead of failing the search.
 */
export function parseInlineQuery(rawQuery) {
  const query = rawQuery.trim();
  if (!query.includes("|")) return { query, fileTypeFilter: null };

  const parts = query.split("|").map((p) => p.trim());
  const type = (parts[1] || "").toLowerCase();
  return {
    query: parts[0],
    fileTypeFilter: ALLOWED_FILE_TYPES.includes(type) ? type : null,
  };
}

/**
 * Short, Telegram-safe result id derived from the file id. Collisions get a
 * numeric suffix so every result id in one answer stays unique.
 */
export function shortId(fileId) {
  let hash = 0;
  for (let i = 0; i < fileId.length; i++) {
    hash = ((hash << 5) - hash + fileId.charCodeAt(i)) | 0;
  }
  return `f_${(hash >>> 0).toString(36)}`;
}

function uniqueResultId(fileId, seen) {
  const base = shortId(fileId);
  let id = base;
  let n = 1;
  while (seen.has(id)) id = `${base}_${n++}`;
  seen.add(id);
  return id;
}

function hintResult() {
  return {
    type: "article",
    id: "hint",
    title: "🔍 Type a file name to search",
    input_message_content: {
      message_text: "Type a file name after the bot username to search.",
    },
  };
}

function errorResult() {
  return {
    type: "article",
    id: "search_error",
    title: "Search failed, try again",
    input_message_content: { message_text: "Search failed, try again." },
  };
}

function noResult(query) {
  return {
    type: "article",
    id: "no_result",
    title: "❌ No files found",
    input_message_content: { message_text: `No files found for "${query}".` },
  };
}

async function searchFiles(db, query, fileTypeFilter) {
  const safeQuery = escapeFts(query);
  if (!safeQuery) return [];

  let sql = `
    SELECT f.file_id, f.file_name, f.file_extension
    FROM files f
    JOIN files_fts ON f.id = files_fts.rowid
    WHERE files_fts MATCH ?
  `;
  const params = [safeQuery + "*"];

  if (fileTypeFilter) {
    sql += " AND f.file_extension = ?";
    params.push(fileTypeFilter);
  }

  sql += " LIMIT 50";

  const result = await db.prepare(sql).bind(...params).all();
  return result.results || [];
}

export async function handleInlineQuery(inlineQuery, env) {
  if (!isOwner(inlineQuery.from?.id, env)) return;

  const { query, fileTypeFilter } = parseInlineQuery(inlineQuery.query || "");

  if (!query) {
    await answerInlineQuery(inlineQuery.id, [hintResult()], env);
    return;
  }

  let rows = [];
  let queryFailed = false;
  try {
    rows = await searchFiles(env.DB, query, fileTypeFilter);
  } catch (err) {
    console.error("D1 query failed:", err.message);
    queryFailed = true;
  }

  const seenIds = new Set();
  const results = rows.map((row) => ({
    type: "document",
    id: uniqueResultId(row.file_id, seenIds),
    title: row.file_name,
    document_file_id: row.file_id,
    description: `Format: ${row.file_extension.toUpperCase()}`,
  }));

  if (queryFailed) {
    results.push(errorResult());
  } else if (results.length === 0) {
    results.push(noResult(query));
  }

  await answerInlineQuery(inlineQuery.id, results, env);
}

async function answerInlineQuery(inlineQueryId, results, env) {
  const result = await callTelegram(
    "answerInlineQuery",
    {
      inline_query_id: inlineQueryId,
      results,
      cache_time: 30,
      is_personal: true,
    },
    env
  );
  if (result === null) {
    console.error("answerInlineQuery failed");
  }
}
