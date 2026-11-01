import { describe, expect, it } from 'vitest';
import { decodeMimeHeader } from '../../src/core/rfc2047';

const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');

describe('decodeMimeHeader', () => {
  it('エンコードされていない文字列はそのまま返す', () => {
    expect(decodeMimeHeader('Hello world')).toBe('Hello world');
  });

  it('UTF-8 の B エンコードをデコードする', () => {
    expect(decodeMimeHeader(`=?UTF-8?B?${b64('会員登録完了')}?=`)).toBe('会員登録完了');
  });

  it('Q エンコードをデコードする', () => {
    expect(decodeMimeHeader('=?utf-8?Q?caf=C3=A9_au_lait?=')).toBe('café au lait');
  });

  it('隣り合う encoded-word の間の空白を除去する', () => {
    expect(decodeMimeHeader(`=?UTF-8?B?${b64('ログイン')}?= =?UTF-8?B?${b64('通知')}?=`)).toBe('ログイン通知');
  });

  it('UTF-8 の1文字が encoded-word をまたいで分割されていてもデコードできる', () => {
    const bytes = Buffer.from('登録', 'utf-8'); // 6バイト
    const a = bytes.subarray(0, 4).toString('base64');
    const b = bytes.subarray(4).toString('base64');
    expect(decodeMimeHeader(`=?UTF-8?B?${a}?= =?UTF-8?B?${b}?=`)).toBe('登録');
  });

  it('ISO-2022-JP をデコードする', () => {
    // 「ようこそ」を ISO-2022-JP にしたもの
    const iso = Buffer.from([0x1b, 0x24, 0x42, 0x24, 0x68, 0x24, 0x26, 0x24, 0x33, 0x24, 0x3d, 0x1b, 0x28, 0x42]);
    expect(decodeMimeHeader(`=?ISO-2022-JP?B?${iso.toString('base64')}?=`)).toBe('ようこそ');
    // エンコードされていない生の ISO-2022-JP
    expect(decodeMimeHeader(iso.toString('latin1'))).toBe('ようこそ');
  });

  it('Shift_JIS（表記ゆれを含む）をデコードする', () => {
    const sjis = Buffer.from([0x82, 0xa0]); // 「あ」
    expect(decodeMimeHeader(`=?Shift_JIS?B?${sjis.toString('base64')}?=`)).toBe('あ');
    expect(decodeMimeHeader(`=?x-sjis?B?${sjis.toString('base64')}?=`)).toBe('あ');
  });

  it('通常の文字列と encoded-word が混在していてもよい', () => {
    expect(decodeMimeHeader(`[Shop] =?UTF-8?B?${b64('ご注文')}?= #123`)).toBe('[Shop] ご注文 #123');
  });
});
