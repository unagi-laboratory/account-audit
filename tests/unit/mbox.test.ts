import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MboxParser, parseHeaderLines } from '../../src/core/mbox';

const enc = new TextEncoder();

function parseAll(text: string, chunkSize = Infinity) {
  const p = new MboxParser();
  const bytes = enc.encode(text);
  const out = [];
  const size = Math.min(chunkSize, bytes.length || 1);
  for (let i = 0; i < bytes.length; i += size) out.push(...p.push(bytes.subarray(i, i + size)));
  out.push(...p.end());
  return out;
}

const SAMPLE = [
  'From a@example.com Mon Jan 01 00:00:00 2024',
  'From: A <a@example.com>',
  'Subject: first',
  'Date: Mon, 01 Jan 2024 00:00:00 +0000',
  '',
  'body line',
  'From here this is still the body', // 直前が空行ではないので区切りではない
  '',
  'From b@example.org Mon Jan 01 00:00:00 2024',
  'From: b@example.org',
  'Subject: second',
  'List-Unsubscribe: <mailto:u@example.org>',
  '',
  'body',
  '',
].join('\r\n');

describe('MboxParser', () => {
  it('メッセージを分割し、必要なヘッダーだけを取り出す', () => {
    const msgs = parseAll(SAMPLE);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toEqual({ from: 'A <a@example.com>', subject: 'first', date: 'Mon, 01 Jan 2024 00:00:00 +0000', listUnsubscribe: '' });
    expect(msgs[1]!.listUnsubscribe).toBe('<mailto:u@example.org>');
  });

  it('チャンクの境界がどこにあっても同じ結果になる', () => {
    const whole = parseAll(SAMPLE);
    for (const size of [1, 2, 3, 7, 16, 64]) expect(parseAll(SAMPLE, size)).toEqual(whole);
  });

  it('空のファイルでは何も返さない', () => {
    expect(parseAll('')).toEqual([]);
  });

  it('合成フィクスチャを読める', () => {
    const p = new MboxParser();
    const msgs = [...p.push(readFileSync(new URL('../fixtures/sample.mbox', import.meta.url))), ...p.end()];
    expect(msgs).toHaveLength(6);
  });
});

describe('parseHeaderLines', () => {
  it('折り返されたヘッダーを連結する', () => {
    const h = parseHeaderLines(['Subject: hello', '\tworld', 'From: x@example.com']);
    expect(h.subject).toBe('hello world');
    expect(h.from).toBe('x@example.com');
  });

  it('ヘッダー名の大文字小文字を区別しない', () => {
    expect(parseHeaderLines(['SUBJECT: a']).subject).toBe('a');
  });
});
