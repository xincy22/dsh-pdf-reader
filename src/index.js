/**
 * index.js — dsh-pdf-reader 插件入口。只注册一个工具 pdf_read。
 *
 * 底子是 pymupdf4llm（PyMuPDF 官方 LLM 扩展）：找图、裁图、读图内文字，一次调用全给。
 *
 * ## schema 为什么是「原始 JSON Schema」而不是作者写法
 *
 * 宿主 ToolsService.register() 会对 output.schema 跑 assertSupportedJsonSchema()，
 * 并且只认一个很窄的子集：type / oneOf / properties / required(数组) / additionalProperties
 * / items / enum / const / description / title / default / examples。
 *
 * 把 `required: true` 写在属性里、或写 `type: 'json'`，都会被直接 throw，
 * 而 apply() 抛出的异常会被加载器吞掉 —— 表现就是「插件装了、bundles 也在、工具永远不出现」。
 * 所以这里全部写宿主认的形状：required 是对象上的一级数组，任意 JSON 用「只有 description」的节点。
 */

import { existsSync } from 'node:fs';
import { extract } from './extract.js';

export const name = 'dsh-pdf-reader';
export const inject = ['tools'];

const DESC = [
  'Read a PDF as interleaved text and figures, in reading order.',
  'Text comes back as a block, then the figure that sits at that point in the page, then the',
  'text that follows it — so a chart or a diagram can actually be looked at, not just read about',
  'through its caption. The text inside figures is also recognised and returned as its own block.',
  '',
  'Read a few pages at a time: pages "5" for one page, "5,16" for two, "5-9" for a range.',
  'Omit pages to read the first 10. Long documents are meant to be read page by page — that is',
  'why the tool is page-ranged instead of whole-file.',
  '',
  'Set withImages: false when you only want the words and want to spend no image tokens.',
].join(' ');

/** 参数：隐式对象根 + 属性表。required 由 describe 在外层数组里声明。 */
function parameters() {
  return {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute path to the PDF.',
      },
      pages: {
        type: 'string',
        description: 'Pages to read: "5", "5,16", "5-9". Omit for the first 10 pages. 1-based.',
      },
      withImages: {
        type: 'boolean',
        description: 'Return the figures as images; default true. false returns text only.',
      },
      dpi: {
        type: 'number',
        description: 'Figure rendering resolution, 100-400; default 200.',
      },
    },
    required: ['path'],
  };
}

/**
 * 输出：规范值。blocks 是图文交替的顺序块，图块里的 attachment 是宿主附件引用
 * （已经由 ctx.attachments.saveImage 提交过，不是路径）。
 */
function outputSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'imageCount'],
    properties: {
      text: {
        type: 'string',
        description: 'The page content with figures replaced by position markers.',
      },
      imageCount: {
        type: 'number',
        description: 'How many figures were returned.',
      },
      pageCount: {
        type: 'number',
        description: 'Total pages in the document.',
      },
      pagesRead: {
        type: 'string',
        description: 'Which pages were read.',
      },
      blocks: {
        type: 'array',
        description: 'Reading-order blocks: text runs and figure attachments interleaved.',
        items: { type: 'object', additionalProperties: true },
      },
    },
  };
}

function fail(message) {
  throw new Error(message);
}

export function apply(ctx) {
  const tools = ctx?.tools;
  if (typeof tools?.register !== 'function') return () => {};

  /**
   * 必须写成 `tools.register(...)`，不能先把方法取出来存到变量里。
   * 宿主的 register 是类方法，第一句就用 this.layers；脱开接收者调用会抛
   * TypeError: Cannot read properties of undefined (reading 'layers')。
   */
  const dispose = tools.register({
    name: 'pdf_read',
    description: DESC,
    parameters: parameters(),
    output: {
      schema: outputSchema(),
      /**
       * 图文**按阅读顺序交替**：一段字、一张图、一段图注、一段正文……
       * 不是把图全堆在最后 —— 那样模型看到的是「一堆字 + 几张不知道属于哪的图」。
       */
      render(args, value) {
        const blocks = [];
        for (const b of value.blocks || []) {
          if (b.type === 'text') blocks.push({ type: 'text', text: b.text });
          else if (b.type === 'image' && b.attachment) blocks.push({ type: 'image', attachment: b.attachment });
        }
        if (!blocks.length) blocks.push({ type: 'text', text: value.text || '' });
        return blocks;
      },
    },
    timeoutMs: 120_000,
    isConcurrencySafe() { return true; },

    async execute(args) {
      const pdfPath = args.path;
      if (!pdfPath) fail('path is required');
      if (!existsSync(pdfPath)) fail('PDF not found: ' + pdfPath);

      const dpi = Math.min(Math.max(Number(args.dpi) || 200, 100), 400);
      const withImages = args.withImages !== false;

      const result = await extract({ pdfPath, pages: args.pages, dpi, withImages });

      try {
        return await buildResult(ctx, result, withImages);
      } finally {
        result.cleanup();
      }
    },
  });

  return () => {
    try { dispose?.(); } catch { /* ignore */ }
  };
}

async function buildResult(ctx, result, withImages) {
  const attachments = getAttachments(ctx);
  const outBlocks = [];
  let imageCount = 0;
  const attachFailed = [];

  for (const b of result.blocks || []) {
    if (b.type === 'text') {
      if (b.text?.trim()) outBlocks.push({ type: 'text', text: b.text.trim() });
      continue;
    }
    if (b.type !== 'image') continue;
    if (!withImages) {
      outBlocks.push({ type: 'text', text: '[图 ' + b.name + ']（withImages=false，未提交）' });
      continue;
    }
    if (!attachments?.saveImage) {
      attachFailed.push(b.name);
      continue;
    }
    try {
      const bytes = await readBytes(b.path);
      const ref = await attachments.saveImage.call(attachments, {
        data: bytes,
        mediaType: 'image/png',
        name: b.name,
      });
      outBlocks.push({ type: 'image', attachment: ref });
      imageCount += 1;
    } catch (e) {
      attachFailed.push(b.name + ' (' + String(e?.message ?? e) + ')');
    }
  }

  if (attachFailed.length) {
    outBlocks.push({
      type: 'text',
      text: '\n\n_(以下图未能提交：' + attachFailed.join('; ') + ')_',
    });
  }

  // 纯文本版：把图换成位置标记，让只要文字的场景仍能看出图在哪。
  const plain = (result.blocks || [])
    .map((b) => (b.type === 'text' ? b.text : '[图 ' + b.name + ']'))
    .join('\n\n');

  return {
    blocks: outBlocks,
    text: plain,
    imageCount,
    pageCount: result.pageCount,
    pagesRead: result.pages,
  };
}

/**
 * attachments 是**可选**服务：不在 inject 里声明，所以要运行期探测。
 * ctx.get() 是 cordis 给可选依赖的正规取法（没注册返回 undefined，不抛）；
 * 老宿主没有 get() 才退回属性访问，并且整段包在 try 里。
 */
function getAttachments(ctx) {
  if (!ctx) return null;
  try {
    if (typeof ctx.get === 'function') {
      const viaGet = ctx.get('attachments');
      if (viaGet) return viaGet;
    }
  } catch { /* 服务未注册 */ }
  try { return ctx.attachments ?? null; } catch { return null; }
}

async function readBytes(p) {
  const { readFile } = await import('node:fs/promises');
  return readFile(p);
}
