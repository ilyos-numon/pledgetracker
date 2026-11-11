import { expect, type Locator, type Page, test } from '@playwright/test';
import { FORBIDDEN_WORDS } from '../../src/core/dataset.ts';
import {
  ADMIN_CONTACT_EMAIL,
  AUTH_TEXT,
  FREE_REQUEST_TEXT,
  HOW_IT_WORKS,
  TOUR_NOTICE,
  TRACK_PAID_NOTICE,
  TRACK_REQUEST_NOTICE,
} from '../../src/core/membership.ts';
import { seedSample } from './helpers/db.ts';
import {
  countRows,
  createMember,
  deleteUserByEmail,
  newMemberCredentials,
  seedCatalogSample,
} from './helpers/members.ts';
import { shot } from './helpers/shot.ts';

test.beforeEach(async () => {
  await seedSample();
  await seedCatalogSample();
});

async function login(page: Page, email: string, password: string, next = '/search') {
  await page.goto(`/login?next=${next}`);
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace('/', '\\/')}$`));
}

async function search(page: Page, query: string) {
  await page.getByRole('textbox', { name: '검색어', exact: true }).fill(query);
  await page.getByRole('button', { name: '검색', exact: true }).click();
}

test.use({ reducedMotion: 'reduce' });

async function settled(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
}

test('비회원 둘러보기: 랜딩 5단계 → 검수 체험 → 결과, 전 과정 /rest/v1/ 요청 0', async ({ page }) => {
  const rest: string[] = [];
  const writes: string[] = [];
  page.on('request', (req) => {
    if (!req.url().includes('/rest/v1/')) return;
    rest.push(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) writes.push(`${req.method()} ${req.url()}`);
  });
  await page.goto('/');
  await expect(page.getByTestId('landing-hero')).toContainText('공약은 당선 다음 날부터 잊힌다.');
  await expect(page.locator('[data-testid^="how-step-"]')).toHaveCount(HOW_IT_WORKS.length);
  await expect(page.getByTestId('demo-badge')).toHaveCount(1);
  await expect(page.getByRole('link', { name: '대시보드 보기', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('intro-cta').getByRole('link', { name: '정치인 찾기', exact: true })).toHaveAttribute(
    'href',
    '/search',
  );
  await page.evaluate(() => document.fonts.ready);
  await shot(page, 'member-landing');

  // 소개 페이지의 숫자 카운터는 공개 읽기(GET·HEAD)만 한다. 체험부터는 요청이 0이어야 한다.
  await expect(page.getByTestId('intro-stat-officials')).toHaveAttribute('data-value', /^\d+$/);
  const landingRest = rest.length;
  await page.getByTestId('intro-cta').getByRole('link', { name: '검수 체험 해 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/tour$/);
  await expect(page.getByTestId('tour-notice')).toHaveText(TOUR_NOTICE);
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', 'candidates');

  const c1 = page.locator('[data-testid="tour-candidate"][data-candidate-id="tour-c1"]');
  await c1.getByRole('radio', { name: '진행 중', exact: true }).check();
  await c1.getByRole('textbox', { name: '이유', exact: true }).fill('예산 반영');
  await c1.getByRole('button', { name: '근거로 채택', exact: true }).click();
  await expect(c1).toContainText('채택됨');
  const c2 = page.locator('[data-testid="tour-candidate"][data-candidate-id="tour-c2"]');
  await c2.getByRole('button', { name: '무관', exact: true }).click();
  await expect(c2.getByText('무관', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '다음', exact: true }).click();

  await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', 'publish');
  await expect(page.getByTestId('tour-result')).toContainText('진행 중');
  await expect(page.getByTestId('tour-history-item')).toHaveCount(3);
  await expect(page.getByTestId('demo-badge')).toContainText('가상 데이터');
  await page.evaluate(() => document.fonts.ready);
  await shot(page, 'member-tour-result');
  expect(rest.slice(landingRest)).toEqual([]);
  expect(writes).toEqual([]);
});

test('비회원도 /search 에서 "OO시"를 검색해 공약 보기로 대시보드에 간다', async ({ page }) => {
  await page.goto('/search');
  await expect(page.getByTestId('search-form')).toBeVisible();
  await search(page, 'OO시');
  const row = page.locator('[data-testid="catalog-result"][data-catalog-id="sample-oo-si"]');
  await expect(row).toBeVisible();
  await row.getByTestId('open-dashboard').click();
  await expect(page).toHaveURL(/\/o\/sample-oo-si$/);
});

test('UI 가입 → 검색 → OO시 추적 중 → 공약 보기 → 대시보드 공약 12개', async ({ page }) => {
  const { email, password } = newMemberCredentials();
  try {
    await page.goto('/signup');
    await page.getByLabel('이메일', { exact: true }).fill(email);
    await page.getByLabel('비밀번호', { exact: true }).fill(password);
    await page.getByLabel('비밀번호 확인', { exact: true }).fill(password);
    await page.getByRole('button', { name: '가입하기', exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByTestId('nav-user')).toHaveText(email);

    await search(page, '가상');
    await expect(page.getByTestId('catalog-result')).toHaveCount(3);
    await expect(page.getByTestId('tracked-badge')).toHaveCount(1);
    await expect(page.getByTestId('track-start')).toHaveCount(2);
    const tracked = page.locator('[data-testid="catalog-result"][data-catalog-id="sample-oo-si"]');
    await expect(tracked).toHaveAttribute('data-tracked', 'true');
    await expect(tracked.getByTestId('tracked-badge')).toHaveText('추적 중');
    await page.evaluate(() => document.fonts.ready);
    await shot(page, 'member-search');

    await tracked.getByTestId('open-dashboard').click();
    await expect(page).toHaveURL(/\/o\/sample-oo-si$/);
    await expect(page.getByTestId('total-count')).toHaveText('공약 12개');
  } finally {
    await deleteUserByEmail(email);
  }
});

test('미추적 "추적 요청" → 문의 대화상자, officials·official_catalog 행 수 불변', async ({ page }) => {
  const member = await createMember();
  try {
    const officialsBefore = await countRows('officials');
    const catalogBefore = await countRows('official_catalog');
    await login(page, member.email, member.password);
    await search(page, '가상 군수');
    const row = page.locator('[data-testid="catalog-result"][data-catalog-id="sample-xx-gun"]');
    await expect(row).toHaveAttribute('data-tracked', 'false');
    await row.getByTestId('track-start').click();

    const dialog = page.getByTestId('track-request-dialog');
    await settled(dialog);
    await expect(dialog.getByTestId('track-request-notice')).toHaveText(TRACK_REQUEST_NOTICE);
    await expect(dialog.getByTestId('track-request-paid')).toHaveText(TRACK_PAID_NOTICE);
    await expect(dialog).toContainText('가상 군수 · XX군 · 군수');
    await expect(dialog.getByTestId('admin-contact')).toHaveText(`관리자 이메일: ${ADMIN_CONTACT_EMAIL}`);
    await page.evaluate(() => document.fonts.ready);
    await shot(page, 'member-track-request');

    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByTestId('track-request-dialog')).toHaveCount(0);
    expect(await countRows('officials')).toBe(officialsBefore);
    expect(await countRows('official_catalog')).toBe(catalogBefore);
  } finally {
    await member.cleanup();
  }
});

test('자유 입력: 빈 값이면 오류와 대화상자 없음, 채우면 대화상자', async ({ page }) => {
  const member = await createMember();
  try {
    await login(page, member.email, member.password);
    const form = page.getByTestId('free-request-form');
    const toggle = page.getByTestId('free-request-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(form).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: '추적 요청', exact: true }).click();
    await expect(form.getByText(FREE_REQUEST_TEXT.name_required, { exact: true })).toBeVisible();
    await expect(page.getByTestId('track-request-dialog')).toHaveCount(0);

    await form.getByLabel('이름', { exact: true }).fill('가상 구청장');
    await form.getByLabel('지역', { exact: true }).fill('ZZ구');
    await form.getByLabel('직위', { exact: true }).fill('구청장');
    await form.getByRole('button', { name: '추적 요청', exact: true }).click();
    const dialog = page.getByTestId('track-request-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('가상 구청장 · ZZ구 · 구청장');
  } finally {
    await member.cleanup();
  }
});

test('짧은 비밀번호로 가입하면 오류가 나고 /signup 에 머문다', async ({ page }) => {
  const { email } = newMemberCredentials();
  try {
    await page.goto('/signup');
    await page.getByLabel('이메일', { exact: true }).fill(email);
    await page.getByLabel('비밀번호', { exact: true }).fill('abc');
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('abc');
    await page.getByRole('button', { name: '가입하기', exact: true }).click();
    await expect(page.getByTestId('auth-error')).toHaveText(AUTH_TEXT.password_short);
    await expect(page).toHaveURL(/\/signup$/);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('회원으로 /review 를 열면 "검수 권한이 없습니다"', async ({ page }) => {
  const member = await createMember();
  try {
    await login(page, member.email, member.password, '/review');
    await expect(page.getByTestId('review-error')).toHaveText('검수 권한이 없습니다');
    await expect(page.getByTestId('candidate-item')).toHaveCount(0);
  } finally {
    await member.cleanup();
  }
});

test('주요 화면마다 데모 배지 1개, 본문에 금지어 없음', async ({ page }) => {
  const member = await createMember();
  try {
    const check = async (path: string) => {
      await page.goto(path);
      await expect(page.getByTestId('demo-badge'), path).toHaveCount(1);
      const text = (await page.locator('body').textContent()) ?? '';
      for (const w of FORBIDDEN_WORDS) expect(text, `${path} 에 "${w}"`).not.toContain(w);
    };
    for (const path of ['/', '/tour', '/signup', '/login']) await check(path);
    await login(page, member.email, member.password);
    await search(page, '가상');
    await expect(page.getByTestId('catalog-result')).toHaveCount(3);
    await expect(page.getByTestId('demo-badge')).toHaveCount(1);
    const text = (await page.locator('body').textContent()) ?? '';
    for (const w of FORBIDDEN_WORDS) expect(text, `/search 에 "${w}"`).not.toContain(w);
  } finally {
    await member.cleanup();
  }
});
