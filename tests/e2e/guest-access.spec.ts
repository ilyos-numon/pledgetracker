import { type Browser, expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/core/database.types.ts';
import {
  FREE_REQUEST_TEXT,
  GUEST_SEARCH_NOTE,
  LOGIN_TO_REQUEST_LABEL,
  SIGNUP_TO_REQUEST_LABEL,
  TRACK_LOGIN_REQUIRED_DETAIL,
  TRACK_LOGIN_REQUIRED_NOTICE,
} from '../../src/core/membership.ts';
import { buildReturnPath, loginHref, signupHref } from '../../web/src/lib/requestReturn.ts';
import { sbEnv, seedSample } from './helpers/db.ts';
import {
  countRows,
  createMember,
  deleteUserByEmail,
  newMemberCredentials,
  seedCatalogSample,
} from './helpers/members.ts';
import { shot } from './helpers/shot.ts';

// 캡처 직전: 애니메이션 종료 + 웹폰트 로드를 기다린다(고정 sleep 없음).
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => document.fonts.ready);
}

// 모달 캡처: 대화상자가 완전히 불투명하고 애니메이션이 끝난 뒤.
async function settleDialog(page: Page, testId: string) {
  const dialog = page.getByTestId(testId);
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await settle(page);
}

let member: Awaited<ReturnType<typeof createMember>>;
let sessionItems: Array<[string, string]> = [];

test.beforeAll(async ({ browser, baseURL }) => {
  await seedSample();
  await seedCatalogSample();
  member = await createMember();
  sessionItems = await loginOnce(browser, baseURL, member);
});

test.afterAll(async () => {
  await member?.cleanup();
});

// Supabase 로그인 속도 제한을 피하려고 세션을 한 번만 만들고 localStorage 로 심는다.
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

async function applySession(page: Page) {
  await page.addInitScript((kv) => {
    for (const [k, v] of kv) window.localStorage.setItem(k, v);
  }, sessionItems);
}

const box = (page: Page) => page.getByRole('textbox', { name: '검색어', exact: true });
const row = (page: Page, id: string) => page.locator(`[data-testid="catalog-result"][data-catalog-id="${id}"]`);
const XX_TARGET = '가상 군수 · XX군 · 군수';
const FREE_TARGET = '가상 구청장 · ZZ구 · 구청장';

async function searchGuest(page: Page, q: string) {
  await box(page).fill(q);
  await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByTestId('catalog-result')).toHaveCount(3);
}

async function fillFreeForm(page: Page) {
  await page.getByTestId('free-request-toggle').click();
  const form = page.getByTestId('free-request-form');
  await form.getByLabel('이름', { exact: true }).fill('가상 구청장');
  await form.getByLabel('지역', { exact: true }).fill('ZZ구');
  await form.getByLabel('직위', { exact: true }).fill('구청장');
  return form;
}

test('비회원이 로그인 없이 검색·필터·대시보드를 본다', async ({ page }) => {
  await page.goto('/search');
  await expect(page.getByTestId('guest-note')).toHaveText(GUEST_SEARCH_NOTE);
  await expect(page.getByTestId('search-form')).toBeVisible();
  await searchGuest(page, '가상');
  await expect(page.getByTestId('catalog-result').first()).toHaveAttribute('data-catalog-id', 'sample-oo-si');
  await expect(page.getByTestId('search-count')).toHaveText('결과 3명');
  await settle(page);
  await shot(page, 'guest-search');

  await page.getByTestId('search-filter').getByText('광역', { exact: true }).click();
  await expect(page.getByTestId('catalog-result')).toHaveCount(1);
  await expect(page.getByTestId('search-count')).toHaveText('결과 1명 (전체 3명)');
  await page.getByTestId('search-filter').getByText('전체', { exact: true }).click();
  await expect(page.getByTestId('catalog-result')).toHaveCount(3);

  await row(page, 'sample-oo-si').getByTestId('open-dashboard').click();
  await expect(page).toHaveURL(/\/o\/sample-oo-si$/);
  await expect(page.getByTestId('total-count')).toHaveText('공약 12개');
});

test('비회원 추적 요청은 로그인 안내를 보이고 아무것도 만들지 않는다', async ({ page }) => {
  const officialsBefore = await countRows('officials');
  const catalogBefore = await countRows('official_catalog');
  await page.goto('/search');
  await searchGuest(page, '가상');
  await row(page, 'sample-xx-gun').getByTestId('track-start').click();

  const dialog = page.getByTestId('login-required-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('login-required-notice')).toHaveText(TRACK_LOGIN_REQUIRED_NOTICE);
  await expect(dialog.getByTestId('login-required-detail')).toHaveText(TRACK_LOGIN_REQUIRED_DETAIL);
  await expect(dialog.getByTestId('track-request-target')).toHaveText(XX_TARGET);
  const next = buildReturnPath('가상', { kind: 'catalog', id: 'sample-xx-gun' });
  const login = dialog.getByTestId('login-required-login');
  const signup = dialog.getByTestId('login-required-signup');
  await expect(login).toHaveText(LOGIN_TO_REQUEST_LABEL);
  await expect(login).toHaveAttribute('href', loginHref(next));
  await expect(signup).toHaveText(SIGNUP_TO_REQUEST_LABEL);
  await expect(signup).toHaveAttribute('href', signupHref(next));
  await expect(page.getByTestId('admin-contact')).toHaveCount(0);
  await expect(page.getByTestId('track-request-dialog')).toHaveCount(0);
  await settleDialog(page, 'login-required-dialog');
  await shot(page, 'guest-login-required');
  expect(await countRows('officials')).toBe(officialsBefore);
  expect(await countRows('official_catalog')).toBe(catalogBefore);
});

test('로그인하면 같은 사람의 요청 대화상자로 돌아온다', async ({ page }) => {
  await page.goto('/search');
  await searchGuest(page, '가상');
  await row(page, 'sample-xx-gun').getByTestId('track-start').click();
  await page.getByTestId('login-required-login').click();
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel('이메일', { exact: true }).fill(member.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(member.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();

  await expect(page).toHaveURL(/\/search\?q=/, { timeout: 20_000 });
  const dialog = page.getByTestId('track-request-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('track-request-target')).toHaveText(XX_TARGET);
  await expect(dialog.getByTestId('admin-contact')).toBeVisible();
  await expect(page.getByTestId('login-required-dialog')).toHaveCount(0);
  await expect.poll(() => page.url()).not.toContain('request=');
  await settleDialog(page, 'track-request-dialog');
  await shot(page, 'guest-return-dialog');
});

test('가입하면 자유 입력 요청 대화상자로 돌아오고 입력값이 남는다', async ({ page }) => {
  const { email, password } = newMemberCredentials();
  try {
    await page.goto('/search');
    await fillFreeForm(page);
    await page.getByRole('button', { name: '추적 요청', exact: true }).click();
    const dialog = page.getByTestId('login-required-dialog');
    await expect(dialog.getByTestId('track-request-target')).toHaveText(FREE_TARGET);
    await dialog.getByTestId('login-required-signup').click();

    await expect(page).toHaveURL(/\/signup\?next=/);
    await page.getByLabel('이메일', { exact: true }).fill(email);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await page.getByRole('button', { name: '가입하기', exact: true }).click();

    await expect(page).toHaveURL(/\/search/, { timeout: 20_000 });
    await expect(page.getByTestId('free-request-toggle')).toHaveAttribute('aria-expanded', 'true');
    const form = page.getByTestId('free-request-form');
    await expect(form.getByLabel('이름', { exact: true })).toHaveValue('가상 구청장');
    await expect(form.getByLabel('지역', { exact: true })).toHaveValue('ZZ구');
    await expect(form.getByLabel('직위', { exact: true })).toHaveValue('구청장');
    await expect(page.getByTestId('track-request-dialog').getByTestId('track-request-target')).toHaveText(FREE_TARGET);
    await settleDialog(page, 'track-request-dialog');
    await shot(page, 'guest-free-return');
  } finally {
    await deleteUserByEmail(email);
  }
});

test('비회원이 자유 입력을 비워 제출하면 오류만 보이고 안내 대화상자는 없다', async ({ page }) => {
  await page.goto('/search');
  await page.getByTestId('free-request-toggle').click();
  await page.getByRole('button', { name: '추적 요청', exact: true }).click();
  const form = page.getByTestId('free-request-form');
  await expect(form.getByText(FREE_REQUEST_TEXT.name_required)).toBeVisible();
  await expect(form.getByText(FREE_REQUEST_TEXT.region_required)).toBeVisible();
  await expect(form.getByText(FREE_REQUEST_TEXT.office_required)).toBeVisible();
  await expect(page.getByTestId('login-required-dialog')).toHaveCount(0);
});

test('회원은 안내 없이 바로 요청 대화상자를 연다', async ({ page }) => {
  await applySession(page);
  await page.goto('/search');
  await expect(page.getByTestId('search-form')).toBeVisible();
  await expect(page.getByTestId('guest-note')).toHaveCount(0);
  await searchGuest(page, '가상');
  await row(page, 'sample-xx-gun').getByTestId('track-start').click();
  await expect(page.getByTestId('track-request-dialog')).toBeVisible();
  await expect(page.getByTestId('login-required-dialog')).toHaveCount(0);
});

test('잘못된 request 값은 무시하고 검색 결과만 보인다', async ({ page }) => {
  await applySession(page);
  for (const bad of ['no-such-id', 'Bad%20Id']) {
    await page.goto(`/search?q=${encodeURIComponent('가상')}&request=${bad}`);
    await expect(page.getByTestId('catalog-result')).toHaveCount(3);
    await expect(page.getByTestId('track-request-dialog')).toHaveCount(0);
    await expect(page.getByTestId('login-required-dialog')).toHaveCount(0);
    await expect(page.getByTestId('search-error')).toHaveCount(0);
  }
});

test('가입 next 가 외부 경로(//evil)여도 /search 로만 간다', async ({ page }) => {
  const { email, password } = newMemberCredentials();
  try {
    await page.goto('/signup?next=%2F%2Fevil');
    await page.getByLabel('이메일', { exact: true }).fill(email);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await page.getByRole('button', { name: '가입하기', exact: true }).click();
    await expect(page).toHaveURL(/\/search$/, { timeout: 20_000 });
  } finally {
    await deleteUserByEmail(email);
  }
});

test('비회원은 /review 에서 로그인 폼만 본다', async ({ page }) => {
  await page.goto('/review');
  await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
  await expect(page.getByTestId('candidate-item')).toHaveCount(0);
  await expect(page.getByTestId('objection-item')).toHaveCount(0);
  await expect(page).toHaveURL(/\/review$/);
});

test('anon API 는 검색을 읽고 카탈로그 쓰기는 거부된다', async () => {
  const { url, anonKey } = sbEnv();
  const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const found = await anon.rpc('search_catalog', { p_query: '가상' });
  expect(found.error).toBeNull();
  const ids = (found.data ?? []).map((r) => r.id);
  expect(ids).toEqual(expect.arrayContaining(['sample-yy-do', 'sample-oo-si', 'sample-xx-gun']));

  const before = await countRows('official_catalog');
  const ins = await anon.from('official_catalog').insert({
    id: 'e2e-anon-denied',
    level: 'basic',
    office: '시장',
    person_name: '가상 침입',
    region_name: 'QQ시',
    source_url: 'https://example.org/x',
    term_start: '2026-07-01',
    term_end: '2030-06-30',
  });
  expect(ins.error).not.toBeNull();
  expect(await countRows('official_catalog')).toBe(before);
});

test.describe('랜딩', () => {
  test.use({ reducedMotion: 'reduce' });

  test('랜딩의 정치인 찾기 버튼은 로그인 없이 검색 화면으로 간다', async ({ page }) => {
    await page.goto('/');
    const link = page.getByTestId('intro-cta').getByRole('link', { name: '정치인 찾기', exact: true });
    await expect(link).toHaveAttribute('href', '/search');
    await settle(page);
    await shot(page, 'landing-public');
    await link.click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(box(page)).toBeVisible();
  });
});
