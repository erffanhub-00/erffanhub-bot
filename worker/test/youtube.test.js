import test from "node:test";
import assert from "node:assert/strict";
import { normalizeYouTubeUrl, extractYouTubeId, parseOembed } from "../src/lib/youtube.js";

const VIDEO_ID = "dQw4w9WgXcQ";

test("normalizeYouTubeUrl: accepts watch, shorts, live and youtu.be URLs", () => {
  assert.equal(
    normalizeYouTubeUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}`),
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  );
  assert.equal(
    normalizeYouTubeUrl(`https://youtube.com/watch?v=${VIDEO_ID}&t=30s`),
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  );
  assert.equal(
    normalizeYouTubeUrl(`https://www.youtube.com/shorts/${VIDEO_ID}`),
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  );
  assert.equal(
    normalizeYouTubeUrl(`https://www.youtube.com/live/${VIDEO_ID}`),
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  );
  assert.equal(
    normalizeYouTubeUrl(`https://youtu.be/${VIDEO_ID}`),
    `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  );
});

test("normalizeYouTubeUrl: rejects non-YouTube and malformed URLs", () => {
  assert.equal(normalizeYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(normalizeYouTubeUrl("https://www.youtube.com/"), null);
  assert.equal(normalizeYouTubeUrl("https://www.youtube.com/watch"), null);
  assert.equal(normalizeYouTubeUrl("not a url"), null);
  assert.equal(extractYouTubeId(`https://www.youtube.com/watch?v=short`), null);
});

test("parseOembed: parses a sample oEmbed response and expects no description", () => {
  const sample = {
    title: "Rick Astley - Never Gonna Give You Up (Official Video)",
    author_name: "Rick Astley",
    author_url: "https://www.youtube.com/@RickAstley",
    type: "video",
    height: 113,
    width: 200,
    version: "1.0",
    provider_name: "YouTube",
    provider_url: "https://www.youtube.com/",
    thumbnail_height: 360,
    thumbnail_width: 480,
    thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    html: "<iframe></iframe>",
  };
  // oEmbed returns NO description field: confirm the sample has none,
  // and the parsed result does not invent one.
  assert.ok(!("description" in sample), "oEmbed payload has no description field");
  const parsed = parseOembed(sample);
  assert.deepEqual(parsed, {
    kind: "youtube",
    title: "Rick Astley - Never Gonna Give You Up (Official Video)",
    author_name: "Rick Astley",
    thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  });
  assert.ok(!("description" in parsed));
});

test("parseOembed: rejects payloads without title or thumbnail", () => {
  assert.equal(parseOembed(null), null);
  assert.equal(parseOembed({}), null);
  assert.equal(parseOembed({ title: "x" }), null);
  assert.equal(parseOembed({ title: "x", thumbnail_url: "https://i.ytimg.com/x.jpg" }).title, "x");
});
