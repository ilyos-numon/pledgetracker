import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { formatCount, isListedOfficial } from '../../src/core/tracked.ts';
import { sbEnv, seedSample } from './helpers/db.ts';
import { seedCatalogSample } from './helpers/members.ts';
import { shot } from './helpers/shot.ts';

// 기대값: anon 키로 officials·pledges 를 직접 읽어 등재 규칙(is_sample·e2e 제외)으로 센다.
async function expectedRows(): Promise<Map<string, number>> {
  const { url, anonKey } = sbEnv();
  const db = createClient(url, anonKey);
  const offs = await db.from('officials').select('id, is_sample');
  if (offs.error) throw new Error(offs.error.message);
  const counts = new Map<string, number>();
  for (const o of offs.data) if (isListedOfficial(o)) counts.set(o.id, 0);
  for (let from = 0; ; from += 1000) {
    const res = await db
      .from('pledges')
      .select('id, official_id')
      .order('id')
      .range(from, from + 999);
    if (res.error) throw new Error(res.error.message);
    for (const p of res.data)
      if (counts.has(p.official_id)) counts.set(p.official_id, (counts.get(p.official_id) ?? 0) + 1);
    if (res.data.length < 1000) return counts;
  }
}

async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => document.fonts.ready);
}

test.beforeAll(async () => {
  await seedSample(); // 표에서 빠져야 하는 샘플
  await seedCatalogSample();
});

async function expectTableMatchesDb(page: Page, want: Map<string, number>) {
  const rows = page.getByTestId('tracked-row');
  await expect(rows).toHaveCount(want.size);
  const ids = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-official-id')));
  expect([...ids].sort()).toEqual([...want.keys()].sort());
  for (const [id, n] of want) {
    await expect(
      page.locator(`[data-testid="tracked-row"][data-official-id="${id}"]`).getByTestId('tracked-pledge-count'),
    ).toHaveText(formatCount(n));
  }
}

test.describe('추적 중인 정치인 표', () => {
  test('행 수·공약 수가 DB 와 같고 대통령·대구시장 포함, 샘플·e2e 제외', async ({ page }) => {
    const want = await expectedRows();
    expect(want.has('president-2025')).toBe(true);
    expect(want.has('daegu-mayor-2026')).toBe(true);
    await page.goto('/search');
    await expect(page.getByRole('heading', { level: 2, name: '추적 중인 정치인' })).toBeVisible();
    await expect(page.getByTestId('tracked-table')).toBeVisible();
    await expectTableMatchesDb(page, want);
    await expect(page.locator('[data-official-id="president-2025"]')).toHaveCount(1);
    await expect(page.locator('[data-official-id="daegu-mayor-2026"]')).toHaveCount(1);
    await expect(page.locator('[data-official-id="sample-oo-si"]')).toHaveCount(0);
    await expect(page.locator('[data-official-id^="e2e"]')).toHaveCount(0);
    await settle(page);
    await shot(page, 'tracked-desktop');
  });

  test('이름을 누르면 대시보드로 가고 공약 수가 행 값과 같다', async ({ page }) => {
    const want = await expectedRows();
    await page.goto('/search');
    const row = page.locator('[data-testid="tracked-row"][data-official-id="president-2025"]');
    await expect(row).toBeVisible();
    await row.getByTestId('tracked-name').click();
    await expect(page).toHaveURL(/\/o\/president-2025$/);
    await expect(page.getByTestId('total-count')).toHaveText(`공약 ${want.get('president-2025')}개`);
    await expect(page.getByTestId('nav-search')).toHaveAttribute('aria-current', 'page');
  });

  test('모바일 — 카드형도 같은 행 수, 가로 스크롤 없음', async ({ page }) => {
    const want = await expectedRows();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search');
    await expectTableMatchesDb(page, want);
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, 'tracked-mobile');
  });

  test('모바일 메뉴 Drawer 스크린샷', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/search');
    await page.getByTestId('nav-burger').click();
    await expect(page.getByRole('dialog', { name: '메뉴' })).toBeVisible();
    await expect(page.locator('.mantine-Drawer-content')).toHaveCSS('opacity', '1');
    await settle(page);
    await shot(page, 'nav-mobile-drawer');
  });

  test('회귀 — 표 아래 검색은 "가상" 3명을 보여 준다', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByTestId('tracked-table')).toBeVisible();
    await page.getByRole('textbox', { name: '검색어', exact: true }).fill('가상');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByTestId('catalog-result')).toHaveCount(3);
  });

  test('실패 경로 — 목록 요청이 실패하면 오류를 보이고 검색은 계속 동작한다', async ({ page }) => {
    await page.route(/\/rest\/v1\/officials(\?|$)/, (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
    );
    await page.goto('/search');
    await expect(page.getByTestId('tracked-error')).toBeVisible();
    await expect(page.getByTestId('tracked-row')).toHaveCount(0);
    await page.getByRole('textbox', { name: '검색어', exact: true }).fill('가상');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByTestId('catalog-result')).toHaveCount(3);
  });

  test('실패 경로 — 목록 요청이 끊기면(abort) 무한 대기 없이 오류를 보인다', async ({ page }) => {
    // supabase-js 는 네트워크 오류 GET 을 1·2·4초 간격으로 3번 재시도한 뒤 오류를 낸다(약 8초). 기본 5초로는 부족하다.
    await page.route(/\/rest\/v1\/officials(\?|$)/, (r) => r.abort());
    await page.goto('/search');
    await expect(page.getByTestId('tracked-error')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('tracked-loading')).toHaveCount(0);
    await expect(page.getByTestId('tracked-row')).toHaveCount(0);
  });
});
