import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readingOrder, mergeBoxes, joinText, detectFigures, marginOf, headingLevel, layoutPage } from '../src/layout.js';

const u = (id, bbox) => ({ id, bbox });

test('two columns are read column by column, a full-width title first', () => {
  const units = [
    u('title', [100, 50, 500, 70]),
    u('L1', [50, 100, 290, 200]), u('L2', [50, 210, 290, 400]),
    u('R1', [320, 100, 560, 300]), u('R2', [320, 310, 560, 400]),
    u('footer', [50, 700, 560, 720]),
  ];
  assert.deepEqual(readingOrder(units).map((x) => x.id), ['title', 'L1', 'L2', 'R1', 'R2', 'footer']);
});

test('a gap that lines up across both columns does not break the columns', () => {
  const units = [u('L1', [50, 100, 290, 200]), u('R1', [320, 100, 560, 200]), u('L2', [50, 220, 290, 300]), u('R2', [320, 220, 560, 300])];
  assert.deepEqual(readingOrder(units).map((x) => x.id), ['L1', 'L2', 'R1', 'R2']);
});

test('single column keeps top-to-bottom order', () => {
  const units = [u('b', [50, 200, 500, 250]), u('a', [50, 100, 500, 150])];
  assert.deepEqual(readingOrder(units).map((x) => x.id), ['a', 'b']);
});

test('mergeBoxes joins touching boxes transitively', () => {
  const out = mergeBoxes([[0, 0, 10, 10], [12, 0, 20, 10], [22, 0, 30, 10], [100, 100, 110, 110]], 3);
  assert.equal(out.length, 2);
  assert.ok(out.some((b) => b[0] === 0 && b[2] === 30));
});

test('joinText adds no space between CJK characters', () => {
  assert.equal(joinText('读成图', '文交替'), '读成图文交替');
  assert.equal(joinText('reading', 'order'), 'reading order');
  assert.equal(joinText('line ', 'two'), 'line two');
});

const block = (bbox, text, extra = {}) => ({ bbox, text, lineTexts: [text], lines: 1, chars: text.replace(/\s/g, '').length, size: 10, boldShare: 0, ...extra });

test('detectFigures groups drawings and absorbs labels but not captions', () => {
  const bounds = [0, 0, 612, 792];
  const drawings = [
    { kind: 'fill', bbox: [100, 100, 200, 200], color: [0.2, 0.4, 0.8] },
    { kind: 'fill', bbox: [205, 100, 300, 200], color: [0.9, 0.5, 0.2] },
    { kind: 'stroke', bbox: [100, 202, 300, 202.5] },
    { kind: 'fill', bbox: [0, 0, 612, 792], color: [1, 1, 1] },
  ];
  const blocks = [
    block([110, 90, 150, 98], 'Encoder', { size: 7 }),
    block([100, 230, 300, 240], 'Figure 1: The pipeline.'),
    block([50, 400, 550, 500], 'A long paragraph of body text far away from the drawing.'),
  ];
  const figs = detectFigures({ bounds, drawings, blocks, body: 10 });
  assert.equal(figs.length, 1);
  assert.deepEqual(figs[0].members, [0]);
  assert.ok(figs[0].bbox[1] <= 90 && figs[0].bbox[3] >= 202, 'label and axis line joined');
});

test('a shaded text box is not a figure', () => {
  const bounds = [0, 0, 612, 792];
  const drawings = [{ kind: 'fill', bbox: [50, 100, 560, 260], color: [0.95, 0.95, 0.8] }];
  const long = 'This paragraph sits on a coloured background and carries ordinary sentences.';
  const blocks = [block([60, 110, 550, 250], long, { lines: 8, chars: 8 * 60, lineTexts: Array(8).fill(long) })];
  assert.equal(detectFigures({ bounds, drawings, blocks, body: 10 }).length, 0);
});

test('page numbers are dropped, running heads recognised', () => {
  const bounds = [0, 0, 612, 792];
  assert.equal(marginOf(block([300, 760, 310, 770], '12'), bounds), 'page-number');
  assert.equal(marginOf(block([200, 760, 410, 770], '- 3 -'), bounds), 'page-number');
  assert.equal(marginOf(block([100, 20, 500, 30], 'Journal of Examples, Vol. 2'), bounds), 'header');
  assert.equal(marginOf(block([100, 300, 500, 320], '12'), bounds), null);
});

test('headings by size and by bold', () => {
  assert.equal(headingLevel(block([0, 0, 1, 1], 'Title', { size: 20 }), 10), 1);
  assert.equal(headingLevel(block([0, 0, 1, 1], 'Section', { size: 13 }), 10), 2);
  assert.equal(headingLevel(block([0, 0, 1, 1], 'Methods', { boldShare: 1 }), 10), 3);
  assert.equal(headingLevel(block([0, 0, 1, 1], 'A normal sentence ends here.', { boldShare: 1 }), 10), 0);
});

test('layoutPage splits a bold heading line from its paragraph', () => {
  const line = (bbox, text, opts = {}) => ({ bbox, text, chars: text.replace(/\s/g, '').length, bold: 0, size: 10, sizes: [[10, text.length]], ...opts });
  const heading = line([50, 100, 120, 110], 'Results', { bold: 7 });
  const body = [line([50, 112, 500, 122], 'The method improves the score on every benchmark we tried so far.'), line([50, 124, 500, 134], 'Further analysis follows in the next section of this paper.')];
  const { items } = layoutPage({ bounds: [0, 0, 612, 792], drawings: [], blocks: [{ bbox: [50, 100, 500, 134], lines: [heading, ...body] }] });
  assert.equal(items[0].text, '### Results');
  assert.match(items[1].text, /^The method improves/);
});
