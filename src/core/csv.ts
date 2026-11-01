/** CSV 1セル分のエスケープ（RFC 4180） */
function cell(v: string | number | null): string {
  const s = v === null ? '' : String(v);
  // 表計算ソフトの数式インジェクション対策（件名は外部由来の文字列なので）
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Excel で文字化けしないよう UTF-8 BOM を付けて返す */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(cell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
