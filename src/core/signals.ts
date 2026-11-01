/**
 * 件名と List-Unsubscribe ヘッダーから、アカウントの存在を示すシグナルを判定する。
 * 誤検出・見逃しは前提。最終判断はユーザーが行う。
 */

export type Signal = 'signup' | 'usage' | 'withdrawal' | 'newsletter';

export const SIGNAL_LABELS: Record<Signal, string> = {
  signup: '登録',
  usage: '利用',
  withdrawal: '退会',
  newsletter: '配信のみ',
};

const RULES: Record<Exclude<Signal, 'newsletter'>, RegExp[]> = {
  signup: [
    /会員登録|仮登録|本登録|登録完了|新規登録|ご登録|アカウント(の)?(作成|開設)/,
    /ようこそ|メールアドレス(の)?(確認|認証)/,
    /\bwelcome\b|\bverify\b|\bconfirm (your )?(email|account)\b|\bactivate your account\b/i,
  ],
  usage: [
    /ログイン(通知|のお知らせ)|新しい(端末|デバイス)|パスワード(の)?(再設定|変更|リセット)/,
    /二段階認証|2段階認証|認証コード|ワンタイムパスワード|注文(確認|完了)|ご注文|ご購入/,
    /\bsign[- ]?in\b|\blog[- ]?in\b|\bpassword reset\b|\bsecurity (alert|code)\b|\bverification code\b|\border (confirmation|receipt)\b|\byour receipt\b/i,
  ],
  withdrawal: [
    /退会(完了|手続き|のお知らせ)|アカウント(の)?削除|解約(完了|手続き)|会員登録(の)?解除/,
    /\baccount (has been )?(deleted|closed|deactivated)\b|\bcancellation confirmed\b/i,
  ],
};

export function detectSignals(subject: string, hasListUnsubscribe: boolean): Set<Signal> {
  const found = new Set<Signal>();
  for (const [signal, patterns] of Object.entries(RULES) as [Signal, RegExp[]][]) {
    if (patterns.some((p) => p.test(subject))) found.add(signal);
  }
  if (found.size === 0 && hasListUnsubscribe) found.add('newsletter');
  return found;
}
