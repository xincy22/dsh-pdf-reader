/**
 * content.js — turn engine pages into the tool's canonical value and the
 * model-facing content blocks. No Harness or MuPDF dependency.
 */

/** Figure marker used in the plain-text rendering and when images are off. */
export function figureMarker(fig, page) {
  return '[Figure ' + fig.name + ' on page ' + page + ']';
}

/**
 * Build the canonical value: reading-order blocks with figures as
 * attachment references, plus a plain-text version with figure markers.
 * @param result engine result
 * @param attach async (figure, page) => attachment ref | null, called in order
 * @param notes extra notes appended to the text (e.g. images disabled)
 */
export async function buildValue(result, attach, notes = []) {
  const blocks = [];
  const plain = [];
  let imageCount = 0;
  let figureCount = 0;
  const skipped = [];

  const text = (t) => {
    const last = blocks[blocks.length - 1];
    if (last?.type === 'text') last.text += '\n\n' + t;
    else blocks.push({ type: 'text', text: t });
  };

  if (result.title || result.outline?.length) {
    const head = [];
    if (result.title) head.push('Title: ' + result.title);
    head.push('Pages: ' + result.pageCount);
    if (result.outline?.length) {
      head.push('Outline:');
      for (const o of result.outline) head.push('  '.repeat(o.depth) + '- ' + o.title + (o.page ? ' (p. ' + o.page + ')' : ''));
    }
    text(head.join('\n'));
    plain.push(head.join('\n'));
  }

  for (const p of result.pages) {
    const heading = '--- page ' + p.page + (p.scanned ? ' (scanned, no text layer)' : '') + ' ---';
    text(heading);
    plain.push(heading);
    for (const it of p.items) {
      if (it.type === 'text') {
        const t = it.role === 'header' || it.role === 'footer' ? '_' + it.text + '_' : it.text;
        text(t);
        plain.push(t);
        continue;
      }
      figureCount++;
      const marker = figureMarker(it, p.page);
      const ref = it.png ? await attach(it, p.page) : null;
      if (ref) {
        text(marker);
        blocks.push({ type: 'image', attachment: ref });
        imageCount++;
      } else {
        text(marker + (it.png ? ' (not attached: image limit reached)' : ''));
        if (it.png) skipped.push(it.name);
      }
      plain.push(marker);
      if (it.labels) {
        const t = '[Text inside ' + it.name + ']\n' + it.labels;
        text(t);
        plain.push(t);
      }
      if (it.caption) {
        text(it.caption);
        plain.push(it.caption);
      }
    }
  }
  if (result.warnings?.length) notes = [...notes, 'The PDF engine reported: ' + result.warnings.join('; ') + '.'];
  if (skipped.length) notes = [...notes, 'Figures not attached because of the per-call image limit: ' + skipped.join(', ') + '. Read their pages again to see them.'];
  if (notes.length) {
    text('Note: ' + notes.join(' '));
    plain.push('Note: ' + notes.join(' '));
  }
  return {
    pageCount: result.pageCount,
    pagesRead: result.pagesRead,
    figureCount,
    imageCount,
    text: plain.join('\n\n'),
    blocks,
  };
}

/** Content blocks for the model, in reading order. */
export function renderValue(value) {
  const out = [];
  for (const b of value.blocks ?? []) {
    if (b.type === 'text' && b.text) out.push({ type: 'text', text: b.text });
    else if (b.type === 'image' && b.attachment) out.push({ type: 'image', attachment: b.attachment });
  }
  if (!out.length) out.push({ type: 'text', text: value.text || '(no text on these pages)' });
  return out;
}
