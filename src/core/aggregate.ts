import type { MessageHeaders } from './mbox';
import { decodeMimeHeader } from './rfc2047';
import { extractDomain, registrableDomain } from './domain';
import { detectSignals, type Signal } from './signals';

export interface ServiceRow {
  domain: string;
  firstSeen: number | null; // epoch ms
  lastSeen: number | null;
  count: number;
  signals: Record<Signal, number>;
  sampleSubjects: string[];
  /** アカウントがある可能性の高さ（並べ替え用） */
  score: number;
}

const MAX_SAMPLES = 3;

function emptySignals(): Record<Signal, number> {
  return { signup: 0, usage: 0, withdrawal: 0, newsletter: 0 };
}

export function accountScore(s: Record<Signal, number>): number {
  // 登録 > 利用 > 配信のみ。退会シグナルがあってもアカウント存在の根拠にはなるので減点しない
  return (s.signup > 0 ? 100 : 0) + (s.usage > 0 ? 50 : 0) + (s.withdrawal > 0 ? 30 : 0) + (s.newsletter > 0 ? 1 : 0);
}

export class Aggregator {
  private rows = new Map<string, ServiceRow>();
  messages = 0;
  skipped = 0;

  add(h: MessageHeaders): void {
    this.messages++;
    const host = extractDomain(decodeMimeHeader(h.from));
    if (!host) {
      this.skipped++;
      return;
    }
    const domain = registrableDomain(host);
    const subject = decodeMimeHeader(h.subject).replace(/\s+/g, ' ').trim();
    const t = Date.parse(h.date);
    const time = Number.isNaN(t) ? null : t;

    let row = this.rows.get(domain);
    if (!row) {
      row = { domain, firstSeen: null, lastSeen: null, count: 0, signals: emptySignals(), sampleSubjects: [], score: 0 };
      this.rows.set(domain, row);
    }
    row.count++;
    if (time !== null) {
      if (row.firstSeen === null || time < row.firstSeen) row.firstSeen = time;
      if (row.lastSeen === null || time > row.lastSeen) row.lastSeen = time;
    }
    const signals = detectSignals(subject, h.listUnsubscribe.length > 0);
    for (const s of signals) row.signals[s]++;

    // 代表的な件名: シグナルに当たった件名を優先して保持する
    const isKey = signals.has('signup') || signals.has('usage') || signals.has('withdrawal');
    if (subject && !row.sampleSubjects.includes(subject)) {
      if (row.sampleSubjects.length < MAX_SAMPLES) {
        if (isKey) row.sampleSubjects.unshift(subject);
        else row.sampleSubjects.push(subject);
      } else if (isKey) {
        row.sampleSubjects.pop();
        row.sampleSubjects.unshift(subject);
      }
    }
  }

  /** 既定の並び順: アカウントの可能性が高い順 → 最終受信日が古い順 */
  result(): ServiceRow[] {
    const rows = [...this.rows.values()];
    for (const r of rows) r.score = accountScore(r.signals);
    return rows.sort((a, b) => b.score - a.score || (a.lastSeen ?? 0) - (b.lastSeen ?? 0));
  }
}
