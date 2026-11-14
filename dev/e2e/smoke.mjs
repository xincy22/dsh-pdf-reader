/**
 * 端到端检查：不启动 DSH，用一个假的 ctx 直接加载插件。
 *
 * 这个脚本是 dev/ 里最早那两个 e2e 脚本的可移植版本 —— 原来它们把插件路径写死在
 * C:\Users\xincy\.dsh\plugins\dsh-pdf-reader，换个机器或换个目录就跑不动。
 * 现在按 import.meta.url 反推仓库根，任何 checkout 位置都能用。
 *
 * 跑法：node dev/e2e/smoke.mjs <某个PDF>      不传 PDF 时只做注册检查
 */
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const entry = pathToFileURL(path.join(repoRoot, 'src', 'index.js')).href;

let registered = null;
const saved = [];
const ctx = {
  tools: { register: (t) => { registered = t; return () => {}; } },
  get: (n) => (n === 'attachments' ? {
    saveImage: async ({ data, mediaType, name }) => {
      saved.push({ name, kb: Math.round(data.length / 1024), mediaType });
      return { attachmentId: 'mock-' + name, name };
    },
  } : undefined),
  logger: { error() {}, warn() {} },
};

const mod = await import(entry);
mod.apply(ctx);

if (!registered) {
  console.error('FAIL: apply() 没有注册任何工具');
  process.exit(1);
}
console.log('registered: ' + registered.name);
console.log('parameters: ' + Object.keys(registered.parameters.properties).join(', '));

const pdf = process.argv[2];
if (!pdf) {
  console.log('(no PDF given; registration check only)');
  process.exit(0);
}
if (!existsSync(pdf)) {
  console.error('FAIL: PDF not found: ' + pdf);
  process.exit(1);
}

const t0 = Date.now();
const res = await registered.execute({ path: pdf, pages: '5,16', withImages: true });
console.log('execute: blocks=' + res.blocks.length + ' imageCount=' + res.imageCount
  + ' pageCount=' + res.pageCount + ' pages=' + res.pagesRead + ' ms=' + (Date.now() - t0));

const blocks = registered.output.render({}, res);
console.log('render: ' + blocks.length + ' blocks, attachments saved=' + saved.length);
for (let i = 0; i < blocks.length; i += 1) {
  const b = blocks[i];
  if (b.type === 'image') console.log('  [' + i + '] IMAGE ' + (b.attachment?.name ?? '?'));
  else console.log('  [' + i + '] TEXT  ' + JSON.stringify(String(b.text || '').replace(/\n/g, ' ').slice(0, 72)));
}

if (res.imageCount > 0 && saved.length === 0) {
  console.error('FAIL: 报告有图，但一张也没提交给 attachments');
  process.exit(1);
}
