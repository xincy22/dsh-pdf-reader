import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePages, formatPages, DEFAULT_PAGES, MAX_PAGES } from '../src/pages.js';

test('default reads the first pages', () => {
  assert.deepEqual(parsePages(undefined, 100), Array.from({ length: DEFAULT_PAGES }, (_, i) => i + 1));
  assert.deepEqual(parsePages('', 2), [1, 2]);
});

test('lists, ranges and open ranges', () => {
  assert.deepEqual(parsePages('5', 10), [5]);
  assert.deepEqual(parsePages('5,2,5', 10), [5, 2]);
  assert.deepEqual(parsePages('3-5', 10), [3, 4, 5]);
  assert.deepEqual(parsePages('8-', 10), [8, 9, 10]);
  assert.deepEqual(parsePages(' 1 - 2 , 9 ', 10), [1, 2, 9]);
});

test('invalid expressions name the problem', () => {
  assert.throws(() => parsePages('0', 10), /outside 1-10/);
  assert.throws(() => parsePages('11', 10), /outside 1-10/);
  assert.throws(() => parsePages('5-3', 10), /outside/);
  assert.throws(() => parsePages('abc', 10), /bad pages expression/);
  assert.throws(() => parsePages('1-' + (MAX_PAGES + 1), 100), /at most/);
});

test('formatPages compresses runs', () => {
  assert.equal(formatPages([1, 2, 3, 7, 9, 10]), '1-3,7,9-10');
});
