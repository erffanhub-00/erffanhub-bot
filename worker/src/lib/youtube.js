// YouTube helpers.
// Note: the YouTube oEmbed endpoint returns NO description field, only
// title, author_name, thumbnail_url and friends. The description of a
// YouTube draft therefore always starts empty for the owner to fill in.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function extractYouTubeId(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl).trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\/+/, "").split("/")[0];
    return VIDEO_ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v");
      return id && VIDEO_ID.test(id) ? id : null;
    }
    const match = url.pathname.match(/^\/(shorts|live|embed)\/([A-Za-z0-9_-]{11})(?:\/|$)/);
    if (match) return match[2];
  }
  return null;
}

// Canonical watch URL, or null when the URL is not a YouTube video URL.
export function normalizeYouTubeUrl(rawUrl) {
  const id = extractYouTubeId(rawUrl);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

// Parse an oEmbed JSON payload. Returns null on anything unexpected.
// Deliberately does not look for a description: oEmbed never sends one.
export function parseOembed(payload) {
  if (!payload || typeof payload !== "object") return null;
  const { title, author_name, thumbnail_url } = payload;
  if (typeof title !== "string" || title === "") return null;
  if (typeof thumbnail_url !== "string" || thumbnail_url === "") return null;
  return {
    kind: "youtube",
    title,
    author_name: typeof author_name === "string" ? author_name : "",
    thumbnail_url,
  };
}
