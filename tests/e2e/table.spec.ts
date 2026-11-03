import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/sample.mbox', import.meta.url));

test('見出しのクリックで昇順・降順を切り替えられる', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#file', FIXTURE);
  await expect(page.locator('#rows tr')).toHaveCount(4);

  // ステータス列はない
  await expect(page.locator('thead th')).toHaveCount(6);
  await expect(page.locator('#rows select')).toHaveCount(0);

  const domains = () => page.locator('#rows td.domain').allTextContents();
  const domainTh = page.locator('th:has(button[data-sort="domain"])');

  // 初期状態はシグナル（スコア）の降順
  await expect(page.locator('th:has(button[data-sort="score"])')).toHaveAttribute('aria-sort', 'descending');

  await page.click('button[data-sort="domain"]');
  await expect(domainTh).toHaveAttribute('aria-sort', 'ascending');
  const asc = await domains();
  expect(asc).toEqual([...asc].sort());

  await page.click('button[data-sort="domain"]');
  await expect(domainTh).toHaveAttribute('aria-sort', 'descending');
  expect(await domains()).toEqual([...asc].reverse());

  // 件数は降順から始まり、もう一度で昇順
  const counts = async () => (await page.locator('#rows td.num').allTextContents()).map(Number);
  await page.click('button[data-sort="count"]');
  const desc = await counts();
  expect(desc).toEqual([...desc].sort((a, b) => b - a));
  await page.click('button[data-sort="count"]');
  const ascCounts = await counts();
  expect(ascCounts).toEqual([...ascCounts].sort((a, b) => a - b));
  await expect(domainTh).not.toHaveAttribute('aria-sort', /.*/);
});
