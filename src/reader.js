/**
 * reader.js — owns the MuPDF worker thread. Requests run one at a time;
 * cancelling or timing out a request terminates the thread, and the next
 * request starts a fresh one.
 */

import { Worker } from 'node:worker_threads';

const WORKER_URL = new URL('./worker.js', import.meta.url);

export class PdfReader {
  #worker = null;
  #queue = Promise.resolve();
  #seq = 0;
  #closed = false;

  /**
   * @param {Uint8Array} bytes PDF content (transferred to the worker)
   * @param {object} options engine options
   * @param {{signal?: AbortSignal, timeoutMs?: number}} control
   */
  read(bytes, options, { signal, timeoutMs = 90_000 } = {}) {
    const run = this.#queue.then(() => this.#run(bytes, options, signal, timeoutMs));
    this.#queue = run.catch(() => {});
    return run;
  }

  #spawn() {
    if (!this.#worker) {
      this.#worker = new Worker(WORKER_URL, { resourceLimits: { maxOldGenerationSizeMb: 1024 } });
      this.#worker.unref();
    }
    return this.#worker;
  }

  #kill() {
    const w = this.#worker;
    this.#worker = null;
    if (w) void w.terminate();
  }

  #run(bytes, options, signal, timeoutMs) {
    if (this.#closed) return Promise.reject(new Error('the PDF reader has been unloaded'));
    signal?.throwIfAborted();
    const worker = this.#spawn();
    const id = ++this.#seq;
    return new Promise((resolve, reject) => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        worker.off('message', onMessage);
        worker.off('error', onError);
        worker.off('exit', onExit);
      };
      const fail = (error, kill) => {
        done();
        if (kill) this.#kill();
        reject(error);
      };
      const onMessage = (msg) => {
        if (msg.id !== id) return;
        done();
        if (msg.ok) resolve(msg.result);
        else reject(new Error(msg.error));
      };
      const onError = (e) => fail(new Error('PDF engine crashed: ' + (e?.message ?? e)), true);
      const onExit = (code) => fail(new Error('PDF engine stopped (exit ' + code + ')'), true);
      const onAbort = () => fail(signal.reason ?? new Error('cancelled'), true);
      worker.on('message', onMessage);
      worker.on('error', onError);
      worker.on('exit', onExit);
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => fail(new Error('reading the PDF took longer than ' + Math.round(timeoutMs / 1000) + ' s; request fewer pages'), true), timeoutMs);
      const copy = bytes.buffer.byteLength === bytes.byteLength ? bytes : bytes.slice();
      worker.postMessage({ id, bytes: copy.buffer, options }, [copy.buffer]);
    });
  }

  close() {
    this.#closed = true;
    this.#kill();
  }
}
