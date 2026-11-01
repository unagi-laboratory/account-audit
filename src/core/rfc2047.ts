/**
 * RFC 2047 のエンコードされたヘッダー（=?charset?B|Q?...?=）をデコードする。
 *
 * - 隣り合う encoded-word の間の空白は除去する（RFC 2047 §6.2）。
 * - 同じ文字コードの連続した encoded-word はバイト列を連結してからデコードする。
 *   UTF-8 の1文字が2つの encoded-word にまたがって分割されるケースに対応するため。
 * - エンコードされていない生の ISO-2022-JP（ESC シーケンスを含む）もデコードする。
 * - 文字コードの変換はブラウザ標準の TextDecoder に任せる（追加ライブラリ不要）。
 */

const ENCODED_WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

interface Segment {
  kind: 'text' | 'encoded';
  text?: string;
  charset?: string;
  bytes?: Uint8Array;
}

function normalizeCharset(charset: string): string {
  // RFC 2231 の言語指定（例: UTF-8*ja）を除去
  const c = charset.split('*')[0]!.toLowerCase();
  // 実際のメールでよく見かける表記ゆれ
  if (c === 'x-sjis' || c === 'sjis' || c === 'shift-jis' || c === 'cp932' || c === 'windows-31j') return 'shift_jis';
  return c;
}

function decodeBase64(s: string): Uint8Array {
  try {
    const bin = atob(s.replace(/[^A-Za-z0-9+/=]/g, ''));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
}

function decodeQ(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '_') {
      out.push(0x20);
    } else if (ch === '=' && i + 2 < s.length && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // 未知の文字コードは UTF-8 として扱う
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/** 生の ISO-2022-JP（7bit + ESC シーケンス）を含む文字列をデコードする */
function decodeRawIso2022jp(s: string): string {
  if (!s.includes('\x1b')) return s;
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return decodeBytes(bytes, 'iso-2022-jp');
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const r = new Uint8Array(a.length + b.length);
  r.set(a, 0);
  r.set(b, a.length);
  return r;
}

export function decodeMimeHeader(input: string): string {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of input.matchAll(ENCODED_WORD)) {
    const idx = m.index;
    const between = input.slice(last, idx);
    const prev = segments[segments.length - 1];
    // encoded-word 同士の間の空白だけの部分は捨てる
    if (between.length > 0 && !(prev?.kind === 'encoded' && /^\s+$/.test(between))) {
      segments.push({ kind: 'text', text: between });
    }
    const charset = normalizeCharset(m[1]!);
    const bytes = m[2]!.toUpperCase() === 'B' ? decodeBase64(m[3]!) : decodeQ(m[3]!);
    const tail = segments[segments.length - 1];
    if (tail?.kind === 'encoded' && tail.charset === charset) {
      tail.bytes = concat(tail.bytes!, bytes);
    } else {
      segments.push({ kind: 'encoded', charset, bytes });
    }
    last = idx + m[0].length;
  }
  if (last < input.length) segments.push({ kind: 'text', text: input.slice(last) });

  return segments
    .map((s) => (s.kind === 'text' ? decodeRawIso2022jp(s.text!) : decodeBytes(s.bytes!, s.charset!)))
    .join('');
}
