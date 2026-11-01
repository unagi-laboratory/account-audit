import type { ServiceRow } from './core/aggregate';

export interface WorkerRequest {
  file: File;
}

export type WorkerResponse =
  | { type: 'progress'; bytesRead: number; totalBytes: number; messages: number }
  | { type: 'done'; rows: ServiceRow[]; messages: number; skipped: number }
  | { type: 'error'; message: string };
