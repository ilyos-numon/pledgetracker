import { type Browser, expect, type Page, test } from '@playwright/test';
import { seedSample } from './helpers/db.ts';
import { createMember } from './helpers/members.ts';
import { shot } from './helpers/shot.ts';

const SAMPLE_OFFICIAL = 'sample-oo-si';
const NAV_KEYS = ['nav-search', 'nav-tour', 'nav-criteria'] as const;

let member: Awaited<ReturnType<typeof createMember>>;

test.beforeAll(async ({ browser, baseURL }) => {
  await seedSample();
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

// 로그아웃 테스트는 전역 로그아웃으로 다른 테스트의 세션을 무효화하므로 자기 회원·로그인을 따로 쓴다.
async function loginOwn(page: Page, browser: Browser, baseURL: string | undefined) {
  const own = await createMember();
  try {
    await applySession(page, await loginOnce(browser, baseURL, own));
  } catch (e) {
    await own.cleanup();
    throw e;
  }
  return own;
}

async function login(page: Page) {
  await applySession(page);
  await page.goto('/search');
  await expect(page.getByTestId('nav-user')).toHaveText(member.email);
}

async function settled(page: Page, locator: ReturnType<Page['locator']>) {
  await expect(locator).toHaveCSS('opacity', '1');
  await page.evaluate(() => document.fonts.ready);
}

test.describe('데스크톱 머리글', () => {
  test('비회원 — 메뉴 3개 순서, 로그인·가입 링크, 로그아웃 없음', async ({ page }) => {
    await page.goto('/criteria');
    const header = page.getByTestId('site-header');
    await expect(header.getByTestId('nav-logo')).toHaveText('공약추적기');
    await expect(header.getByTestId('nav-logo')).toHaveAttribute('href', '/');
    const links = header.getByRole('navigation', { name: '주 메뉴' }).getByRole('link');
    await expect(links).toHaveText(['정치인 찾기', '둘러보기', '판정 기준']);
    await expect(page.getByTestId('nav-dashboard')).toHaveCount(0);
    await expect(header.locator('a[href^="/o/"]')).toHaveCount(0);
    await expect(page.getByTestId('nav-search')).toHaveAttribute('href', '/search');
    await expect(page.getByTestId('nav-tour')).toHaveAttribute('href', '/tour');
    await expect(page.getByTestId('nav-criteria')).toHaveAttribute('href', '/criteria');
    await expect(page.getByRole('link', { name: '로그인', exact: true })).toHaveAttribute('href', '/login');
    await expect(page.getByRole('link', { name: '가입', exact: true })).toHaveAttribute('href', '/signup');
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(0);
    await expect(page.getByTestId('nav-burger')).toBeHidden();
    await shot(page, 'nav-desktop-guest');
  });

  test('현재 메뉴만 aria-current — /criteria·/tour·/search·/o/... 와 표시 없는 경로', async ({ page }) => {
    const cases: Array<[string, (typeof NAV_KEYS)[number] | null]> = [
      ['/criteria', 'nav-criteria'],
      ['/tour', 'nav-tour'],
      ['/search', 'nav-search'],
      [`/o/${SAMPLE_OFFICIAL}`, 'nav-search'],
      ['/login', null],
    ];
    for (const [path, active] of cases) {
      await page.goto(path);
      await expect(page.getByTestId('nav-criteria')).toBeVisible();
      for (const key of NAV_KEYS) {
        const link = page.getByTestId(key);
        if (key === active) await expect(link).toHaveAttribute('aria-current', 'page');
        else await expect(link).not.toHaveAttribute('aria-current', /.*/);
      }
    }
  });

  test('정치인 찾기 → 추적 중인 표 → 정치인 대시보드, 현재 표시 유지', async ({ page }) => {
    await page.goto('/criteria');
    await page.getByTestId('nav-search').click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByTestId('tracked-table')).toBeVisible();
    await page.getByTestId('tracked-name').first().click();
    await expect(page).toHaveURL(/\/o\/[^/]+$/);
    await expect(page.getByTestId('nav-search')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('nav-criteria')).not.toHaveAttribute('aria-current', /.*/);
  });

  test('회원 — 이메일 전체가 DOM 에 있고, 로그아웃 버튼은 머리글에 1개, 가입·로그인 링크 없음', async ({ page }) => {
    await login(page);
    const header = page.getByTestId('site-header');
    await expect(page.getByTestId('nav-user')).toHaveText(member.email);
    await expect(page.getByTestId('nav-login')).toHaveCount(0);
    await expect(page.getByTestId('nav-signup')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toHaveCount(1);
    await expect(header.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await shot(page, 'nav-desktop-member');
  });

  test('/review 에서도 보이는 로그아웃 버튼은 머리글의 1개뿐', async ({ page }) => {
    await applySession(page);
    await page.goto('/review');
    await expect(page.getByTestId('nav-user')).toHaveText(member.email);
    const logout = page.getByRole('button', { name: '로그아웃', exact: true });
    await expect(logout).toHaveCount(1);
    await expect(page.getByTestId('site-header').getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    await shot(page, 'nav-review-member');
  });

  test('머리글 로그아웃 → / 로 가고 로그인 링크가 다시 보인다', async ({ page, browser, baseURL }) => {
    const own = await loginOwn(page, browser, baseURL);
    try {
      await page.goto('/search');
      await expect(page.getByTestId('nav-user')).toHaveText(own.email);
      await page.getByTestId('nav-logout').click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId('nav-login')).toBeVisible();
      await expect(page.getByTestId('nav-user')).toHaveCount(0);
    } finally {
      await own.cleanup();
    }
  });
});

test.describe('모바일 머리글 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('☰ 버튼만 보이고 메뉴·계정 영역은 숨김, 가로 스크롤 없음', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByTestId('nav-burger')).toBeVisible();
    await expect(page.getByTestId('nav-burger')).toHaveAccessibleName('메뉴 열기');
    await expect(page.getByTestId('nav-search')).toBeHidden();
    await expect(page.getByTestId('nav-login')).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('비회원 Drawer — 메뉴 3개·로그인·가입, 링크를 누르면 닫히고 이동', async ({ page }) => {
    await page.goto('/search');
    await page.getByTestId('nav-burger').click();
    const drawer = page.getByRole('dialog', { name: '메뉴' });
    await expect(drawer).toBeVisible();
    await settled(page, page.locator('.mantine-Drawer-content'));
    for (const key of NAV_KEYS) await expect(page.getByTestId(`drawer-${key}`)).toBeVisible();
    await expect(page.getByTestId('drawer-nav-dashboard')).toHaveCount(0);
    await expect(page.getByTestId('drawer-nav-search')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('drawer-nav-tour')).not.toHaveAttribute('aria-current', /.*/);
    await expect(page.getByTestId('drawer-login')).toHaveAttribute('href', '/login');
    await expect(page.getByTestId('drawer-signup')).toHaveAttribute('href', '/signup');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, 'nav-mobile-drawer');

    await page.getByTestId('drawer-nav-criteria').click();
    await expect(page).toHaveURL(/\/criteria$/);
    await expect(page.getByTestId('drawer-nav-criteria')).toHaveCount(0);
    await expect(page.getByTestId('nav-burger')).toBeVisible();
  });

  test('회원 Drawer — 이메일과 로그아웃, 누르면 / 로 이동', async ({ page, browser, baseURL }) => {
    const own = await loginOwn(page, browser, baseURL);
    try {
      await page.goto('/search');
      await page.getByTestId('nav-burger').click();
      await expect(page.getByTestId('drawer-user')).toHaveText(own.email);
      await expect(page.getByTestId('drawer-login')).toHaveCount(0);
      await page.getByTestId('drawer-logout').click();
      await expect(page).toHaveURL(/\/$/);
      await page.getByTestId('nav-burger').click();
      await expect(page.getByTestId('drawer-login')).toBeVisible();
    } finally {
      await own.cleanup();
    }
  });
});
