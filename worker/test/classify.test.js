import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClassifyText, normalizeCategory, CATEGORIES } from '../src/lib/categories.js';
import { buildClassifyMessages, classifyItems } from '../src/lib/ai.js';

const items = [
  { id: 11, title: 'آیفون جدید', text: 'اپل گوشی تازه معرفی کرد' },
  { id: 22, title: 'مدل زبانی تازه', text: 'مدلی برای چت معرفی شد' },
  { id: 33, title: 'بازی جدید', text: 'بازی اکشن منتشر شد' },
];

test('parseClassifyText maps numbered lines to items in order', () => {
  const out = parseClassifyText('1. موبایل\n2. هوش مصنوعی\n3. بازی', items);
  assert.deepEqual(out, [
    { id: 11, category: 'موبایل' },
    { id: 22, category: 'هوش مصنوعی' },
    { id: 33, category: 'بازی' },
  ]);
});

test('parseClassifyText tolerates dashes and trailing punctuation', () => {
  const out = parseClassifyText('1- موبایل.\n2) هوش مصنوعی،\n3: بازی', items);
  assert.deepEqual(out, [
    { id: 11, category: 'موبایل' },
    { id: 22, category: 'هوش مصنوعی' },
    { id: 33, category: 'بازی' },
  ]);
});

test('parseClassifyText falls back to سایر for unknown categories', () => {
  const out = parseClassifyText('1. آشپزی\n2. هوش مصنوعی\n3. ورزش', items);
  assert.deepEqual(out, [
    { id: 11, category: 'سایر' },
    { id: 22, category: 'هوش مصنوعی' },
    { id: 33, category: 'سایر' },
  ]);
});

test('parseClassifyText falls back to سایر for missing or unparsable lines', () => {
  const out = parseClassifyText('1. موبایل\nفقط یک دسته بدون شماره\n3. بازی', items);
  assert.deepEqual(out, [
    { id: 11, category: 'موبایل' },
    { id: 22, category: 'سایر' },
    { id: 33, category: 'بازی' },
  ]);
  assert.deepEqual(parseClassifyText('', items), [
    { id: 11, category: 'سایر' },
    { id: 22, category: 'سایر' },
    { id: 33, category: 'سایر' },
  ]);
});

test('normalizeCategory only accepts the fixed list', () => {
  for (const c of CATEGORIES) assert.equal(normalizeCategory(c), c);
  assert.equal(normalizeCategory('فناوری'), 'سایر');
  assert.equal(normalizeCategory('  هوش مصنوعی  '), 'هوش مصنوعی');
});

test('buildClassifyMessages sends one numbered list and the fixed list only', () => {
  const messages = buildClassifyMessages(items);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  for (const c of CATEGORIES) assert.ok(messages[0].content.includes(c));
  assert.ok(messages[1].content.includes('1. آیفون جدید'));
  assert.ok(messages[1].content.includes('2. مدل زبانی تازه'));
  assert.ok(messages[1].content.includes('3. بازی جدید'));
});

test('classifyItems returns one category per item from one AI call', async () => {
  let calls = 0;
  const env = {
    AI: {
      run: async (model, opts) => {
        calls += 1;
        assert.equal(model, '@cf/meta/llama-3.1-8b-instruct');
        assert.equal(opts.messages.length, 2);
        return { response: '1. موبایل\n2. هوش مصنوعی\n3. بازی' };
      },
    },
  };
  const out = await classifyItems(env, items);
  assert.equal(calls, 1);
  assert.deepEqual(out, [
    { id: 11, category: 'موبایل' },
    { id: 22, category: 'هوش مصنوعی' },
    { id: 33, category: 'بازی' },
  ]);
});

test('classifyItems throws when AI is unavailable', async () => {
  await assert.rejects(() => classifyItems({}, items), /ai_unavailable/);
});
