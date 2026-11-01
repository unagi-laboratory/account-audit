/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';

/**
 * 本番ビルドにだけ付与する Content-Security-Policy。
 *
 * - すべてを既定で禁止（default-src 'none'）し、必要なものだけ許可する。
 * - connect-src 'none' で fetch / XHR / WebSocket などの外部通信を禁止する。
 * - Worker は blob: URL で起動する（vite の ?worker&inline）。blob: の Worker は
 *   このページの CSP を引き継ぐため、Worker の中からも通信できない。
 *   （同一オリジンの URL から読み込んだ Worker には meta タグの CSP が効かない）
 *
 * 開発サーバーは HMR に WebSocket を使うので、dev では付与しない。
 * GitHub Pages ではレスポンスヘッダーを設定できないため meta タグで指定する。
 */
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "worker-src blob:",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "manifest-src 'self'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

function injectCsp(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  // GitHub Pages のプロジェクトサイト（/<repo>/）向けに、デプロイ時に BASE_PATH を渡す
  base: process.env.BASE_PATH ?? '/',
  plugins: [injectCsp()],
  build: {
    target: 'es2022',
    // ソースマップは公開する（配信物と公開ソースの対応を確認しやすくするため）
    sourcemap: true,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
