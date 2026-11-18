/**
 * layout.js — page geometry with no PDF dependency: figure regions, captions,
 * reading order and text assembly. Every function takes plain rectangles
 * ([x0, y0, x1, y1], y grows downwards) so it can be tested without MuPDF.
 */

export const area = (r) => Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]);
export const width = (r) => r[2] - r[0];
export const height = (r) => r[3] - r[1];
export const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
export const expand = (r, d) => [r[0] - d, r[1] - d, r[2] + d, r[3] + d];

export function intersects(a, b, pad = 0) {
  return a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];
}

export function intersection(a, b) {
  const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] > r[0] && r[3] > r[1] ? r : null;
}

/** Share of a's area that lies inside b. */
export function coverage(a, b) {
  const i = intersection(a, b);
  const aa = area(a);
  return i && aa > 0 ? area(i) / aa : 0;
}

/** Merge rectangles that touch within gap until no two merged boxes touch. */
export function mergeBoxes(boxes, gap) {
  let out = boxes.map((b) => [...b]);
  let changed = true;
  while (changed) {
    changed = false;
    out.sort((a, b) => a[1] - b[1]);
    const next = [];
    for (const box of out) {
      let merged = box;
      for (let i = next.length - 1; i >= 0; i--) {
        if (intersects(next[i], merged, gap)) {
          merged = union(next[i], merged);
          next.splice(i, 1);
          changed = true;
        }
      }
      next.push(merged);
    }
    out = next;
  }
  return out;
}

const CAPTION = /^\s*(fig(ure)?\.?|chart|scheme|plate|table|图|表)\s*[\dIVXLA-Z一二三四五六七八九十]/i;
const FIGURE_CAPTION = /^\s*(fig(ure)?\.?|chart|scheme|plate|图)\s*[\dIVXLA-Z一二三四五六七八九十]/i;

/** Body font size: the size carrying the most characters on the page. */
export function bodySize(blocks) {
  const weight = new Map();
  for (const b of blocks) {
    for (const line of b.lines ?? []) {
      for (const [size, n] of line.sizes ?? []) weight.set(size, (weight.get(size) ?? 0) + n);
    }
  }
  let best = 10;
  let bestN = -1;
  for (const [size, n] of weight) if (n > bestN) { best = size; bestN = n; }
  return best;
}

const headingish = (line, body) =>
  line.chars > 0 && line.chars <= 120 && (line.bold / line.chars >= 0.9 || line.size >= body * 1.15);

/** Summary of a run of lines: what layout reads from a text block. */
export function summarize(lines) {
  let bbox = lines[0].bbox;
  for (const l of lines) bbox = union(bbox, l.bbox);
  const chars = lines.reduce((n, l) => n + l.chars, 0);
  const bold = lines.reduce((n, l) => n + l.bold, 0);
  const lineTexts = lines.map((l) => l.text);
  return {
    bbox,
    lines: lines.length,
    lineTexts,
    text: lineTexts.join(' ').trim(),
    chars,
    size: Math.max(...lines.map((l) => l.size)),
    boldShare: chars ? bold / chars : 0,
  };
}

/**
 * Turn raw MuPDF blocks ({bbox, lines: [{bbox, text, chars, bold, size, sizes}]})
 * into layout blocks, splitting a heading line off the paragraph MuPDF glued
 * it to.
 */
export function normalizeBlocks(raw, body) {
  const out = [];
  for (const b of raw) {
    const lines = b.lines;
    if (!lines?.length) continue;
    let k = 0;
    while (k < lines.length && k < 3 && headingish(lines[k], body)) k++;
    if (k > 0 && k < lines.length && !headingish(lines[k], body)) {
      out.push(summarize(lines.slice(0, k)));
      out.push(summarize(lines.slice(k)));
    } else out.push(summarize(lines));
  }
  return out;
}

const PAGE_NUMBER = /^\s*(page\s*)?[-–—]?\s*([0-9]{1,4}|[ivxlcdm]{1,6})\s*[-–—]?(\s*(of|\/)\s*[0-9]+)?\s*$/i;

/** Blocks in the top or bottom margin: page numbers are dropped, running heads kept aside. */
export function marginOf(block, bounds) {
  const h = bounds[3] - bounds[1];
  if (PAGE_NUMBER.test(block.text) && (block.bbox[3] <= bounds[1] + 0.1 * h || block.bbox[1] >= bounds[3] - 0.1 * h)) {
    return 'page-number';
  }
  const top = block.bbox[3] <= bounds[1] + 0.07 * h;
  const bottom = block.bbox[1] >= bounds[3] - 0.07 * h;
  if ((!top && !bottom) || block.chars > 120) return null;
  return top ? 'header' : 'footer';
}

function isWhite(d) {
  const c = d.color;
  if (!Array.isArray(c) || c.length === 0) return false;
  if (c.length === 4) return c.every((v) => v <= 0.02);
  return c.every((v) => v >= 0.98);
}

/**
 * Find figure regions on one page.
 * @param page.bounds page rectangle
 * @param page.drawings [{kind: 'fill'|'stroke'|'image'|'shade', bbox, color?}]
 * @param page.blocks layout blocks from normalizeBlocks()
 * @param page.body body font size
 * @returns [{bbox, members: number[] (text block indexes inside the figure), hasImage}]
 */
export function detectFigures({ bounds, drawings, blocks, body = 10 }) {
  const pageArea = area(bounds);
  const strong = [];
  const weak = [];
  let hasImage = [];
  for (const d of drawings) {
    const r = intersection(d.bbox, bounds);
    if (!r) continue;
    if (area(r) > 0.9 * pageArea) continue; // page backgrounds and frames
    const thin = Math.min(width(r), height(r)) <= 1.5;
    if (d.kind === 'image') {
      if (width(r) >= 8 && height(r) >= 8) { strong.push(r); hasImage.push(r); }
      continue;
    }
    if (d.kind === 'fill' && isWhite(d)) continue;
    if (thin) weak.push(r);
    else strong.push(r);
  }

  let clusters = mergeBoxes(strong, 8);
  // Axis lines, tick marks and frames join the cluster they touch; a set of
  // lines alone (a table grid, an underline) never starts a figure.
  for (let pass = 0; pass < 2; pass++) {
    for (const w of weak) {
      for (let i = 0; i < clusters.length; i++) {
        if (intersects(clusters[i], w, 3)) clusters[i] = union(clusters[i], w);
      }
    }
    clusters = mergeBoxes(clusters, 2);
  }
  clusters = clusters.filter((c) => width(c) >= 24 && height(c) >= 24 && area(c) >= 0.004 * pageArea);

  const figures = [];
  for (const cluster of clusters) {
    const { bbox: c, members } = absorbLabels(cluster, blocks, body);
    const lines = members.reduce((n, i) => n + blocks[i].lines, 0);
    const chars = members.reduce((n, i) => n + blocks[i].chars, 0);
    const image = hasImage.some((r) => coverage(r, c) > 0.5);
    // Paragraph boxes, shaded tables and code listings are text, not figures.
    if (!image && lines >= 4 && chars / lines >= 45) continue;
    const textArea = members.reduce((n, i) => n + area(blocks[i].bbox), 0);
    if (!image && lines >= 6 && textArea > 0.5 * area(c)) continue;
    figures.push({ bbox: c, members, hasImage: image });
  }

  // Figures that grew into each other become one.
  const merged = [];
  for (const f of figures.sort((a, b) => a.bbox[1] - b.bbox[1])) {
    const hit = merged.find((m) => intersects(m.bbox, f.bbox, 1));
    if (hit) {
      hit.bbox = union(hit.bbox, f.bbox);
      hit.members = [...new Set([...hit.members, ...f.members])];
      hit.hasImage ||= f.hasImage;
    } else merged.push({ ...f });
  }
  return merged;
}

/**
 * Grow a figure region over the text that belongs to it: blocks mostly inside
 * the region, and short small-print labels (axis titles, legends) touching it.
 */
export function absorbLabels(region, blocks, body, exclude = new Set()) {
  let c = region;
  const members = [];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < blocks.length; i++) {
      if (members.includes(i) || exclude.has(i)) continue;
      const b = blocks[i];
      if (CAPTION.test(b.text)) continue;
      const inside = coverage(b.bbox, expand(c, 2)) >= 0.6;
      const label = b.chars <= 40 && b.lines <= 2 && b.size < body * 1.15 && intersects(b.bbox, c, 8);
      if (inside || label) members.push(i);
    }
    for (const i of members) c = union(c, blocks[i].bbox);
  }
  return { bbox: c, members };
}

/**
 * Sub-figures (a) and (b) placed side by side share one caption spanning both.
 * An uncaptioned figure next to a captioned one whose caption covers it joins
 * that figure, together with the "(a) (b)" labels between them.
 */
export function mergeSubfigures(figures, blocks, body, taken) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of figures) {
      if (f.caption === undefined) continue;
      const cap = blocks[f.caption].bbox;
      for (const g of figures) {
        if (g === f || g.caption !== undefined) continue;
        const overlapY = Math.min(f.bbox[3], g.bbox[3]) - Math.max(f.bbox[1], g.bbox[1]);
        const gapX = Math.max(g.bbox[0] - f.bbox[2], f.bbox[0] - g.bbox[2]);
        const covered = Math.min(cap[2], g.bbox[2]) - Math.max(cap[0], g.bbox[0]) >= 0.25 * width(g.bbox);
        if (overlapY < 0.5 * Math.min(height(f.bbox), height(g.bbox)) || gapX > 90 || !covered) continue;
        const others = new Set(taken);
        for (const i of [...f.members, ...g.members]) others.delete(i);
        const grown = absorbLabels(union(f.bbox, g.bbox), blocks, body, others);
        f.bbox = grown.bbox;
        f.members = [...new Set([...f.members, ...g.members, ...grown.members])];
        f.hasImage ||= g.hasImage;
        for (const i of f.members) taken.add(i);
        figures.splice(figures.indexOf(g), 1);
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return figures;
}

/** Attach "Figure 3: ..." blocks to the figure directly above or below them. */
export function attachCaptions(figures, blocks, taken) {
  for (let i = 0; i < blocks.length; i++) {
    if (taken.has(i)) continue;
    const b = blocks[i];
    if (!CAPTION.test(b.text)) continue;
    let best = null;
    let bestDist = Infinity;
    for (const f of figures) {
      const overlapX = Math.min(b.bbox[2], f.bbox[2]) - Math.max(b.bbox[0], f.bbox[0]);
      if (overlapX <= 0) continue;
      const below = b.bbox[1] - f.bbox[3];
      const above = f.bbox[1] - b.bbox[3];
      // Figure captions sit below; table captions sit above.
      const dist = FIGURE_CAPTION.test(b.text)
        ? (below >= -4 && below <= 40 ? below : above >= -4 && above <= 24 ? above + 20 : Infinity)
        : (above >= -4 && above <= 30 ? above : below >= -4 && below <= 30 ? below + 20 : Infinity);
      if (dist < bestDist && !f.caption) { best = f; bestDist = dist; }
    }
    if (best) { best.caption = i; taken.add(i); }
  }
}

function splitBy(units, axis, minGap) {
  const lo = axis;
  const hi = axis + 2;
  const sorted = [...units].sort((a, b) => a.bbox[lo] - b.bbox[lo]);
  const groups = [];
  let cur = [sorted[0]];
  let end = sorted[0].bbox[hi];
  for (const u of sorted.slice(1)) {
    if (u.bbox[lo] - end >= minGap) {
      groups.push(cur);
      cur = [u];
      end = u.bbox[hi];
    } else {
      cur.push(u);
      end = Math.max(end, u.bbox[hi]);
    }
  }
  groups.push(cur);
  return groups;
}

/**
 * Recursive XY-cut. Columns are tried before rows so a two-column page is
 * read column by column; a full-width title, figure or footer blocks the
 * column cut and is separated as its own row first.
 */
export function readingOrder(units) {
  if (units.length <= 1) return units;
  const cols = splitBy(units, 0, 3);
  if (cols.length > 1) return cols.flatMap(readingOrder);
  const rows = splitBy(units, 1, 0.5);
  if (rows.length === 1) return [...units].sort((a, b) => a.bbox[1] - b.bbox[1] || a.bbox[0] - b.bbox[0]);
  // A gap that happens to line up in both columns is not a row break:
  // consecutive rows whose union still splits into columns stay together.
  // Rows merge only when each side has content in at least two of the
  // columns their union splits into, so a full-width title stays a row.
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last) {
      const cols = splitBy([...last, ...row], 0, 3);
      const spread = (part) => cols.filter((col) => col.some((u) => part.includes(u))).length;
      if (cols.length > 1 && spread(last) >= 2 && spread(row) >= 2) {
        last.push(...row);
        continue;
      }
    }
    groups.push([...row]);
  }
  return groups.flatMap(readingOrder);
}

const CJK = /[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef\u3000-\u303f]/;

/** Join two text runs: no space between CJK characters or after a hyphenation dash. */
export function joinText(a, b) {
  if (!a) return b;
  if (!b) return a;
  const last = a[a.length - 1];
  const first = b[0];
  if (CJK.test(last) && CJK.test(first)) return a + b;
  if (/\s/.test(last) || /\s/.test(first)) return a + b;
  return a + ' ' + b;
}

/** Text of one block: flowing paragraph, or kept lines for short-line content. */
export function blockText(block) {
  const lines = block.lineTexts.map((l) => l.trim()).filter(Boolean);
  if (lines.length > 2 && block.chars / lines.length < 30) return lines.join('\n');
  return lines.reduce(joinText, '');
}

export function headingLevel(block, body) {
  if (block.lines > 3 || block.chars > 150 || block.chars < 2) return 0;
  if (block.size >= body * 1.6) return 1;
  if (block.size >= body * 1.25) return 2;
  if (block.boldShare >= 0.9 && block.chars <= 80 && block.lines <= 2 && !/[.。:：]$/.test(block.text.trim())) return 3;
  return 0;
}

/**
 * Lay out one page into reading-order items.
 * @param page {bounds, drawings, blocks: raw MuPDF blocks}
 * @returns {items: [{type: 'text', text, role?} | {type: 'figure', bbox, labels, caption?}], figures}
 */
export function layoutPage(page) {
  const body = bodySize(page.blocks);
  const blocks = normalizeBlocks(page.blocks, body);
  const figures = detectFigures({ bounds: page.bounds, drawings: page.drawings, blocks, body });
  const taken = new Set(figures.flatMap((f) => f.members));
  attachCaptions(figures, blocks, taken);
  mergeSubfigures(figures, blocks, body, taken);

  const units = [];
  const headers = [];
  const footers = [];
  for (let i = 0; i < blocks.length; i++) {
    if (taken.has(i) || !blocks[i].text) continue;
    const margin = marginOf(blocks[i], page.bounds);
    if (margin === 'page-number') continue;
    if (margin === 'header') { headers.push(i); continue; }
    if (margin === 'footer') { footers.push(i); continue; }
    units.push({ kind: 'text', index: i, bbox: blocks[i].bbox });
  }
  for (const f of figures) {
    const bbox = f.caption === undefined ? f.bbox : union(f.bbox, blocks[f.caption].bbox);
    units.push({ kind: 'figure', figure: f, bbox });
  }

  const ordered = [
    ...headers.map((i) => ({ kind: 'text', index: i, bbox: blocks[i].bbox, role: 'header' })),
    ...readingOrder(units),
    ...footers.map((i) => ({ kind: 'text', index: i, bbox: blocks[i].bbox, role: 'footer' })),
  ];
  const items = [];
  let prev = null;
  for (const u of ordered) {
    if (u.kind === 'figure') {
      const f = u.figure;
      const labels = readingOrder(f.members.map((i) => ({ index: i, bbox: blocks[i].bbox })))
        .map((m) => blockText(blocks[m.index]))
        .filter(Boolean)
        .join('\n');
      items.push({
        type: 'figure',
        bbox: f.bbox,
        labels,
        ...(f.caption === undefined ? {} : { caption: blockText(blocks[f.caption]) }),
      });
      prev = null;
      continue;
    }
    const b = blocks[u.index];
    const text = blockText(b);
    if (u.role) {
      items.push({ type: 'text', role: u.role, text });
      prev = null;
      continue;
    }
    const level = headingLevel(b, body);
    if (level) {
      // A title wrapped over two lines arrives as two blocks; keep it one heading.
      if (prev?.level === level && b.bbox[1] - prev.bbox[3] < b.size * 0.8) {
        prev.item.text = joinText(prev.item.text, text);
        prev.bbox = union(prev.bbox, b.bbox);
        continue;
      }
      const item = { type: 'text', role: 'heading', text: '#'.repeat(level) + ' ' + text };
      items.push(item);
      prev = { item, bbox: b.bbox, level };
      continue;
    }
    // Inline fragments on the same line (split formulas, superscripts) join
    // the run before them instead of becoming their own paragraphs.
    if (prev && !prev.level && sameLine(prev.bbox, b.bbox)) {
      prev.item.text = joinText(prev.item.text, text);
      prev.bbox = union(prev.bbox, b.bbox);
      continue;
    }
    const item = { type: 'text', text };
    items.push(item);
    prev = { item, bbox: b.bbox, level: 0 };
  }
  return { items, figures: figures.length };
}

function sameLine(a, b) {
  const overlap = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const h = Math.min(height(a), height(b));
  return h > 0 && overlap >= 0.5 * h && b[0] - a[2] < 15 && b[0] >= a[0];
}
