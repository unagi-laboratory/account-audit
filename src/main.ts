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

const SIGNALS: Signal[] = ['signup', 'usage', 'withdrawal', 'newsletter'];

type SortKey = 'domain' | 'score' | 'count' | 'firstSeen' | 'lastSeen' | 'subjects';
type SortDir = 'asc' | 'desc';

/** 見出しを初めてクリックしたときの向き。文字列は昇順、数値・日付は降順から */
const FIRST_DIR: Record<SortKey, SortDir> = {
  domain: 'asc',
  score: 'desc',
  count: 'desc',
  firstSeen: 'desc',
  lastSeen: 'desc',
  subjects: 'asc',
};

const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });

/** 並べ替えの値。null は向きに関係なく末尾に置く */
function sortValue(r: ServiceRow, key: SortKey): string | number | null {
  switch (key) {
    case 'domain':
      return r.domain;
    case 'subjects':
      return r.sampleSubjects[0] ?? null;
    default:
      return r[key];
  }
}

const state = {
  rows: [] as ServiceRow[],
  filterText: '',
  filterSignal: '' as Signal | '',
  // 初期状態はワーカーが返す既定順（アカウントの可能性が高い順）と同じ
  sortKey: 'score' as SortKey,
  sortDir: 'desc' as SortDir,
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
  const rows = state.rows.filter(
    (r) =>
      (!q || r.domain.includes(q) || r.sampleSubjects.some((s) => s.toLowerCase().includes(q))) &&
      (!state.filterSignal || r.signals[state.filterSignal] > 0),
  );
  const k = state.sortKey;
  const dir = state.sortDir === 'asc' ? 1 : -1;
  // Array.prototype.sort は安定ソートなので、同値の行は既定順のまま並ぶ
  return [...rows].sort((a, b) => {
    const av = sortValue(a, k);
    const bv = sortValue(b, k);
    if (av === bv) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const c = typeof av === 'string' && typeof bv === 'string' ? collator.compare(av, bv) : av < bv ? -1 : 1;
    return c * dir;
  });
}

function renderSortIndicators(): void {
  document.querySelectorAll<HTMLButtonElement>('th button[data-sort]').forEach((btn) => {
    const th = btn.closest('th')!;
    const active = btn.dataset.sort === state.sortKey;
    if (active) th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
    else th.removeAttribute('aria-sort');
    btn.querySelector('.sort-indicator')!.textContent = active ? (state.sortDir === 'asc' ? '▲' : '▼') : '';
  });
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


    frag.append(tr);
  }
  tbody.replaceChildren(frag);
  renderSortIndicators();
}

function exportCsv(): void {
  const header = ['ドメイン', '件数', '初回受信', '最終受信', ...SIGNALS.map((s) => SIGNAL_LABELS[s]), '代表的な件名'];
  const rows = visibleRows().map((r) => [
    r.domain,
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
        state.sortKey = 'score';
        state.sortDir = 'desc';
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
    if (state.sortKey === key) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      state.sortKey = key;
      state.sortDir = FIRST_DIR[key];
    }
    render();
  });
});
exportBtn.addEventListener('click', exportCsv);
