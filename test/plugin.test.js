import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertSupportedJsonSchema } from './schema-subset.js';
import * as plugin from '../src/index.js';
import { makePdf, paperPage } from './fixture.js';


function harness({ attachments = true, imageModel = true, limits = {}, config = {}, resolveModelInfo } = {}) {
  const saved = [];
  let tool;
  let disposed = false;
  const services = {
    attachments: attachments && {
      imageLimits: { maxImagesPerMessage: 20, maxMessageImageBytes: 50e6, maxImageBytes: 10e6, maxImagePixels: 16e6, maxImageDimension: 4096, ...limits },
      async saveImage({ data, mediaType, name }) {
        saved.push({ name, mediaType, bytes: data.byteLength });
        return { attachmentId: 'att-' + saved.length, mediaType, bytes: data.byteLength, width: 1, height: 1 };
      },
      isAttachmentError: () => false,
    },
    llm: {
      resolveModelInfo: resolveModelInfo ?? (async () => ({ inputModalities: imageModel ? ['text', 'image'] : ['text'] })),
    },
  };
  const ctx = {
    tools: { register(def) { tool = def; return () => { disposed = true; }; } },
    get: (name) => services[name] || undefined,
  };
  const dispose = plugin.apply(ctx, config);
  const exec = { signal: new AbortController().signal, agent: { options: { provider: 'p', model: 'm' }, session: { requestHeader: () => undefined } } };
  return { tool, saved, exec, dispose: () => { dispose(); return disposed; } };
}

function tempPdf(pages) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdf-reader-test-'));
  const file = path.join(dir, 'paper.pdf');
  writeFileSync(file, makePdf(pages));
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('registers pdf_read with schemas the Harness accepts', () => {
  const h = harness();
  assert.equal(plugin.name, 'dsh-pdf-reader');
  assert.equal(h.tool.name, 'pdf_read');
  assertSupportedJsonSchema(h.tool.parameters);
  assertSupportedJsonSchema(h.tool.output.schema);
  assert.equal(h.dispose(), true);
});

test('execute returns figures as attachments in reading order', async () => {
  const h = harness();
  const pdf = tempPdf([paperPage()]);
  try {
    const value = await h.tool.execute({ path: pdf.file }, h.exec);
    assert.equal(value.pageCount, 1);
    assert.equal(value.figureCount, 1);
    assert.equal(value.imageCount, 1);
    assert.equal(h.saved.length, 1);
    assert.equal(h.saved[0].mediaType, 'image/png');
    const content = h.tool.output.render({}, value);
    const kinds = content.map((b) => b.type);
    assert.deepEqual(kinds, ['text', 'image', 'text']);
    assert.match(content[0].text, /LEFTSECOND[\s\S]*\[Figure p1-fig1 on page 1\]$/);
    assert.match(content[2].text, /^\[Text inside p1-fig1\]\nEncoder Decoder\n\nFigure 1: The pipeline of the model\.\n\nRIGHTSTART/);
    assert.match(value.text, /\[Figure p1-fig1 on page 1\]/);
  } finally {
    pdf.cleanup();
    h.dispose();
  }
});

test('text-only models get no images but keep figure text', async () => {
  const h = harness({ imageModel: false });
  const pdf = tempPdf([paperPage()]);
  try {
    const value = await h.tool.execute({ path: pdf.file }, h.exec);
    assert.equal(value.imageCount, 0);
    assert.equal(h.saved.length, 0);
    assert.match(value.text, /does not accept images/);
    assert.match(value.text, /Encoder Decoder/);
  } finally {
    pdf.cleanup();
    h.dispose();
  }
});

test('the per-message image limit caps attachments', async () => {
  const h = harness({ limits: { maxImagesPerMessage: 1 } });
  const pdf = tempPdf([paperPage(), paperPage()]);
  try {
    const value = await h.tool.execute({ path: pdf.file, pages: '1-2' }, h.exec);
    assert.equal(value.figureCount, 2);
    assert.equal(value.imageCount, 1);
    assert.match(value.text, /not attached because of the per-call image limit: p2-fig1/);
  } finally {
    pdf.cleanup();
    h.dispose();
  }
});

test('missing files and bad pages fail with a clear message', async () => {
  const h = harness();
  const pdf = tempPdf([paperPage()]);
  try {
    await assert.rejects(h.tool.execute({ path: '/no/such/file.pdf' }, h.exec), /PDF not found/);
    await assert.rejects(h.tool.execute({ path: pdf.file, pages: '3' }, h.exec), /outside 1-1/);
  } finally {
    pdf.cleanup();
    h.dispose();
  }
});

test('cancellation stops the read', async () => {
  const h = harness();
  const pdf = tempPdf([paperPage()]);
  try {
    const ac = new AbortController();
    ac.abort(new Error('stopped by user'));
    await assert.rejects(h.tool.execute({ path: pdf.file }, { ...h.exec, signal: ac.signal }), /stopped by user/);
    const value = await h.tool.execute({ path: pdf.file, withImages: false }, h.exec);
    assert.equal(value.pageCount, 1, 'reader recovers after a cancelled call');
  } finally {
    pdf.cleanup();
    h.dispose();
  }
});

test('volatile config refs update dpi and maxImages between execute calls', async () => {
  let liveDpi = 72;
  let liveMaxImages = 2;
  const h = harness({
    config: {
      dpi: { get: () => liveDpi },
      maxImages: { get: () => liveMaxImages },
    },
  });
  const pdf = tempPdf([paperPage(), paperPage()]);
  try {
    const first = await h.tool.execute({ path: pdf.file, pages: '1-2' }, h.exec);
    assert.equal(first.figureCount, 2);
    assert.equal(first.imageCount, 2);
    const lowDpiBytes = h.saved[0].bytes;

    liveDpi = 300;
    liveMaxImages = 1;

    const second = await h.tool.execute({ path: pdf.file, pages: '1-2' }, h.exec);
    assert.equal(second.figureCount, 2);
    assert.equal(second.imageCount, 1);
    const highDpiBytes = h.saved[2].bytes;
    assert.ok(highDpiBytes > lowDpiBytes, `expected 300 DPI PNG (${highDpiBytes} B) > 72 DPI PNG (${lowDpiBytes} B)`);
  } finally {
    pdf.cleanup();
    h.dispose();
  }
});

test('Config schema normalizes defaults and exposes volatile metadata when schemastery is present', () => {
  assert.equal(typeof plugin.Config, 'function');
  const readVal = (v) => (v && typeof v === 'object' && typeof v.get === 'function' ? v.get() : v);

  const defaults = plugin.Config({});
  assert.equal(readVal(defaults.dpi), 150);
  assert.equal(readVal(defaults.maxImages), 20);

  const custom = plugin.Config({ dpi: 200, maxImages: 5 });
  assert.equal(readVal(custom.dpi), 200);
  assert.equal(readVal(custom.maxImages), 5);

  if (typeof plugin.Config.toJSON === 'function') {
    const json = plugin.Config.toJSON();
    const rootDict = json.refs[json.uid].dict;
    const dpiNode = json.refs[rootDict.dpi];
    const maxImagesNode = json.refs[rootDict.maxImages];
    assert.equal(dpiNode.meta.volatile, true);
    assert.equal(dpiNode.meta.min, 72);
    assert.equal(dpiNode.meta.max, 300);
    assert.equal(dpiNode.meta.default, 150);
    assert.equal(dpiNode.meta.step, 1);
    assert.equal(maxImagesNode.meta.volatile, true);
    assert.equal(maxImagesNode.meta.min, 0);
    assert.equal(maxImagesNode.meta.max, 100);
    assert.equal(maxImagesNode.meta.default, 20);
    assert.equal(maxImagesNode.meta.step, 1);
  }
});

test('agent.model.current() takes priority over stale requestHeader and agent.options', async () => {
  const resolvedCalls = [];
  const h = harness({
    resolveModelInfo: async (provider, model) => {
      resolvedCalls.push({ provider, model });
      return { inputModalities: model === 'vision-model' ? ['text', 'image'] : ['text'] };
    },
  });
  const pdf = tempPdf([paperPage()]);
  try {
    const execTextCurrent = {
      signal: new AbortController().signal,
      agent: {
        model: { current: () => ({ provider: 'p-cur', model: 'text-only-model' }) },
        options: { provider: 'p-opt', model: 'vision-model' },
        session: { requestHeader: () => ({ config: { provider: 'p-hdr', model: 'vision-model' } }) },
      },
    };
    const r1 = await h.tool.execute({ path: pdf.file }, execTextCurrent);
    assert.equal(r1.imageCount, 0);
    assert.deepEqual(resolvedCalls[0], { provider: 'p-cur', model: 'text-only-model' });

    const execVisionCurrent = {
      signal: new AbortController().signal,
      agent: {
        model: { current: () => ({ provider: 'p-cur', model: 'vision-model' }) },
        options: { provider: 'p-opt', model: 'text-only-model' },
        session: { requestHeader: () => ({ config: { provider: 'p-hdr', model: 'text-only-model' } }) },
      },
    };
    const r2 = await h.tool.execute({ path: pdf.file }, execVisionCurrent);
    assert.equal(r2.imageCount, 1);
    assert.deepEqual(resolvedCalls[1], { provider: 'p-cur', model: 'vision-model' });
  } finally {
    pdf.cleanup();
    h.dispose();
  }
});
