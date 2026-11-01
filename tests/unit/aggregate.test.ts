import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MboxParser } from '../../src/core/mbox';
import { Aggregator } from '../../src/core/aggregate';
import { detectSignals } from '../../src/core/signals';
import { toCsv } from '../../src/core/csv';

describe('detectSignals', () => {
  it.each([
    ['【サンプル】会員登録が完了しました', 'signup'],
    ['Please verify your email', 'signup'],
    ['新しい端末からログインがありました', 'usage'],
    ['パスワード再設定のご案内', 'usage'],
    ['退会手続きが完了しました', 'withdrawal'],
  ])('%s → %s', (subject, signal) => {
    expect(detectSignals(subject, false).has(signal as never)).toBe(true);
  });

  it('他に当たらず List-Unsubscribe があるときだけ「配信のみ」', () => {
    expect([...detectSignals('Weekly digest', true)]).toEqual(['newsletter']);
    expect(detectSignals('Weekly digest', false).size).toBe(0);
    expect(detectSignals('会員登録完了', true).has('newsletter')).toBe(false);
  });
});

describe('Aggregator', () => {
  const p = new MboxParser();
  const agg = new Aggregator();
  for (const h of [...p.push(readFileSync(new URL('../fixtures/sample.mbox', import.meta.url))), ...p.end()]) agg.add(h);
  const rows = agg.result();
  const byDomain = Object.fromEntries(rows.map((r) => [r.domain, r]));

  it('サブドメインを登録可能ドメインにまとめる', () => {
    expect(byDomain['example.co.jp']!.count).toBe(2);
    expect(byDomain['example.net']!.count).toBe(2);
  });

  it('初回・最終受信日を記録する', () => {
    const r = byDomain['example.co.jp']!;
    expect(new Date(r.firstSeen!).toISOString()).toBe('2020-02-03T01:00:00.000Z');
    expect(new Date(r.lastSeen!).toISOString()).toBe('2021-06-01T03:00:00.000Z');
  });

  it('シグナルを数え、代表的な件名をデコードして保持する', () => {
    const r = byDomain['example.net']!;
    expect(r.signals.signup).toBe(1);
    expect(r.signals.usage).toBe(1);
    expect(r.sampleSubjects).toContain('新しい端末からログインがありました');
    expect(byDomain['example.org']!.signals.withdrawal).toBe(1);
    expect(byDomain['example.com']!.signals.newsletter).toBe(1);
  });

  it('アカウントの可能性が高い順、同点なら最終受信日が古い順に並ぶ', () => {
    expect(rows.map((r) => r.domain)).toEqual(['example.net', 'example.co.jp', 'example.org', 'example.com']);
  });
});

describe('toCsv', () => {
  it('BOM 付きで、引用符・改行・数式をエスケープする', () => {
    const csv = toCsv(['a', 'b'], [['x,y', '=SUM(A1)'], ['say "hi"', 1]]);
    expect(csv).toBe('﻿a,b\r\n"x,y",\'=SUM(A1)\r\n"say ""hi""",1\r\n');
  });
});
