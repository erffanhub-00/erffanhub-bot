import test from "node:test";
import assert from "node:assert/strict";
import { validateUrl } from "../src/lib/validate.js";

test("validateUrl: rejects http", () => {
  assert.deepEqual(validateUrl("http://example.com/feed"), { ok: false, reason: "https_only" });
});

test("validateUrl: rejects localhost and .local hosts", () => {
  assert.equal(validateUrl("https://localhost/feed").ok, false);
  assert.equal(validateUrl("https://printer.local/feed").ok, false);
  assert.equal(validateUrl("https://localhost:8080/feed").ok, false);
});

test("validateUrl: rejects loopback and private IPv4 ranges", () => {
  for (const url of [
    "https://127.0.0.1/feed",
    "https://127.5.6.7/feed",
    "https://10.0.0.5/feed",
    "https://10.255.255.255/feed",
    "https://172.16.0.1/feed",
    "https://172.31.255.255/feed",
    "https://192.168.0.1/feed",
    "https://192.168.1.100/feed",
  ]) {
    assert.equal(validateUrl(url).ok, false, url);
  }
  // 172.32.x is public space, not in 172.16.0.0/12.
  assert.equal(validateUrl("https://172.32.0.1/feed").ok, true);
});

test("validateUrl: rejects link-local 169.254.x", () => {
  assert.equal(validateUrl("https://169.254.169.254/latest/meta-data/").ok, false);
});

test("validateUrl: rejects ::1", () => {
  assert.equal(validateUrl("https://[::1]/feed").ok, false);
});

test("validateUrl: rejects URLs with user:pass@", () => {
  assert.deepEqual(validateUrl("https://user:pass@example.com/feed"), {
    ok: false,
    reason: "credentials_not_allowed",
  });
  assert.equal(validateUrl("https://user@example.com/feed").ok, false);
});

test("validateUrl: rejects empty and malformed URLs", () => {
  assert.equal(validateUrl("").ok, false);
  assert.equal(validateUrl("not a url").ok, false);
  assert.equal(validateUrl("ftp://example.com/feed").ok, false);
});

test("validateUrl: accepts https://www.zoomit.ir/feed/", () => {
  assert.deepEqual(validateUrl("https://www.zoomit.ir/feed/"), { ok: true });
  assert.deepEqual(validateUrl("https://digiato.com/feed"), { ok: true });
  assert.deepEqual(validateUrl("https://techcrunch.com/feed/"), { ok: true });
});
