/**
 * mbox ストリームパーサー。
 *
 * - バイト列をチャンク単位で受け取り、メッセージごとに必要なヘッダーだけを返す。
 * - 本文は読み飛ばす（解析も保持もしない）。
 * - 区切りは「ファイル先頭、または空行の直後にある `From ` で始まる行」。
 *   本文中の `From ` 行で誤分割しないよう、直前の空行を条件にしている。
 */

export interface MessageHeaders {
  from: string;
  subject: string;
  date: string;
  listUnsubscribe: string;
}

/** 抽出するヘッダー名（小文字）→ MessageHeaders のキー */
const WANTED: Record<string, keyof MessageHeaders> = {
  from: 'from',
  subject: 'subject',
  date: 'date',
  'list-unsubscribe': 'listUnsubscribe',
};

const LF = 0x0a;
const CR = 0x0d;
const FROM_ = [0x46, 0x72, 0x6f, 0x6d, 0x20]; // "From "

/** ヘッダーが異常に長いメッセージでメモリを食わないための上限 */
const MAX_HEADER_BYTES = 256 * 1024;

function isFromLine(line: Uint8Array): boolean {
  if (line.length < FROM_.length) return false;
  for (let i = 0; i < FROM_.length; i++) {
    if (line[i] !== FROM_[i]) return false;
  }
  return true;
}

type State = 'preamble' | 'header' | 'body';

export class MboxParser {
  private carry: Uint8Array | null = null;
  private state: State = 'preamble';
  private prevBlank = true; // ファイル先頭は空行の直後とみなす
  private headerChunks: Uint8Array[] = [];
  private headerBytes = 0;
  private out: MessageHeaders[] = [];
  private readonly decoder = new TextDecoder('utf-8');

  /** チャンクを投入し、この時点でヘッダーが確定したメッセージを返す */
  push(chunk: Uint8Array): MessageHeaders[] {
    let data = chunk;
    if (this.carry) {
      data = new Uint8Array(this.carry.length + chunk.length);
      data.set(this.carry, 0);
      data.set(chunk, this.carry.length);
      this.carry = null;
    }
    let start = 0;
    for (;;) {
      const nl = data.indexOf(LF, start);
      if (nl === -1) break;
      this.line(data.subarray(start, nl));
      start = nl + 1;
    }
    if (start < data.length) this.carry = data.slice(start);
    return this.drain();
  }

  /** 入力終端。残りを処理して返す */
  end(): MessageHeaders[] {
    if (this.carry) {
      this.line(this.carry);
      this.carry = null;
    }
    if (this.state === 'header') this.finishHeader();
    this.state = 'preamble';
    return this.drain();
  }

  private drain(): MessageHeaders[] {
    const r = this.out;
    this.out = [];
    return r;
  }

  private line(raw: Uint8Array): void {
    const line = raw.length > 0 && raw[raw.length - 1] === CR ? raw.subarray(0, raw.length - 1) : raw;

    if (this.prevBlank && isFromLine(line)) {
      // ヘッダーの途中で次のメッセージが始まった場合（空行なし）も確定させる
      if (this.state === 'header') this.finishHeader();
      this.state = 'header';
      this.headerChunks = [];
      this.headerBytes = 0;
      this.prevBlank = false;
      return;
    }

    if (this.state === 'header') {
      if (line.length === 0) {
        this.finishHeader();
        this.state = 'body';
      } else if (this.headerBytes < MAX_HEADER_BYTES) {
        // subarray は元バッファを参照するのでコピーして保持する
        this.headerChunks.push(line.slice());
        this.headerBytes += line.length + 1;
      }
    }
    this.prevBlank = line.length === 0;
  }

  private finishHeader(): void {
    const lines = this.headerChunks.map((c) => this.decoder.decode(c));
    this.headerChunks = [];
    this.headerBytes = 0;
    this.out.push(parseHeaderLines(lines));
  }
}

/** ヘッダー行（折り返しを含む）から必要なヘッダーだけを取り出す */
export function parseHeaderLines(lines: string[]): MessageHeaders {
  const result: MessageHeaders = { from: '', subject: '', date: '', listUnsubscribe: '' };
  const seen = new Set<keyof MessageHeaders>();
  let current: keyof MessageHeaders | null = null;

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      // 折り返し行（RFC 5322 unfolding）
      if (current) result[current] += ' ' + line.trim();
      continue;
    }
    current = null;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = WANTED[line.slice(0, colon).trim().toLowerCase()];
    // 同じヘッダーが複数ある場合は最初のものを使う
    if (key && !seen.has(key)) {
      seen.add(key);
      current = key;
      result[key] = line.slice(colon + 1).trim();
    }
  }
  return result;
}
