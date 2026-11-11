import { expect, type Page, test } from '@playwright/test';
import { TRACK_LOGIN_REQUIRED_NOTICE } from '../../../src/core/membership.ts';
import { INTRO_TEXT } from '../../../src/core/tracked.ts';
import { shot } from '../helpers/shot.ts';

// 운영 DB 에 아무것도 쓰지 않는 읽기 전용 스모크.
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => document.fonts.ready);
}

test('소개 화면의 제목이 보인다', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByTestId('landing-hero').getByRole('heading', { level: 1, name: INTRO_TEXT.slogan }),
  ).toBeVisible();
  await settle(page);
  await shot(page, 'prod-intro');
});

test('/search 에 추적 중인 정치인 6명이 보이고 샘플은 없다', async ({ page }) => {
  await page.goto('/search');
  const table = page.getByTestId('tracked-table');
  await expect(table.getByTestId('tracked-row')).toHaveCount(6);
  await expect(table.locator('[data-official-id="president-2025"]')).toHaveCount(1);
  await expect(table.locator('[data-official-id="daegu-mayor-2026"]')).toHaveCount(1);
  await expect(table.locator('[data-official-id="sample-oo-si"]')).toHaveCount(0);
  await settle(page);
  await shot(page, 'prod-search');
});

test('대시보드 주소로 바로 진입해도(새로고침 fallback) 공약 수가 보인다', async ({ page }) => {
  await page.goto('/o/daegu-mayor-2026');
  await expect(page.getByTestId('total-count')).toHaveText(/^공약 [1-9]\d*개$/);
  await settle(page);
  await shot(page, 'prod-dashboard');
});

test('비회원이 추적 요청을 누르면 로그인 안내만 보이고 아무것도 제출되지 않는다', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (r) => {
    // search_catalog 는 POST 지만 읽기 전용 RPC 다.
    if (
      r.method() !== 'GET' &&
      r.method() !== 'HEAD' &&
      r.method() !== 'OPTIONS' &&
      !r.url().endsWith('/rpc/search_catalog')
    )
      writes.push(`${r.method()} ${r.url()}`);
  });
  await page.goto('/search');
  await page.getByRole('textbox', { name: '검색어', exact: true }).fill('대구');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByTestId('catalog-result').getByTestId('track-start').first().click();

  const dialog = page.getByTestId('login-required-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('login-required-notice')).toHaveText(TRACK_LOGIN_REQUIRED_NOTICE);
  await expect(page.getByTestId('track-request-dialog')).toHaveCount(0);
  await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await settle(page);
  await shot(page, 'prod-login-notice');
  expect(writes).toEqual([]);
});

test('실패 경로 — 없는 화면은 찾을 수 없음 문구를 보인다', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없습니다' })).toBeVisible();
});

test('실패 경로 — 없는 정적 파일은 404, /health 는 정상 응답', async ({ request }) => {
  const missing = await request.get('/assets/nope.js');
  expect(missing.status()).toBe(404);
  const health = await request.get('/health');
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true });
});
