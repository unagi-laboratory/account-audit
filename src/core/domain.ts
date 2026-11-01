/**
 * From ヘッダーからのドメイン抽出と、登録可能ドメインへの丸め。
 *
 * TODO: Public Suffix List を同梱して正確に判定する。
 *       現状は日本・主要国でよく使われる2階層サフィックスだけを手書きで持つ暫定実装。
 */

/** From ヘッダーからメールアドレスを取り出す（"Name <a@b>" / "a@b" / "a@b (Name)"） */
export function extractAddress(from: string): string | null {
  const angle = from.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (angle) return angle[1]!.toLowerCase();
  const bare = from.match(/([^\s<>"(),;:]+@[^\s<>"(),;:]+)/);
  return bare ? bare[1]!.toLowerCase() : null;
}

export function extractDomain(from: string): string | null {
  const addr = extractAddress(from);
  if (!addr) return null;
  const domain = addr.slice(addr.lastIndexOf('@') + 1).replace(/\.$/, '');
  return /^[a-z0-9.-]+\.[a-z0-9-]+$/.test(domain) ? domain : null;
}

/** 暫定: 2階層の公開サフィックス（PSL 導入までのつなぎ） */
const TWO_LEVEL_SUFFIXES = new Set([
  // 日本
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp', 'ed.jp', 'gr.jp', 'lg.jp', 'ad.jp',
  // その他の主要国
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk',
  'com.au', 'net.au', 'org.au',
  'co.kr', 'com.cn', 'com.tw', 'com.hk', 'com.sg', 'co.nz', 'com.br', 'co.in',
]);

export function registrableDomain(domain: string): string {
  const labels = domain.split('.');
  if (labels.length <= 2) return domain;
  const lastTwo = labels.slice(-2).join('.');
  const n = TWO_LEVEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return labels.slice(-n).join('.');
}
