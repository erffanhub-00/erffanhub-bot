/**
 * Handle inline queries: @erffanhub_bot <search term>
 */
function isOwner(userId, env) {
  return Boolean(env.OWNER_TELEGRAM_ID) && String(userId) === String(env.OWNER_TELEGRAM_ID);
}

const ALLOWED_FILE_TYPES = ["pdf", "jpg", "jpeg", "png", "gif", "webp", "mp3", "mp4", "zip", "doc", "docx", "txt"];

function escapeFts(query) {
  return query
    .replace(/["()*\-+^~:{}\[\]]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^(or|and|not)$/i.test(w))
    .join(" ");
}

function shortId(fileId) {
  let hash = 0;
  for (let i = 0; i < fileId.length; i++) {
    hash = ((hash << 5) - hash + fileId.charCodeAt(i)) | 0;
  }
  return `f_${(hash >>> 0).toString(36)}`;
}

export async function handleInlineQuery(inlineQuery, env) {
  if (!isOwner(inlineQuery.from?.id, env)) return;

  let query = inlineQuery.query.trim();
  let fileTypeFilter = null;

  // User can filter by type: "react | pdf"
  if (query.includes("|")) {
    const parts = query.split("|").map((p) => p.trim());
    query = parts[0];
    fileTypeFilter = parts[1].toLowerCase();
  }

  const results = [];

  if (!query) {
    results.push({
      type: "article",
      id: "hint",
      title: "🔍 Type a file name to search",
      input_message_content: {
        message_text: "Type a file name after the bot username to search.",
      },
    });
    return await answerInlineQuery(inlineQuery.id, results, env);
  }

  // Build FTS5 query with prefix matching
  const safeQuery = escapeFts(query);
  let rows = [];
  let queryFailed = false;

  if (safeQuery) {
    let sql = `
    SELECT f.file_id, f.file_name, f.file_extension
    FROM files f
    JOIN files_fts ON f.id = files_fts.rowid
    WHERE files_fts MATCH ?
  `;
    const params = [safeQuery + "*"];

    if (fileTypeFilter && ALLOWED_FILE_TYPES.includes(fileTypeFilter)) {
      sql += " AND f.file_extension = ?";
      params.push(fileTypeFilter);
    }

    sql += " LIMIT 50";

    try {
      const result = await env.DB.prepare(sql).bind(...params).all();
      rows = result.results || [];
    } catch (err) {
      console.error("D1 query failed:", err.message);
      queryFailed = true;
    }
  }

  const seenIds = new Set();
  for (const row of rows) {
    let id = shortId(row.file_id);
    let n = 1;
    while (seenIds.has(id)) id = `${shortId(row.file_id)}_${n++}`;
    seenIds.add(id);
    results.push({
      type: "document",
      id,
      title: row.file_name,
      document_file_id: row.file_id,
      description: `Format: ${row.file_extension.toUpperCase()}`,
    });
  }

  if (queryFailed) {
    results.push({
      type: "article",
      id: "search_error",
      title: "Search failed, try again",
      input_message_content: {
        message_text: "Search failed, try again.",
      },
    });
  } else if (results.length === 0) {
    results.push({
      type: "article",
      id: "no_result",
      title: "❌ No files found",
      input_message_content: {
        message_text: `No files found for "${query}".`,
      },
    });
  }

  await answerInlineQuery(inlineQuery.id, results, env);
}

async function answerInlineQuery(inlineQueryId, results, env) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerInlineQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inline_query_id: inlineQueryId,
        results: results,
        cache_time: 30,
        is_personal: true,
      }),
    });
    if (!res.ok) {
      console.error(`answerInlineQuery failed: ${res.status}`);
    }
  } catch (err) {
    console.error("answerInlineQuery failed:", err.message);
  }
}
