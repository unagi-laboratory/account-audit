import './style.css';
import AnalyzeWorker from './worker?worker&inline';
import type { WorkerResponse } from './protocol';
import type { ServiceRow } from './core/aggregate';
import { SIGNAL_LABELS, type Signal } from './core/signals';
import { toCsv } from './core/csv';

/*
 * UI。メールから取り出した文字列（件名など）は外部由来なので、
 * innerHTML は使わず textContent だけで DOM に入れる。
 */

type Status = '' | 'withdraw' | 'keep' | 'withdrawn' | 'ignore';
const STATUS_LABELS: Record<Status, string> = {
  '': '未設定',
  withdraw: '退会する',
  keep: '残す',
  withdrawn: '退会済み',
  ignore: '対象外',
};
const SIGNALS: Signal[] = ['signup', 'usage', 'withdrawal', 'newsletter'];

type SortKey = 'default' | 'domain' | 'count' | 'firstSeen' | 'lastSeen';

const state = {
  rows: [] as ServiceRow[],
  status: new Map<string, Status>(),
  filterText: '',
  filterSignal: '' as Signal | '',
  sortKey: 'default' as SortKey,
  sortDesc: false,
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fileInput = $<HTMLInputElement>('file');
const progress = $<HTMLProgressElement>('progress');
const progressText = $<HTMLElement>('progress-text');
const resultSection = $<HTMLElement>('result');
const summary = $<HTMLElement>('summary');
const tbody = $<HTMLTableSectionElement>('rows');
const filterText = $<HTMLInputElement>('filter-text');
const filterSignal = $<HTMLSelectElement>('filter-signal');
const exportBtn = $<HTMLButtonElement>('export-csv');

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}

function fmtDate(t: number | null): string {
  if (t === null) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtBytes(n: number): string {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function visibleRows(): ServiceRow[] {
  const q = state.filterText.toLowerCase();
  let rows = state.rows.filter(
    (r) =>
      (!q || r.domain.includes(q) || r.sampleSubjects.some((s) => s.toLowerCase().includes(q))) &&
      (!state.filterSignal || r.signals[state.filterSignal] > 0),
  );
  if (state.sortKey !== 'default') {
    const k = state.sortKey;
    const dir = state.sortDesc ? -1 : 1;
    rows = [...rows].sort((a, b) => {
      const av = a[k] ?? 0;
      const bv = b[k] ?? 0;
      return (av < bv ? -1 : av > bv ? 1 : 0) * dir;
    });
  }
  return rows;
}

function render(): void {
  const rows = visibleRows();
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    const tr = el('tr');
    tr.append(el('td', r.domain, 'domain'));

    const sig = el('td');
    for (const s of SIGNALS) {
      if (r.signals[s] > 0) sig.append(el('span', `${SIGNAL_LABELS[s]} ${r.signals[s]}`, `badge badge-${s}`));
    }
    tr.append(sig);

    tr.append(el('td', String(r.count), 'num'));
    tr.append(el('td', fmtDate(r.firstSeen), 'date'));
    tr.append(el('td', fmtDate(r.lastSeen), 'date'));

    const subj = el('td', undefined, 'subjects');
    for (const s of r.sampleSubjects) subj.append(el('div', s));
    tr.append(subj);

    const statusCell = el('td');
    const select = el('select');
    select.setAttribute('aria-label', `${r.domain} のステータス`);
    for (const [value, label] of Object.entries(STATUS_LABELS)) {
      const opt = el('option', label);
      opt.value = value;
      select.append(opt);
    }
    select.value = state.status.get(r.domain) ?? '';
    select.addEventListener('change', () => state.status.set(r.domain, select.value as Status));
    statusCell.append(select);
    tr.append(statusCell);

    frag.append(tr);
  }
  tbody.replaceChildren(frag);
}

function exportCsv(): void {
  const header = ['ドメイン', 'ステータス', '件数', '初回受信', '最終受信', ...SIGNALS.map((s) => SIGNAL_LABELS[s]), '代表的な件名'];
  const rows = visibleRows().map((r) => [
    r.domain,
    STATUS_LABELS[state.status.get(r.domain) ?? ''],
    r.count,
    fmtDate(r.firstSeen),
    fmtDate(r.lastSeen),
    ...SIGNALS.map((s) => r.signals[s]),
    r.sampleSubjects.join(' / '),
  ]);
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = `account-audit-${fmtDate(Date.now())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function analyze(file: File): void {
  progress.hidden = false;
  progress.value = 0;
  progressText.textContent = '読み込み中…';
  resultSection.hidden = true;
  fileInput.disabled = true;

  const worker = new AnalyzeWorker();
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'progress':
        progress.value = msg.totalBytes ? msg.bytesRead / msg.totalBytes : 1;
        progressText.textContent = `${fmtBytes(msg.bytesRead)} / ${fmtBytes(msg.totalBytes)}（${msg.messages.toLocaleString()} 通）`;
        break;
      case 'done':
        worker.terminate();
        fileInput.disabled = false;
        state.rows = msg.rows;
        state.status.clear();
        summary.textContent = `${msg.messages.toLocaleString()} 通のメールから ${msg.rows.length.toLocaleString()} 件の送信元ドメインを検出しました` +
          (msg.skipped ? `（送信元を判別できなかったメール: ${msg.skipped.toLocaleString()} 通）` : '');
        resultSection.hidden = false;
        render();
        break;
      case 'error':
        worker.terminate();
        fileInput.disabled = false;
        progressText.textContent = `エラー: ${msg.message}`;
        break;
    }
  };
  worker.postMessage({ file });
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) analyze(file);
});
filterText.addEventListener('input', () => {
  state.filterText = filterText.value;
  render();
});
filterSignal.addEventListener('change', () => {
  state.filterSignal = filterSignal.value as Signal | '';
  render();
});
document.querySelectorAll<HTMLButtonElement>('th button[data-sort]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.sort as SortKey;
    state.sortDesc = state.sortKey === key ? !state.sortDesc : key === 'count';
    state.sortKey = key;
    render();
  });
});
exportBtn.addEventListener('click', exportCsv);
