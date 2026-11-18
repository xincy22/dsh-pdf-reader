/**
 * worker.js — runs MuPDF off the Harness event loop. One request at a time;
 * the parent terminates this thread to cancel.
 */

import { parentPort } from 'node:worker_threads';

const engine = import('./engine.js');

parentPort.on('message', async (msg) => {
  try {
    const { readPdf } = await engine;
    const result = readPdf(new Uint8Array(msg.bytes), msg.options);
    const transfer = [];
    for (const p of result.pages) for (const it of p.items) if (it.png) transfer.push(it.png.buffer);
    parentPort.postMessage({ id: msg.id, ok: true, result }, transfer);
  } catch (e) {
    parentPort.postMessage({ id: msg.id, ok: false, error: String(e?.message ?? e) });
  }
});
