import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/*
 * 「外部へのリクエストがゼロであること」を保証するテスト。
 * ページ読み込みから解析・CSV 出力までの間に発生したリクエストをすべて記録し、
 * 配信元（プレビューサーバー）以外へのリクエストが1件もないことを確認する。
 */

const FIXTURE = fileURLToPath(new URL('../fixtures/sample.mbox', import.meta.url));
// blob: / data: はブラウザ内のデータでネットワーク通信ではない
const LOCAL_SCHEMES = ['blob:', 'data:'];

test('mbox を解析してもネットワークリクエストは配信元以外に出ない', async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const external: string[] = [];
  const record = (url: string) => {
    if (LOCAL_SCHEMES.some((s) => url.startsWith(s))) return;
    if (new URL(url).origin !== origin) external.push(url);
  };
  page.on('request', (req) => record(req.url()));
  page.on('websocket', (ws) => external.push(ws.url()));
  // Worker 内のリクエストもコンテキスト単位で監視する
  page.context().on('request', (req) => record(req.url()));

  await page.goto('/');
  await page.setInputFiles('#file', FIXTURE);

  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#rows tr')).toHaveCount(4);
  await expect(page.locator('#rows')).toContainText('会員登録が完了しました');

  const download = page.waitForEvent('download');
  await page.click('#export-csv');
  expect((await download).suggestedFilename()).toMatch(/^account-audit-.*\.csv$/);

  expect(external).toEqual([]);
});

test('CSP によって外部への fetch がブロックされる', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("default-src 'none'");

  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
});
