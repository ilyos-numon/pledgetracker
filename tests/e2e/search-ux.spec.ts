import { type Browser, expect, type Page, test } from '@playwright/test';
import {
  GUEST_SEARCH_NOTE,
  SEARCH_EMPTY_TEXT,
  SEARCH_ERROR_TEXT,
  SEARCH_FILTER_EMPTY_TEXT,
  SEARCH_HINT,
  SEARCH_PLACEHOLDER,
  TRACK_BUTTON_LABEL,
  TRACK_PAID_HINT,
  TRACK_PAID_NOTICE,
} from '../../src/core/membership.ts';
import { seedSample } from './helpers/db.ts';
import { createMember, seedCatalogSample } from './helpers/members.ts';
import { shot } from './helpers/shot.ts';

// 캡처 직전: 애니메이션 종료 + 웹폰트 로드를 기다린다(고정 sleep 없음).
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => document.fonts.ready);
}

let member: Awaited<ReturnType<typeof createMember>>;

test.beforeAll(async ({ browser, baseURL }) => {
  await seedSample();
  await seedCatalogSample();
  member = await createMember();
  sessionItems = await loginOnce(browser, baseURL, member);
});

test.afterAll(async () => {
  await member?.cleanup();
});

// Supabase 로그인 속도 제한(IP당 5분 30회)을 피하려고 파일당 한 번만 로그인하고, 세션을 localStorage 로 심는다.
let sessionItems: Array<[string, string]> = [];

async function loginOnce(browser: Browser, baseURL: string | undefined, who: { email: string; password: string }) {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  await page.goto('/review');
  await page.getByLabel('이메일', { exact: true }).fill(who.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByTestId('review-error')).toHaveText('검수 권한이 없습니다', { timeout: 20_000 });
  const state = await ctx.storageState();
  await ctx.close();
  return state.origins.flatMap((o) => o.localStorage.map((i): [string, string] => [i.name, i.value]));
}

async function applySession(page: Page, items: Array<[string, string]> = sessionItems) {
  await page.addInitScript((kv) => {
    for (const [k, v] of kv) window.localStorage.setItem(k, v);
  }, items);
}

async function loginAndOpenSearch(page: Page) {
  await applySession(page);
  await page.goto('/search');
  await expect(page.getByTestId('search-form')).toBeVisible();
}

const box = (page: Page) => page.getByRole('textbox', { name: '검색어', exact: true });

async function noHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 1280,
  );
}

function rpcCounter(page: Page) {
  const state = { n: 0 };
  page.on('request', (r) => {
    if (r.url().includes('search_catalog')) state.n += 1;
  });
  return state;
}

test('비회원 — 공개 안내 문구와 검색창이 보이고 회원 전용 카드는 없다', async ({ page }) => {
  await page.goto('/search');
  await expect(page.getByTestId('guest-note')).toHaveText(GUEST_SEARCH_NOTE);
  await expect(box(page)).toHaveAttribute('placeholder', SEARCH_PLACEHOLDER);
  await expect(page.getByTestId('member-only-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
  await shot(page, 'search-guest');
});

test('회원 — 큰 검색창(placeholder)·힌트·자유 입력 접힘, 본문에 로그아웃 없음', async ({ page }) => {
  await loginAndOpenSearch(page);
  await expect(page.getByRole('heading', { level: 1, name: '정치인 찾기' })).toBeVisible();
  await expect(box(page)).toHaveAttribute('placeholder', SEARCH_PLACEHOLDER);
  await expect(page.getByTestId('search-hint')).toHaveText(SEARCH_HINT);
  await expect(page.getByTestId('search-filter')).toHaveCount(0);
  await expect(page.getByTestId('free-request-form')).toBeHidden();
  await expect(page.getByTestId('free-request-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('main').getByRole('button', { name: '로그아웃' })).toHaveCount(0);
  await box(page).fill('가상');
  await expect(page.getByTestId('catalog-result')).toHaveCount(3);
  await expect(page.getByTestId('search-count')).toHaveText('결과 3명');
  await expect(page.getByTestId('search-filter')).toBeVisible();
  await settle(page);
  await shot(page, 'search-desktop');
});

test('입력만 해도 자동 검색 — 추적 중 카드가 맨 위, "결과 3명"', async ({ page }) => {
  await loginAndOpenSearch(page);
  await box(page).pressSequentially('가상');
  const rows = page.getByTestId('catalog-result');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toHaveAttribute('data-catalog-id', 'sample-oo-si');
  await expect(rows.first()).toHaveAttribute('data-tracked', 'true');
  await expect(page.getByTestId('search-count')).toHaveText('결과 3명');
  await expect(page.getByTestId('search-hint')).toHaveCount(0);
});

test('카드 첫 줄 "지역 · 직위", 추적 중은 공약 보기, 미추적은 추적 요청 + 유료', async ({ page }) => {
  await loginAndOpenSearch(page);
  await box(page).fill('가상');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  const tracked = page.locator('[data-testid="catalog-result"][data-catalog-id="sample-oo-si"]');
  await expect(tracked.getByTestId('result-place')).toHaveText('OO시 · 시장');
  await expect(tracked.getByRole('link', { name: '공약 보기', exact: true })).toHaveAttribute(
    'href',
    '/o/sample-oo-si',
  );
  await expect(tracked.getByTestId('track-start')).toHaveCount(0);
  const open = page.locator('[data-testid="catalog-result"][data-catalog-id="sample-xx-gun"]');
  await expect(open.getByTestId('result-place')).toHaveText('XX군 · 군수');
  await expect(open.getByTestId('track-start')).toHaveText(TRACK_BUTTON_LABEL);
  await expect(open.getByTestId('track-paid-hint')).toHaveText(TRACK_PAID_HINT);
  await expect(open.getByTestId('open-dashboard')).toHaveCount(0);
});

test('필터 광역 → 1명 "결과 1명 (전체 3명)", 새 요청 없음, 전체로 복귀', async ({ page }) => {
  await loginAndOpenSearch(page);
  const rpc = rpcCounter(page);
  await box(page).fill('가상');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByTestId('catalog-result')).toHaveCount(3);
  const before = rpc.n;
  expect(before).toBeGreaterThan(0);

  const filter = page.getByTestId('search-filter');
  await expect(filter.getByText('전체', { exact: true })).toBeVisible();
  await filter.getByText('광역', { exact: true }).click();
  await expect(page.getByTestId('catalog-result')).toHaveCount(1);
  await expect(page.getByTestId('catalog-result')).toHaveAttribute('data-catalog-id', 'sample-yy-do');
  await expect(page.getByTestId('search-count')).toHaveText('결과 1명 (전체 3명)');
  await expect(filter.getByText('광역', { exact: true })).toBeVisible();
  await settle(page);
  await shot(page, 'search-filter-metro');

  await filter.getByText('기초', { exact: true }).click();
  await expect(page.getByTestId('catalog-result')).toHaveCount(2);
  await filter.getByText('추적 중', { exact: true }).click();
  await expect(page.getByTestId('catalog-result')).toHaveCount(1);
  await expect(page.getByTestId('catalog-result')).toHaveAttribute('data-catalog-id', 'sample-oo-si');
  await filter.getByText('전체', { exact: true }).click();
  await expect(page.getByTestId('search-count')).toHaveText('결과 3명');
  expect(rpc.n).toBe(before);
});

test('조건에 맞는 행이 없으면 필터 빈 문구 (추적 중 0건인 검색)', async ({ page }) => {
  await loginAndOpenSearch(page);
  await box(page).fill('가상 군수');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByTestId('catalog-result')).toHaveCount(1);
  await page.getByTestId('search-filter').getByText('추적 중', { exact: true }).click();
  await expect(page.getByTestId('search-filter-empty')).toHaveText(SEARCH_FILTER_EMPTY_TEXT);
  await expect(page.getByTestId('catalog-result')).toHaveCount(0);
  await expect(page.getByTestId('search-count')).toHaveText('결과 0명 (전체 1명)');
});

test('없는 이름은 SEARCH_EMPTY_TEXT, 지우면 힌트로 돌아가고 오류는 없다', async ({ page }) => {
  await loginAndOpenSearch(page);
  await box(page).fill('없는이름zq');
  await expect(page.getByTestId('search-empty')).toHaveText(SEARCH_EMPTY_TEXT);
  await box(page).fill('');
  await expect(page.getByTestId('search-hint')).toHaveText(SEARCH_HINT);
  await expect(page.getByTestId('search-error')).toHaveCount(0);
  await expect(page.getByTestId('search-empty')).toHaveCount(0);
});

test('공백만 검색 버튼 → query_required, 41자 → query_too_long', async ({ page }) => {
  await loginAndOpenSearch(page);
  await box(page).fill('   ');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByTestId('search-error')).toHaveText(SEARCH_ERROR_TEXT.query_required);
  await expect(page.getByTestId('catalog-result')).toHaveCount(0);
  await box(page).fill('가'.repeat(41));
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByTestId('search-error')).toHaveText(SEARCH_ERROR_TEXT.query_too_long);
});

test('자유 입력 토글 — 접힘 → 펼침 → 다시 접힘, 펼친 화면 스크린샷', async ({ page }) => {
  await loginAndOpenSearch(page);
  const toggle = page.getByTestId('free-request-toggle');
  const form = page.getByTestId('free-request-form');
  await expect(toggle).toHaveText('찾는 사람이 없나요? 직접 요청하기');
  await expect(form).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(form).toBeVisible();
  await expect(form.getByLabel('이름', { exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await shot(page, 'free-request-open');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(form).toBeHidden();
});

test('추적 요청 대화상자에 유료 안내가 있다', async ({ page }) => {
  await loginAndOpenSearch(page);
  await box(page).fill('가상 군수');
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await page.getByTestId('track-start').click();
  const dialog = page.getByTestId('track-request-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('track-request-paid')).toHaveText(TRACK_PAID_NOTICE);
});

test.describe('모바일 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('검색 결과·필터·카드 행동 버튼이 가로 스크롤 없이 보인다', async ({ page }) => {
    await loginAndOpenSearch(page);
    await noHorizontalScroll(page);
    await box(page).fill('가상');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByTestId('catalog-result')).toHaveCount(3);
    await expect(page.getByTestId('search-filter')).toBeVisible();
    await expect(page.getByTestId('open-dashboard')).toBeVisible();
    await expect(page.getByTestId('track-start').first()).toBeVisible();
    await noHorizontalScroll(page);
    await page.evaluate(() => document.fonts.ready);
    await shot(page, 'search-mobile');
  });

  test('비회원 검색 화면도 가로 스크롤 없음', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByTestId('guest-note')).toBeVisible();
    await expect(page.getByTestId('search-form')).toBeVisible();
    await noHorizontalScroll(page);
  });
});
