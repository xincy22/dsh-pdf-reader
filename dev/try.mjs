// dev/try.mjs — run the engine on a PDF and dump markdown + figure PNGs.
// usage: node dev/try.mjs <pdf> [pages] [outdir]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readPdf } from '../src/engine.js';

const [file, pages, outdir = '/tmp/pdf-try'] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const t0 = Date.now();
const res = readPdf(readFileSync(file), { pages, dpi: 150, withImages: true });
const ms = Date.now() - t0;
let md = '';
for (const p of res.pages) {
  md += '\n=== page ' + p.page + (p.scanned ? ' (scanned)' : '') + ' ===\n';
  for (const it of p.items) {
    if (it.type === 'figure') {
      const f = path.join(outdir, it.name + '.png');
      if (it.png) writeFileSync(f, it.png);
      md += '\n[FIGURE ' + it.name + ' bbox=' + it.bbox.map(Math.round).join(',') + (it.png ? ' ' + it.width + 'x' + it.height : '') + ']\n';
      if (it.labels) md += '  [labels] ' + it.labels.replace(/\n/g, ' | ').slice(0, 160) + '\n';
      if (it.caption) md += '  [caption] ' + it.caption.slice(0, 200) + '\n';
    } else md += '\n' + it.text.slice(0, 300) + '\n';
  }
}
console.log('pageCount', res.pageCount, 'read', res.pagesRead, 'ms', ms, 'outline', res.outline.length, 'title', res.title);
console.log(md);
