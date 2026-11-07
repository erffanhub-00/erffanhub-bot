import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl,
  isYouTubeUrl,
  extractYouTubeUrl,
  parseTehranDateTime,
} from '../tgcloud/lib/pure.js';

test('normalizeUrl strips tracking params, fragment and trailing slash', () => {
  assert.equal(
    normalizeUrl('https://example.com/foo/?utm_source=x&fbclid=abc#top'),
    'https://example.com/foo',
  );
  assert.equal(
    normalizeUrl('https://example.com/foo/?gclid=1&keep=2'),
    'https://example.com/foo?keep=2',
  );
  assert.equal(normalizeUrl('https://example.com/foo/'), 'https://example.com/foo');
});

test('normalizeUrl lowercases scheme and host but keeps path case', () => {
  assert.equal(
    normalizeUrl('HTTPS://Example.COM/Path/Article'),
    'https://example.com/Path/Article',
  );
});

test('normalizeUrl returns unparsable input unchanged', () => {
  assert.equal(normalizeUrl('not a url'), 'not a url');
  assert.equal(normalizeUrl('  '), '');
});

test('isYouTubeUrl matches watch, shorts and youtu.be links', () => {
  assert.equal(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), true);
  assert.equal(
    isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'),
    true,
  );
  assert.equal(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'), true);
  assert.equal(
    isYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
    true,
  );
  assert.equal(isYouTubeUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), true);
});

test('isYouTubeUrl rejects non-video YouTube and other pages', () => {
  assert.equal(isYouTubeUrl('https://www.youtube.com/'), false);
  assert.equal(isYouTubeUrl('https://example.com/watch?v=dQw4w9WgXcQ'), false);
  assert.equal(isYouTubeUrl('just some text'), false);
  assert.equal(isYouTubeUrl(''), false);
});

test('extractYouTubeUrl finds the first YouTube link in text', () => {
  assert.equal(
    extractYouTubeUrl('watch this https://youtu.be/dQw4w9WgXcQ please'),
    'https://youtu.be/dQw4w9WgXcQ',
  );
  assert.equal(extractYouTubeUrl('no link here'), null);
});

test('parseTehranDateTime converts a full Tehran datetime to UTC ms', () => {
  // Tehran is UTC+3:30, so 18:00 Tehran is 14:30 UTC.
  assert.equal(
    parseTehranDateTime('2026-11-07 18:00'),
    Date.UTC(2026, 10, 7, 14, 30, 0),
  );
  assert.equal(
    parseTehranDateTime('2026-07-01 12:00'),
    Date.UTC(2026, 6, 1, 8, 30, 0),
  );
  assert.equal(
    parseTehranDateTime('2026-01-15 00:30'),
    Date.UTC(2026, 0, 14, 21, 0, 0),
  );
});

test('parseTehranDateTime round-trips through the Tehran timezone', () => {
  const ms = parseTehranDateTime('2026-11-07 18:00');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (type) => parts.find((p) => p.type === type).value;
  assert.equal(`${get('year')}-${get('month')}-${get('day')}`, '2026-11-07');
  assert.equal(`${get('hour')}:${get('minute')}`, '18:00');
});

test('parseTehranDateTime treats HH:mm as today in Tehran', () => {
  const ms = parseTehranDateTime('18:30');
  assert.notEqual(ms, null);
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const today = fmt.formatToParts(new Date(Date.now()));
  const at = fmt.formatToParts(new Date(ms));
  const get = (ps, type) => ps.find((p) => p.type === type).value;
  assert.equal(get(at, 'year'), get(today, 'year'));
  assert.equal(get(at, 'month'), get(today, 'month'));
  assert.equal(get(at, 'day'), get(today, 'day'));
  assert.equal(`${get(at, 'hour')}:${get(at, 'minute')}`, '18:30');
});

test('parseTehranDateTime rejects invalid input', () => {
  assert.equal(parseTehranDateTime(''), null);
  assert.equal(parseTehranDateTime('hello'), null);
  assert.equal(parseTehranDateTime('2026-11-07'), null);
  assert.equal(parseTehranDateTime('2026-13-01 10:00'), null);
  assert.equal(parseTehranDateTime('2026-02-30 10:00'), null);
  assert.equal(parseTehranDateTime('2026-11-07 25:00'), null);
  assert.equal(parseTehranDateTime('2026-11-07 10:60'), null);
  assert.equal(parseTehranDateTime('25:00'), null);
  assert.equal(parseTehranDateTime('10:60'), null);
  assert.equal(parseTehranDateTime('2026-11-07 18:00:00'), null);
});
