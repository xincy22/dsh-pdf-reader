/**
 * engine.js — read PDF pages with MuPDF (WebAssembly) into reading-order items.
 * Runs inside the worker; nothing here touches the Harness.
 */

import * as mupdf from 'mupdf';
import { layoutPage, area, intersection, expand } from './layout.js';
import { parsePages, formatPages } from './pages.js';

/** MuPDF warnings for the current read, surfaced to the model instead of stderr. */
let warnings = null;
mupdf.setLog({
  error(message) { warnings?.add(String(message).trim()); },
  warning(message) { warnings?.add(String(message).trim()); },
});

const STROKE = new mupdf.StrokeState({ lineCap: 'Butt', lineJoin: 'Miter', lineWidth: 1, miterLimit: 10 });
const UNIT = [0, 0, 1, 1];

/** Collect the bounding box of everything the page paints, honouring clips. */
function collectDrawings(page) {
  const drawings = [];
  const clips = [];
  let maskDepth = 0;
  let tileDepth = 0;
  const visible = (r) => {
    if (maskDepth || tileDepth) return null;
    let out = r;
    for (const c of clips) {
      out = intersection(out, c);
      if (!out) return null;
    }
    return out;
  };
  const push = (kind, r, color) => {
    const v = r && visible(r);
    if (v) drawings.push({ kind, bbox: v, color });
  };
  const clip = (r) => clips.push(r ?? [-1e9, -1e9, 1e9, 1e9]);
  const device = new mupdf.Device({
    fillPath(path, evenOdd, ctm, cs, color) { push('fill', path.getBounds(STROKE, ctm), color); },
    strokePath(path, stroke, ctm, cs, color) { push('stroke', path.getBounds(stroke, ctm), color); },
    fillShade(shade, ctm) { push('shade', mupdf.Rect.transform(shade.getBounds(), ctm)); },
    fillImage(image, ctm) { push('image', mupdf.Rect.transform(UNIT, ctm)); },
    fillImageMask(image, ctm, cs, color) { push('image', mupdf.Rect.transform(UNIT, ctm), color); },
    clipPath(path, evenOdd, ctm) { clip(path.getBounds(STROKE, ctm)); },
    clipStrokePath(path, stroke, ctm) { clip(path.getBounds(stroke, ctm)); },
    clipText(text, ctm) { clip(text.getBounds(STROKE, ctm)); },
    clipStrokeText(text, stroke, ctm) { clip(text.getBounds(stroke, ctm)); },
    clipImageMask(image, ctm) { clip(mupdf.Rect.transform(UNIT, ctm)); },
    popClip() { clips.pop(); },
    beginMask() { maskDepth++; },
    endMask() { maskDepth--; clip(null); },
    beginTile(area) { if (!maskDepth && !tileDepth) push('fill', area); tileDepth++; return 0; },
    endTile() { tileDepth--; },
  });
  try {
    page.run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  return drawings;
}

/** Text blocks with the per-line strings and font statistics layout needs. */
function collectText(page) {
  const blocks = [];
  let block = null;
  let line = null;
  const st = page.toStructuredText('dehyphenate,clip');
  try {
    st.walk({
      beginTextBlock(bbox) { block = { bbox: [...bbox], lines: [] }; },
      beginLine(bbox) { line = { bbox: [...bbox], text: '', chars: 0, bold: 0, size: 0, sizes: new Map() }; },
      onChar(c, origin, font, size) {
        line.text += c;
        if (/\s/.test(c)) return;
        line.chars++;
        line.size = Math.max(line.size, size);
        const key = Math.round(size * 2) / 2;
        line.sizes.set(key, (line.sizes.get(key) ?? 0) + 1);
        if (font.isBold() || /bold|black|heavy|semibold|medi/i.test(font.getName())) line.bold++;
      },
      endLine() {
        line.sizes = [...line.sizes];
        if (line.text.trim()) block.lines.push(line);
      },
      endTextBlock() {
        if (block.lines.length) blocks.push(block);
        block = null;
      },
    });
  } finally {
    st.destroy?.();
  }
  return blocks;
}

/** Render a page region to PNG within the attachment size limits. */
function renderRegion(page, rect, dpi, limits) {
  let scale = dpi / 72;
  const w = rect[2] - rect[0];
  const h = rect[3] - rect[1];
  const maxDim = limits?.maxImageDimension ?? 4096;
  const maxPixels = limits?.maxImagePixels ?? 16_000_000;
  scale = Math.min(scale, maxDim / w, maxDim / h, Math.sqrt(maxPixels / (w * h)));
  const box = [Math.floor(rect[0] * scale), Math.floor(rect[1] * scale), Math.ceil(rect[2] * scale), Math.ceil(rect[3] * scale)];
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, box, false);
  try {
    pix.clear(255);
    const matrix = mupdf.Matrix.scale(scale, scale);
    const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
    try { page.run(dev, matrix); } finally { dev.close(); }
    let png = pix.asPNG();
    // A huge flat figure can still exceed the byte cap; halve until it fits.
    const maxBytes = limits?.maxImageBytes ?? 5 * 1024 * 1024;
    if (png.byteLength > maxBytes && scale > 0.5) {
      return renderRegion(page, rect, (scale * 72) / 2, limits);
    }
    return { png, width: pix.getWidth(), height: pix.getHeight() };
  } finally {
    pix.destroy?.();
  }
}

function outlineEntries(doc, max = 80) {
  let outline;
  try { outline = doc.loadOutline(); } catch { return []; }
  const out = [];
  const visit = (items, depth) => {
    for (const it of items ?? []) {
      if (out.length >= max) return;
      const page = typeof it.page === 'number' ? it.page + 1 : undefined;
      if (it.title) out.push({ depth, title: it.title.trim(), page });
      if (depth < 2) visit(it.down, depth + 1);
    }
  };
  visit(outline, 0);
  return out;
}

/**
 * Read pages of one PDF.
 * @param {Uint8Array} bytes PDF content
 * @param {{pages?: string, dpi: number, withImages: boolean, limits?: object, password?: string}} opts
 */
export function readPdf(bytes, opts) {
  warnings = new Set();
  try {
    return readPdfInner(bytes, opts);
  } finally {
    warnings = null;
  }
}

function readPdfInner(bytes, opts) {
  let doc;
  try {
    doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  } catch (e) {
    throw new Error('cannot open PDF: ' + (e?.message ?? e));
  }
  try {
    if (doc.needsPassword()) {
      if (!opts.password || !doc.authenticatePassword(opts.password)) {
        throw new Error(opts.password ? 'the password does not open this PDF' : 'this PDF is encrypted; pass its password');
      }
    }
    const pageCount = doc.countPages();
    const list = parsePages(opts.pages, pageCount);
    const title = (doc.getMetaData?.('info:Title') ?? '').trim();
    const pages = [];
    for (const n of list) pages.push(readPage(doc.loadPage(n - 1), n, opts));
    return {
      pageCount,
      pagesRead: formatPages(list),
      title: list.includes(1) ? title : '',
      outline: list.includes(1) || opts.pages === undefined ? outlineEntries(doc) : [],
      pages,
      warnings: [...warnings].filter((w) => w && !/deprecated/i.test(w)).slice(0, 5),
    };
  } finally {
    doc.destroy?.();
  }
}

function readPage(page, number, opts) {
  try {
    const bounds = page.getBounds();
    const blocks = collectText(page);
    const drawings = collectDrawings(page);
    const chars = blocks.reduce((n, b) => n + b.lines.reduce((m, l) => m + l.chars, 0), 0);
    const imageArea = drawings.filter((d) => d.kind === 'image').reduce((n, d) => n + area(intersection(d.bbox, bounds) ?? [0, 0, 0, 0]), 0);

    // A page that is a picture with (almost) no text layer is a scan or a
    // full-page figure: hand the whole page over as one image.
    if (chars < 30 && imageArea >= 0.5 * area(bounds)) {
      const item = { type: 'figure', bbox: bounds, labels: blocks.map((b) => b.lines.map((l) => l.text.trim()).join(' ')).join('\n'), scanned: true };
      return finish(page, number, [item], opts, true);
    }
    const { items } = layoutPage({ bounds, drawings, blocks });
    return finish(page, number, items, opts, false);
  } finally {
    page.destroy?.();
  }
}

function finish(page, number, items, opts, scanned) {
  const bounds = page.getBounds();
  let k = 0;
  for (const it of items) {
    if (it.type !== 'figure') continue;
    k++;
    it.name = 'p' + number + '-fig' + k;
    if (!opts.withImages) continue;
    const rect = intersection(expand(it.bbox, 4), bounds) ?? bounds;
    const dpi = it.scanned ? Math.min(opts.dpi, 150) : opts.dpi;
    Object.assign(it, renderRegion(page, rect, dpi, opts.limits));
  }
  return { page: number, scanned, items };
}
