import test from "node:test";
import assert from "node:assert/strict";
import { tehranNow, isDue } from "../src/lib/time.js";

test("tehranNow: fixed UTC timestamp converts to Tehran wall time (UTC+3:30, no DST)", () => {
  // 2026-11-07 09:00:00 UTC -> 12:30:00 in Tehran.
  assert.equal(tehranNow(new Date(Date.UTC(2026, 10, 7, 9, 0, 0))), "2026-11-07 12:30:00");
  // Winter date: 2026-01-15 00:00:00 UTC -> 03:30:00 in Tehran (no DST shift).
  assert.equal(tehranNow(new Date(Date.UTC(2026, 0, 15, 0, 0, 0))), "2026-01-15 03:30:00");
  // Late evening UTC rolls to the next Tehran day.
  assert.equal(tehranNow(new Date(Date.UTC(2026, 10, 7, 21, 0, 0))), "2026-11-08 00:30:00");
});

test("isDue: publish_at in the past is due, in the future is not", () => {
  const now = Date.parse("2026-11-07T12:00:00Z");
  assert.equal(isDue(now - 1000, now), true);
  assert.equal(isDue(now, now), true);
  assert.equal(isDue(now + 1000, now), false);
  assert.equal(isDue(now + 60 * 60 * 1000, now), false);
});
