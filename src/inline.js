/**
 * Handle inline queries: @erffanhub_bot <search term>
 */
export async function handleInlineQuery(inlineQuery, env) {
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
  let sql = `
    SELECT f.file_id, f.file_name, f.file_extension
    FROM files f
    JOIN files_fts ON f.id = files_fts.rowid
    WHERE files_fts MATCH ?
  `;
  const params = [query + "*"];

  if (fileTypeFilter) {
    sql += " AND f.file_extension = ?";
    params.push(fileTypeFilter);
  }

  sql += " LIMIT 50";

  let rows = [];
  try {
    const result = await env.DB.prepare(sql).bind(...params).all();
    rows = result.results || [];
  } catch (err) {
    console.error("D1 query failed:", err.message);
  }

  for (const row of rows) {
    results.push({
      type: "document",
      id: `file_${row.file_id}`,
      title: row.file_name,
      document_file_id: row.file_id,
      description: `Format: ${row.file_extension.toUpperCase()}`,
    });
  }

  if (results.length === 0) {
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
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerInlineQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inline_query_id: inlineQueryId,
      results: results,
      cache_time: 30,
      is_personal: true,
    }),
  });
}