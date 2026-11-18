/**
 * pages.js — the "pages" argument: "5", "5,16", "5-9", "12-" (to the end).
 */

export const DEFAULT_PAGES = 5;
export const MAX_PAGES = 20;

/**
 * @param {string | undefined} spec page expression, 1-based
 * @param {number} pageCount pages in the document
 * @returns {number[]} distinct 1-based pages in the requested order
 */
export function parsePages(spec, pageCount) {
  if (spec === undefined || spec === null || String(spec).trim() === '') {
    return Array.from({ length: Math.min(pageCount, DEFAULT_PAGES) }, (_, i) => i + 1);
  }
  const out = [];
  for (const raw of String(spec).split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(part);
    if (!m) throw new Error('bad pages expression "' + spec + '": use "5", "5,16", "5-9" or "12-"');
    const lo = Number(m[1]);
    const hi = m[2] === undefined ? lo : m[2] === '' ? pageCount : Number(m[2]);
    if (lo < 1 || hi > pageCount || lo > hi) {
      throw new Error('pages "' + part + '" is outside 1-' + pageCount + ' (the document has ' + pageCount + ' pages)');
    }
    for (let p = lo; p <= hi; p++) if (!out.includes(p)) out.push(p);
  }
  if (out.length === 0) throw new Error('pages "' + spec + '" selects no page');
  if (out.length > MAX_PAGES) {
    throw new Error('pages "' + spec + '" selects ' + out.length + ' pages; read at most ' + MAX_PAGES + ' per call');
  }
  return out;
}

/** Compact form of a page list: [1,2,3,7] -> "1-3,7". */
export function formatPages(list) {
  const parts = [];
  for (let i = 0; i < list.length; i++) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j++;
    parts.push(j > i ? list[i] + '-' + list[j] : String(list[i]));
    i = j;
  }
  return parts.join(',');
}
