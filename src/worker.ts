/**
 * 解析用 Web Worker。
 * File.stream() でチャンク単位に読み、全体をメモリに載せずに集約する。
 * main.ts から ?worker&inline（blob: URL）として起動されるため、ページの CSP を引き継ぐ。
 */
import { MboxParser } from './core/mbox';
import { Aggregator } from './core/aggregate';
import type { WorkerRequest, WorkerResponse } from './protocol';

const PROGRESS_INTERVAL_MS = 100;

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

async function analyze(file: File): Promise<void> {
  const parser = new MboxParser();
  const agg = new Aggregator();
  const reader = file.stream().getReader();
  let bytesRead = 0;
  let lastReport = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    for (const h of parser.push(value)) agg.add(h);

    const now = performance.now();
    if (now - lastReport > PROGRESS_INTERVAL_MS) {
      lastReport = now;
      post({ type: 'progress', bytesRead, totalBytes: file.size, messages: agg.messages });
    }
  }
  for (const h of parser.end()) agg.add(h);

  post({ type: 'progress', bytesRead, totalBytes: file.size, messages: agg.messages });
  post({ type: 'done', rows: agg.result(), messages: agg.messages, skipped: agg.skipped });
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  analyze(e.data.file).catch((err: unknown) => {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  });
};
