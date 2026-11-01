// テスト用の合成 mbox を生成する。
// 実在のメールは絶対に使わないこと。ドメインは予約済みの example.* のみを使う。
//   npm run fixtures
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const b64 = (s, enc = 'utf-8') => Buffer.from(s, enc).toString('base64');
const encUtf8 = (s) => `=?UTF-8?B?${b64(s)}?=`;

const messages = [
  {
    from: `${encUtf8('サンプル商店')} <noreply@mail.example.co.jp>`,
    subject: encUtf8('【サンプル商店】会員登録が完了しました'),
    date: 'Mon, 03 Feb 2020 10:00:00 +0900',
  },
  {
    from: 'Sample Shop <info@example.co.jp>',
    subject: encUtf8('ご注文の確認'),
    date: 'Tue, 01 Jun 2021 12:00:00 +0900',
  },
  {
    from: 'News <news@example.com>',
    subject: 'Weekly digest',
    date: 'Wed, 10 Mar 2021 09:00:00 +0000',
    listUnsubscribe: '<mailto:unsubscribe@example.com>',
  },
  {
    from: 'Example Service <no-reply@accounts.example.net>',
    subject: 'Welcome to Example Service! Please verify your email',
    date: 'Thu, 15 Aug 2019 08:30:00 +0000',
  },
  {
    from: 'Example Service <security@example.net>',
    // 長い件名を2つの encoded-word に分けて折り返す
    subject: `${encUtf8('新しい端末から')}\n ${encUtf8('ログインがありました')}`,
    date: 'Fri, 20 Dec 2019 23:59:59 +0000',
  },
  {
    from: 'old-service@example.org',
    subject: encUtf8('退会手続きが完了しました'),
    date: 'Sat, 01 Jan 2022 00:00:00 +0900',
  },
];

function render(m) {
  const lines = [
    `From 1700000000000000000@xxx Mon Jan 01 00:00:00 +0000 2024`,
    'X-Gmail-Labels: Inbox',
    `From: ${m.from}`,
    `Subject: ${m.subject}`,
    `Date: ${m.date}`,
  ];
  if (m.listUnsubscribe) lines.push(`List-Unsubscribe: ${m.listUnsubscribe}`);
  lines.push('Content-Type: text/plain; charset=UTF-8', '');
  // 本文。本文中の "From " 行で誤分割しないことも確認する
  lines.push('This is a synthetic test message.', 'From here on, the body continues.', '');
  return lines.join('\n');
}

const out = fileURLToPath(new URL('./sample.mbox', import.meta.url));
writeFileSync(out, messages.map(render).join('\n') + '\n');
console.log(`wrote ${out} (${messages.length} messages)`);
