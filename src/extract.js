/**
 * extract.js — 调 Python 跑 pymupdf4llm。
 *
 * 为什么走 Python：pymupdf4llm 是 PyMuPDF 的官方 LLM 扩展，一行调用就能把
 * 文本、图的裁切、图内文字的 OCR 全都做出来。Node 侧没有等价的东西。
 * 代价是每次调用起一个 Python 进程（约 0.4 s 启动 + 2-4 s 解析）。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir as osTmpdir } from 'node:os';
import path from 'node:path';

/**
 * 解析一个**确实存在**的临时目录。
 *
 * `os.tmpdir()` 依赖 TEMP/TMP 环境变量；精简过的宿主进程里两者都可能是空的，
 * 它会返回字面量 "undefined\\temp"，拿去做 mkdtemp 就是 ENOENT。
 * 所以这里按 环境变量 → os.tmpdir() → 常见位置 依次探测，第一个写得了的胜出。
 */
function resolveTempRoot() {
  const candidates = [
    process.env.TEMP,
    process.env.TMP,
    process.env.TMPDIR,
    process.env.USERPROFILE ? process.env.USERPROFILE + '\\AppData\\Local\\Temp' : undefined,
    osTmpdir(),
    'C:\\Windows\\Temp',
  ];
  for (const dir of candidates) {
    if (!dir) continue;
    if (/undefined/i.test(dir)) continue;
    try {
      if (existsSync(dir)) return dir;
    } catch { /* 继续找 */ }
  }
  throw new Error('no writable temp directory found (TEMP/TMP/TMPDIR all unusable)');
}

const PY_CANDIDATES = [
  process.env.DSH_PDF_PYTHON,
  String.raw`C:\Users\xincy\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe`,
];

function findPython() {
  for (const p of PY_CANDIDATES) {
    if (p && existsSync(p)) return p;
  }
  return 'python';
}

/**
 * @param {{pdfPath: string, pages?: string, dpi?: number, withImages?: boolean}} opts
 * @returns {Promise<{markdown: string, images: {path: string, name: string}[], pageCount: number, pages: string, cleanup: () => void}>}
 */
export function extract({ pdfPath, pages, dpi = 200, withImages = true }) {
  return new Promise((resolve, reject) => {
    const scriptPath = new URL('./extract.py', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
    const py = findPython();

    // 参数走 UTF-8 文件而不是 stdin：Windows 的管道会按 GBK 编码，中文路径直接乱码。
    const argDir = mkdtempSync(path.join(resolveTempRoot(), 'dsh-pdf-arg-'));
    const argFile = path.join(argDir, 'args.json');
    writeFileSync(argFile, JSON.stringify({ path: pdfPath, pages, dpi, withImages }), 'utf8');

    const child = spawn(py, [scriptPath, argFile], { windowsHide: true });
    let out = '';
    let err = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { err += c; if (err.length > 8000) err = err.slice(-8000); });

    child.on('error', (e) => {
      rmSync(argDir, { recursive: true, force: true });
      reject(new Error('cannot start Python (' + py + '): ' + e.message));
    });

    child.on('close', (code) => {
      rmSync(argDir, { recursive: true, force: true });

      // stdout 里可能混有 pymupdf4llm 的提示行（"=== Document parser messages ==="），
      // 真正的 JSON 是最后一行。
      const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
      const jsonLine = [...lines].reverse().find((l) => l.startsWith('{'));
      if (!jsonLine) {
        reject(new Error('PDF engine produced no result (exit ' + code + '): '
          + (err.trim().split('\n').slice(-3).join(' ') || 'no stderr')));
        return;
      }
      let parsed;
      try { parsed = JSON.parse(jsonLine); }
      catch { reject(new Error('PDF engine returned malformed JSON')); return; }

      if (parsed.error) {
        if (parsed.imageDir) rmSync(parsed.imageDir, { recursive: true, force: true });
        reject(new Error(parsed.error));
        return;
      }

      resolve({
        markdown: parsed.markdown ?? '',
        blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
        images: Array.isArray(parsed.images) ? parsed.images : [],
        pageCount: parsed.pageCount ?? 0,
        pages: parsed.pages ?? '',
        cleanup: () => {
          if (parsed.imageDir) rmSync(parsed.imageDir, { recursive: true, force: true });
        },
      });
    });
  });
}
