import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPdf } from '../src/engine.js';
import { makePdf, paperPage, para } from './fixture.js';

const texts = (page) => page.items.filter((i) => i.type === 'text').map((i) => i.text);

test('a two-column page reads in order with the figure in place', () => {
  const r = readPdf(makePdf([paperPage()]), { dpi: 72, withImages: true });
  const items = r.pages[0].items;
  const order = items.map((i) => (i.type === 'figure' ? 'FIG' : i.text.split(' ')[0]));
  assert.deepEqual(order, ['#', '###', 'LEFTSTART', 'LEFTSECOND', 'FIG', 'RIGHTSTART']);
  const fig = items.find((i) => i.type === 'figure');
  assert.equal(fig.caption, 'Figure 1: The pipeline of the model.');
  assert.equal(fig.labels, 'Encoder Decoder');
  assert.ok(fig.png instanceof Uint8Array && fig.png[1] === 0x50, 'figure rendered as PNG');
  assert.ok(!texts(r.pages[0]).some((t) => t === '7'), 'page number dropped');
});

test('withImages false keeps figures as items without rendering', () => {
  const r = readPdf(makePdf([paperPage()]), { dpi: 72, withImages: false });
  const fig = r.pages[0].items.find((i) => i.type === 'figure');
  assert.ok(fig && fig.png === undefined);
});

test('page selection and page count', () => {
  const pages = Array.from({ length: 4 }, (_, i) => ({ text: para(60, 100, 'PAGE' + (i + 1) + ' body text that is comfortably long for a block') }));
  const r = readPdf(makePdf(pages), { pages: '2,4', dpi: 72, withImages: false });
  assert.equal(r.pageCount, 4);
  assert.equal(r.pagesRead, '2,4');
  assert.deepEqual(r.pages.map((p) => p.page), [2, 4]);
  assert.match(texts(r.pages[1])[0], /^PAGE4/);
});

test('encrypted PDFs need the password', () => {
  const bytes = makePdf([paperPage()], { password: 'secret' });
  assert.throws(() => readPdf(bytes, { dpi: 72, withImages: false }), /encrypted/);
  assert.throws(() => readPdf(bytes, { dpi: 72, withImages: false, password: 'nope' }), /password does not open/);
  assert.equal(readPdf(bytes, { dpi: 72, withImages: false, password: 'secret' }).pageCount, 1);
});

test('garbage is reported as an unreadable PDF', () => {
  assert.throws(() => readPdf(new TextEncoder().encode('not a pdf'), { dpi: 72, withImages: false }), /cannot open PDF/);
});
