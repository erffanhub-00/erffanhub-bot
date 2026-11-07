import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseRss, dedupeItems, normalizeLink, fetchFeed } from "../src/lib/rss.js";

const fixturesDir = path.dirname(fileURLToPath(import.meta.url)) + "/fixtures";

const ATOM_SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example Feed</title>
  <entry>
    <title>Atom entry one</title>
    <link href="https://example.com/one" rel="alternate"/>
    <summary>First entry summary.</summary>
    <updated>2026-11-07T08:00:00Z</updated>
    <id>urn:example:1</id>
  </entry>
  <entry>
    <title><![CDATA[Atom entry two]]></title>
    <link href="https://example.com/two"/>
    <content>Second entry content &amp; more.</content>
    <published>2026-11-06T10:30:00Z</published>
    <id>urn:example:2</id>
  </entry>
</feed>`;

for (const name of ["zoomit.xml", "digiato.xml", "techcrunch.xml"]) {
  test(`parseRss: ${name} yields >= 3 items with title and https link`, () => {
    const xml = readFileSync(path.join(fixturesDir, name), "utf-8");
    const items = parseRss(xml);
    assert.ok(items.length >= 3, `expected >= 3 items, got ${items.length}`);
    for (const item of items) {
      assert.ok(item.title.length > 0, "title must be non-empty");
      assert.ok(item.link.startsWith("https://"), `link must start https://, got ${item.link}`);
      assert.ok(item.guid.length > 0, "guid must be non-empty");
      assert.ok(
        item.published_at === null || Number.isFinite(item.published_at),
        "published_at must be epoch ms or null",
      );
    }
  });
}

test("parseRss: Atom entries use link href and updated/published dates", () => {
  const items = parseRss(ATOM_SAMPLE);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, "Atom entry one");
  assert.equal(items[0].link, "https://example.com/one");
  assert.equal(items[0].description, "First entry summary.");
  assert.equal(items[0].published_at, Date.parse("2026-11-07T08:00:00Z"));
  assert.equal(items[0].guid, "urn:example:1");
  assert.equal(items[1].title, "Atom entry two");
  assert.equal(items[1].link, "https://example.com/two");
  assert.equal(items[1].description, "Second entry content & more.");
  assert.equal(items[1].published_at, Date.parse("2026-11-06T10:30:00Z"));
});

test("parseRss: empty or invalid input yields no items", () => {
  assert.deepEqual(parseRss(""), []);
  assert.deepEqual(parseRss("not xml at all"), []);
  assert.deepEqual(parseRss(null), []);
});

test("dedupeItems: drops same link after normalizing host, tracking params, slash and fragment", () => {
  const items = [
    { guid: "1", title: "A", link: "https://Example.com/post/?utm_source=x&fbclid=abc", description: "", published_at: null },
    { guid: "2", title: "A again", link: "https://example.com/post", description: "", published_at: null },
    { guid: "3", title: "A fragment", link: "https://example.com/post/#top", description: "", published_at: null },
    { guid: "4", title: "B", link: "https://example.com/other?gclid=1", description: "", published_at: null },
    { guid: "5", title: "B kept param", link: "https://example.com/other?ref=home", description: "", published_at: null },
  ];
  const deduped = dedupeItems(items);
  assert.equal(deduped.length, 3);
  assert.deepEqual(deduped.map((i) => i.guid), ["1", "4", "5"]);
  assert.equal(normalizeLink("https://Example.COM/a/?utm_campaign=t&x=1#frag"), "https://example.com/a?x=1");
});

// Minimal Response-like stub for fetchFeed: status, headers.get, body.getReader.
function stubResponse(xml, status = 200, location = null) {
  const bytes = new TextEncoder().encode(xml);
  let consumed = false;
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => (name.toLowerCase() === "location" ? location : null) },
    body: {
      getReader() {
        return {
          async read() {
            if (consumed) return { done: true, value: undefined };
            consumed = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
        };
      },
    },
  };
}

const RSS_SAMPLE = `<rss version="2.0"><channel><item><title>Hello</title><link>https://example.com/hello</link><description>Hi</description><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate><guid>g1</guid></item></channel></rss>`;

test("fetchFeed: fetches and returns XML for a valid https feed", async () => {
  const xml = await fetchFeed("https://example.com/feed", async () => stubResponse(RSS_SAMPLE));
  assert.equal(parseRss(xml).length, 1);
  assert.equal(parseRss(xml)[0].title, "Hello");
});

test("fetchFeed: follows a redirect to a validated https URL", async () => {
  let calls = 0;
  const xml = await fetchFeed("https://example.com/feed", async (url) => {
    calls += 1;
    if (calls === 1) return stubResponse("", 301, "https://example.com/feed2");
    return stubResponse(RSS_SAMPLE);
  });
  assert.equal(calls, 2);
  assert.equal(parseRss(xml)[0].title, "Hello");
});

test("fetchFeed: rejects http and private hosts before fetching", async () => {
  await assert.rejects(fetchFeed("http://example.com/feed"), /https_only/);
  await assert.rejects(fetchFeed("https://127.0.0.1/feed"), /private_ip/);
  await assert.rejects(fetchFeed("https://user:pass@example.com/feed"), /credentials_not_allowed/);
});

test("fetchFeed: throws too_many_redirects after 3 redirects", async () => {
  await assert.rejects(
    fetchFeed("https://example.com/feed", async () => stubResponse("", 302, "https://example.com/feed")),
    /too_many_redirects/,
  );
});
