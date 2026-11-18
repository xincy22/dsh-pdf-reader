/**
 * Build small PDFs in memory with MuPDF, so tests need no binary fixtures.
 */
import * as mupdf from 'mupdf';

const esc = (s) => s.replace(/[\\()]/g, (c) => '\\' + c);

/**
 * @param pages [{text: [{x, y, size?, bold?, s}], rects?: [{x, y, w, h, rgb?}], lines?: [{x1,y1,x2,y2}]}]
 *   coordinates are top-left based (y down) on a 612x792 page
 */
export function makePdf(pages, { password } = {}) {
  const doc = new mupdf.PDFDocument();
  const regular = doc.addSimpleFont(new mupdf.Font('Helvetica'));
  const bold = doc.addSimpleFont(new mupdf.Font('Helvetica-Bold'));
  const resources = doc.addObject({ Font: { F1: regular, F2: bold } });
  for (const p of pages) {
    let c = '';
    for (const r of p.rects ?? []) {
      const [R, G, B] = r.rgb ?? [0.2, 0.4, 0.8];
      c += R + ' ' + G + ' ' + B + ' rg ' + r.x + ' ' + (792 - r.y - r.h) + ' ' + r.w + ' ' + r.h + ' re f\n';
    }
    for (const l of p.lines ?? []) c += '0 0 0 RG 0.5 w ' + l.x1 + ' ' + (792 - l.y1) + ' m ' + l.x2 + ' ' + (792 - l.y2) + ' l S\n';
    c += '0 0 0 rg\n';
    for (const t of p.text ?? []) {
      c += 'BT /' + (t.bold ? 'F2' : 'F1') + ' ' + (t.size ?? 10) + ' Tf ' + t.x + ' ' + (792 - t.y) + ' Td (' + esc(t.s) + ') Tj ET\n';
    }
    doc.insertPage(-1, doc.addPage([0, 0, 612, 792], 0, resources, c));
  }
  const opts = password ? 'encrypt=aes-256,user-password=' + password + ',owner-password=' + password : '';
  return new Uint8Array(doc.saveToBuffer(opts).asUint8Array());
}

/** Wrap a paragraph into lines of about n characters. */
export function lines(text, n = 48) {
  const words = text.split(' ');
  const out = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > n) { out.push(cur.trim()); cur = w; } else cur += ' ' + w;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** A paragraph as text runs starting at (x, y). */
export function para(x, y, text, size = 10, n = 48) {
  return lines(text, n).map((s, i) => ({ x, y: y + i * (size * 1.25), size, s }));
}

const LOREM = 'The quick brown fox jumps over the lazy dog while the model reads every page in order and checks each figure against the text around it';

/** Two-column paper page: title, left column, figure with caption in the right column, page number. */
export function paperPage() {
  return {
    text: [
      { x: 150, y: 70, size: 18, bold: true, s: 'A Study of Reading Order' },
      { x: 54, y: 110, size: 11, bold: true, s: 'Introduction' },
      ...para(54, 128, 'LEFTSTART ' + LOREM + ' LEFTEND'),
      ...para(54, 260, 'LEFTSECOND ' + LOREM),
      { x: 340, y: 128, size: 7, s: 'Encoder' },
      { x: 470, y: 128, size: 7, s: 'Decoder' },
      { x: 330, y: 262, size: 9, s: 'Figure 1: The pipeline of the model.' },
      ...para(330, 290, 'RIGHTSTART ' + LOREM + ' RIGHTEND'),
      { x: 300, y: 760, size: 9, s: '7' },
    ],
    rects: [
      { x: 330, y: 135, w: 90, h: 100 },
      { x: 460, y: 135, w: 90, h: 100, rgb: [0.9, 0.5, 0.2] },
      { x: 420, y: 180, w: 40, h: 6, rgb: [0, 0, 0] },
    ],
  };
}
