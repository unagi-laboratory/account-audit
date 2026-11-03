# 登録サービス棚卸し（account-audit）

メールのエクスポート（mbox）から過去に登録したWebサービスを洗い出し、不要なアカウントの退会を手伝うツールです。

**処理はすべてブラウザの中で完結します。** メールのデータがサーバーや開発者に送られることはありません。

- 公開ページ: https://unagi-laboratory.github.io/account-audit/
- 要件: [docs/requirements.md](docs/requirements.md)

## 使い方

1. [Googleテイクアウト](https://takeout.google.com/)で「メール」を選び、mbox 形式でエクスポートする（ラベルを絞ってもよい）
2. 公開ページを開き、ダウンロードした `.mbox` ファイルを選ぶ
3. 一覧を見て退会するサービスを判断する。見出しをクリックすると各列で昇順・降順に並べ替えられ、必要なら CSV で保存できる

## 通信していないことの確かめ方

このツールは次の仕組みで、外部と通信できないようにしています。

- **CSP**：本番ビルドの HTML に `default-src 'none'; connect-src 'none'` などの Content-Security-Policy を埋め込み、ブラウザに外部通信を禁止させています。解析を行う Web Worker は blob: URL から起動するので、Worker の中にも同じ CSP が適用されます。
- **CI**：E2E テスト（[tests/e2e/no-network.spec.ts](tests/e2e/no-network.spec.ts)）で、ページの読み込みから解析・CSV 出力までに発生したリクエストをすべて監視し、配信元以外への通信がないことを毎回確かめています。
- **ソース公開**：配信しているコードはこのリポジトリから GitHub Actions でビルドしたものです（[deploy.yml](.github/workflows/deploy.yml)）。

ご自身でも確かめられます。

- ブラウザの開発者ツールの「ネットワーク」タブを開いたままファイルを読み込み、通信が発生しないことを見る
- ページを読み込んだあとにネットワークを切断（機内モードなど）してからファイルを読み込む
- ページのソースを表示し、`Content-Security-Policy` の meta タグを確認する

## 開発

Node.js 22 以上が必要です。

```sh
npm ci
npm run dev        # 開発サーバー（CSP は付与されない）
npm test           # ユニットテスト
npm run test:e2e   # 本番ビルド + ネットワーク監視の E2E テスト（初回は npx playwright install chromium）
npm run build      # dist/ に静的ファイルを出力
```

### 構成

```
src/
  core/        解析ロジック（DOM に依存しない。ユニットテストの対象）
    mbox.ts      mbox のストリーム分割とヘッダー抽出
    rfc2047.ts   MIME エンコードされたヘッダーのデコード
    domain.ts    送信元ドメインの抽出と登録可能ドメインへの丸め
    signals.ts   件名によるシグナル判定
    aggregate.ts ドメインごとの集約
    csv.ts       CSV 出力
  worker.ts    解析用 Web Worker
  main.ts      UI
tests/
  unit/        ユニットテスト（Vitest）
  e2e/         E2E テスト（Playwright）
  fixtures/    合成テストデータ（generate.mjs で生成）
```

## ⚠️ テストデータのルール

**実在のメール（自分のものを含む）をこのリポジトリに入れないでください。**

- テストには `tests/fixtures/generate.mjs` で作る合成データだけを使います。ドメインは予約済みの `example.*` を使ってください。
- `.gitignore` で `*.mbox` / `*.csv` などは除外していますが（`tests/fixtures/` は例外）、コミット前に `git diff --staged` で中身を確認してください。
- Issue やプルリクエストに件名や送信元を貼るときも、実データは伏せてください。

## 既知の限界

- 削除済みのメール、別のアドレスで登録したもの、電話番号だけで登録したものは検出できません
- 件名のルールによる判定には誤検出と見逃しがあります。最終判断はご自身で行ってください
- 送信元ドメインがサービス名と一致しない場合があります（配信代行サービスや親会社のドメインなど）

## ライセンス

[MIT](LICENSE)
