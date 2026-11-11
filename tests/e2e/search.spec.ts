import { expect, type Page, test } from '@playwright/test';
import {
  ADMIN_CONTACT_EMAIL,
  FREE_REQUEST_TEXT,
  GUEST_SEARCH_NOTE,
  SEARCH_EMPTY_TEXT,
  SEARCH_ERROR_TEXT,
  TRACK_BUTTON_LABEL,
  TRACK_PAID_HINT,
  TRACK_PAID_NOTICE,
  TRACK_REQUEST_NOTICE,
} from '../../src/core/membership.ts';
import { seedSample } from './helpers/db.ts';
import { countRows, createMember, seedCatalogSample } from './helpers/members.ts';
import { shot } from './helpers/shot.ts';

// 캡처 직전: 애니메이션 종료 + 웹폰트 로드를 기다린다(고정 sleep 없음).
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => document.fonts.ready);
}

let member: Awaited<ReturnType<typeof createMember>>;

test.beforeAll(async () => {
  await seedSample();
  await seedCatalogSample();
  member = await createMember();
});

test.afterAll(async () => {
  await member?.cleanup();
});

// 기존 로그인 화면(supabase-js signInWithPassword)으로 로그인한 뒤 /search 로 간다.
async function loginAndOpenSearch(page: Page) {
  await page.goto('/review');
  await page.getByLabel('이메일', { exact: true }).fill(member.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(member.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByTestId('review-error')).toHaveText('검수 권한이 없습니다');
  await page.goto('/search');
  await expect(page.getByTestId('search-form')).toBeVisible();
  await expect(page.getByTestId('nav-user')).toHaveText(member.email);
}

async function search(page: Page, query: string) {
  await page.getByRole('textbox', { name: '검색어', exact: true }).fill(query);
  await page.getByRole('button', { name: '검색', exact: true }).click();
}

test('비회원도 검색 폼이 보이고 "가상" 검색 결과 3행이 나온다', async ({ page }) => {
  await page.goto('/search');
  await expect(page.getByTestId('guest-note')).toHaveText(GUEST_SEARCH_NOTE);
  await expect(page.getByTestId('search-form')).toBeVisible();
  await expect(page.getByTestId('member-only')).toHaveCount(0);
  await search(page, '가상');
  await expect(page.getByTestId('catalog-result')).toHaveCount(3);
});

test('"가상" 검색 → 샘플 3행, OO시만 추적 중이고 공약 보기로 대시보드에 간다', async ({ page }) => {
  await loginAndOpenSearch(page);
  await search(page, '가상');
  const rows = page.getByTestId('catalog-result');
  await expect(rows).toHaveCount(3);

  const tracked = page.locator('[data-testid="catalog-result"][data-catalog-id="sample-oo-si"]');
  await expect(tracked).toHaveAttribute('data-tracked', 'true');
  await expect(tracked.getByTestId('tracked-badge')).toHaveText('추적 중');
  await expect(tracked).toContainText('가상 당선자');
  await expect(tracked).toContainText('OO시 · 시장');
  await expect(tracked).toContainText('임기 2026-07-01 ~ 2030-06-30');
  await expect(tracked).toContainText('가상 데이터');
  await expect(tracked.getByTestId('track-start')).toHaveCount(0);

  for (const id of ['sample-xx-gun', 'sample-yy-do']) {
    const row = page.locator(`[data-testid="catalog-result"][data-catalog-id="${id}"]`);
    await expect(row).toHaveAttribute('data-tracked', 'false');
    await expect(row.getByTestId('track-start')).toHaveText(TRACK_BUTTON_LABEL);
    await expect(row.getByTestId('track-paid-hint')).toHaveText(TRACK_PAID_HINT);
    await expect(row.getByTestId('tracked-badge')).toHaveCount(0);
    await expect(row.getByTestId('open-dashboard')).toHaveCount(0);
  }
  await shot(page, 'search');

  await tracked.getByTestId('open-dashboard').click();
  await expect(page).toHaveURL(/\/o\/sample-oo-si$/);
  await expect(page.getByTestId('total-count')).toHaveText('공약 12개');
});

test('미추적 "추적 요청" → 관리자 문의 대화상자, 아무것도 저장하지 않는다', async ({ page }) => {
  const officialsBefore = await countRows('officials');
  const catalogBefore = await countRows('official_catalog');
  await loginAndOpenSearch(page);
  await search(page, '가상 군수');
  const row = page.locator('[data-testid="catalog-result"][data-catalog-id="sample-xx-gun"]');
  await row.getByTestId('track-start').click();

  const dialog = page.getByTestId('track-request-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('추적 요청');
  await expect(dialog.getByTestId('track-request-notice')).toHaveText(TRACK_REQUEST_NOTICE);
  await expect(dialog.getByTestId('track-request-paid')).toHaveText(TRACK_PAID_NOTICE);
  await expect(dialog).toContainText('가상 군수 · XX군 · 군수');
  const contact = dialog.getByTestId('admin-contact');
  await expect(contact).toHaveAttribute('href', `mailto:${ADMIN_CONTACT_EMAIL}`);
  await expect(contact).toHaveText(`관리자 이메일: ${ADMIN_CONTACT_EMAIL}`);
  await expect.poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  await settle(page);
  await shot(page, 'track-request');

  await dialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(page.getByTestId('track-request-dialog')).toHaveCount(0);
  expect(await countRows('officials')).toBe(officialsBefore);
  expect(await countRows('official_catalog')).toBe(catalogBefore);
});

test('목록에 없는 이름 → search-empty', async ({ page }) => {
  await loginAndOpenSearch(page);
  await search(page, '없는이름zq');
  await expect(page.getByTestId('search-empty')).toHaveText(SEARCH_EMPTY_TEXT);
  await expect(page.getByTestId('catalog-result')).toHaveCount(0);
});

test('빈 검색어는 바로 query_required, 40자 초과는 서버 오류 문구', async ({ page }) => {
  await loginAndOpenSearch(page);
  await search(page, '   ');
  await expect(page.getByTestId('search-error')).toHaveText(SEARCH_ERROR_TEXT.query_required);
  await expect(page.getByTestId('catalog-result')).toHaveCount(0);

  await search(page, '가'.repeat(41));
  await expect(page.getByTestId('search-error')).toHaveText(SEARCH_ERROR_TEXT.query_too_long);
});

test('자유 입력 — 빈 값이면 오류 3개·대화상자 없음, 채우면 대화상자', async ({ page }) => {
  await loginAndOpenSearch(page);
  const form = page.getByTestId('free-request-form');
  const toggle = page.getByTestId('free-request-toggle');
  await expect(toggle).toHaveText(FREE_REQUEST_TEXT.toggle);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(form).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(form).toBeVisible();
  await expect(form).toContainText(FREE_REQUEST_TEXT.title);
  await form.getByRole('button', { name: '추적 요청', exact: true }).click();
  await expect(form.getByText(FREE_REQUEST_TEXT.name_required, { exact: true })).toBeVisible();
  await expect(form.getByText(FREE_REQUEST_TEXT.region_required, { exact: true })).toBeVisible();
  await expect(form.getByText(FREE_REQUEST_TEXT.office_required, { exact: true })).toBeVisible();
  await expect(page.getByTestId('track-request-dialog')).toHaveCount(0);

  await form.getByLabel('이름', { exact: true }).fill('가상 구청장');
  await form.getByLabel('지역', { exact: true }).fill('ZZ구');
  await form.getByLabel('직위', { exact: true }).fill('구청장');
  await form.getByRole('button', { name: '추적 요청', exact: true }).click();
  const dialog = page.getByTestId('track-request-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('가상 구청장 · ZZ구 · 구청장');
  await expect(dialog.getByTestId('admin-contact')).toHaveAttribute('href', `mailto:${ADMIN_CONTACT_EMAIL}`);
});
