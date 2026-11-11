import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { ADMIN_CONTACT_EMAIL, HOW_IT_WORKS } from '../../src/core/membership.ts';
import { formatCount, INTRO_TEXT, isListedOfficial } from '../../src/core/tracked.ts';
import { sbEnv, seedSample } from './helpers/db.ts';
import { shot } from './helpers/shot.ts';

// 기대값은 anon 키로 직접 센다. 등재 규칙(is_sample·e2e 제외)은 isListedOfficial 을 따른다.
async function pagedIds(table: 'pledges' | 'evidence', cols: string): Promise<Record<string, string>[]> {
  const { url, anonKey } = sbEnv();
  const db = createClient(url, anonKey);
  const out: Record<string, string>[] = [];
  for (let from = 0; ; from += 1000) {
    const res = await db
      .from(table)
      .select(cols)
      .order('id')
      .range(from, from + 999);
    if (res.error) throw new Error(`${table}: ${res.error.message}`);
    const page = res.data as unknown as Record<string, string>[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

async function expectedStats() {
  const { url, anonKey } = sbEnv();
  const db = createClient(url, anonKey);
  const offs = await db.from('officials').select('id, is_sample');
  if (offs.error) throw new Error(offs.error.message);
  const ids = new Set(offs.data.filter((o) => isListedOfficial(o)).map((o) => o.id));
  const pledges = (await pagedIds('pledges', 'id, official_id')).filter((p) => ids.has(p.official_id));
  const pledgeIds = new Set(pledges.map((p) => p.id));
  const evidence = (await pagedIds('evidence', 'id, pledge_id')).filter((e) => pledgeIds.has(e.pledge_id));
  return { officials: ids.size, pledges: pledges.length, evidence: evidence.length };
}

async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'));
  await page.evaluate(() => document.fonts.ready);
}

test.beforeAll(async () => {
  await seedSample(); // 샘플이 있어도 카운터에서 빠져야 한다
});

test.describe('소개 페이지 (모션 줄임)', () => {
  test.use({ reducedMotion: 'reduce' });

  test('섹션·단계·카운터·연락처·CTA 가 보이고 카운터는 DB 집계와 같다', async ({ page }) => {
    const want = await expectedStats();
    await page.goto('/');

    await expect(
      page.getByTestId('landing-hero').getByRole('heading', { level: 1, name: INTRO_TEXT.slogan }),
    ).toBeVisible();

    const steps = page.locator('[data-testid^="how-step-"]');
    await expect(steps).toHaveCount(HOW_IT_WORKS.length);
    for (const [i, step] of HOW_IT_WORKS.entries()) {
      await expect(steps.nth(i)).toHaveAttribute('data-testid', `how-step-${step.key}`);
      await expect(steps.nth(i)).toHaveAttribute('data-state', 'on');
    }

    for (const key of ['officials', 'pledges', 'evidence'] as const) {
      const el = page.getByTestId(`intro-stat-${key}`);
      await expect(el).toHaveAttribute('data-value', String(want[key]));
      await expect(el).toHaveText(formatCount(want[key]));
    }
    await expect(page.getByTestId('intro-stats-error')).toHaveCount(0);

    const contact = page.getByTestId('intro-contact');
    await expect(contact).toContainText(`관리자 이메일: ${ADMIN_CONTACT_EMAIL}`);
    await expect(contact.locator(`a[href="mailto:${ADMIN_CONTACT_EMAIL}"]`)).toHaveCount(1);

    const cta = page.getByTestId('intro-cta');
    await expect(cta.getByRole('link', { name: INTRO_TEXT.ctaSearch })).toHaveAttribute('href', '/search');
    await expect(cta.getByRole('link', { name: INTRO_TEXT.ctaTour })).toHaveAttribute('href', '/tour');
    await expect(page.locator('a[href^="/o/"]')).toHaveCount(0);

    await settle(page);
    await shot(page, 'intro-desktop');
  });

  test('390px 에서 가로 스크롤이 없다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('intro-stat-officials')).toHaveAttribute('data-value', /^\d+$/);
    await settle(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await shot(page, 'intro-mobile');
  });

  test('CTA [정치인 찾기] → /search', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('intro-cta').getByRole('link', { name: INTRO_TEXT.ctaSearch }).click();
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByRole('heading', { level: 1, name: '정치인 찾기' })).toBeVisible();
  });

  test('CTA [검수 체험 해 보기] → /tour', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('intro-cta').getByRole('link', { name: INTRO_TEXT.ctaTour }).click();
    await expect(page).toHaveURL(/\/tour$/);
  });

  test('실패 경로 — 집계 요청이 실패하면 오류 문구와 "—" 를 보이고 CTA 는 동작한다', async ({ page }) => {
    await page.route(/\/rest\/v1\/officials(\?|$)/, (r) =>
      r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
    );
    await page.goto('/');
    await expect(page.getByTestId('intro-stats-error')).toHaveText(INTRO_TEXT.statsError);
    for (const key of ['officials', 'pledges', 'evidence']) {
      await expect(page.getByTestId(`intro-stat-${key}`)).toHaveText('—');
    }
    await page.getByTestId('intro-cta').getByRole('link', { name: INTRO_TEXT.ctaSearch }).click();
    await expect(page).toHaveURL(/\/search$/);
  });

  test('실패 경로 — 집계 요청이 끊기면(abort) 무한 대기 없이 오류 문구를 보인다', async ({ page }) => {
    // supabase-js 는 네트워크 오류 GET 을 1·2·4초 간격으로 3번 재시도한 뒤 오류를 낸다(약 8초). 기본 5초로는 부족하다.
    await page.route(/\/rest\/v1\/officials(\?|$)/, (r) => r.abort());
    await page.goto('/');
    await expect(page.getByTestId('intro-stats-error')).toHaveText(INTRO_TEXT.statsError, { timeout: 15_000 });
    for (const key of ['officials', 'pledges', 'evidence']) {
      await expect(page.getByTestId(`intro-stat-${key}`)).toHaveText('—');
    }
  });
});

test.describe('소개 페이지 (일반 모션)', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('스크롤하면 단계가 차례로 켜지고 카운터가 최종값에 도달한다', async ({ page }) => {
    const want = await expectedStats();
    await page.goto('/');
    const last = page.getByTestId(`how-step-${HOW_IT_WORKS[HOW_IT_WORKS.length - 1].key}`);
    await expect(last).toHaveAttribute('data-state', 'off');

    // 마우스 휠로 내려가며 마지막 단계가 켜질 때까지 반복한다.
    await page.mouse.move(600, 400);
    await expect(async () => {
      await page.mouse.wheel(0, 500);
      await expect(last).toHaveAttribute('data-state', 'on', { timeout: 500 });
    }).toPass({ timeout: 60_000 });

    await page.getByTestId('intro-cta').scrollIntoViewIfNeeded();
    for (const step of HOW_IT_WORKS) {
      await expect(page.getByTestId(`how-step-${step.key}`)).toHaveAttribute('data-state', 'on');
    }
    for (const key of ['officials', 'pledges', 'evidence'] as const) {
      await expect(page.getByTestId(`intro-stat-${key}`)).toHaveText(formatCount(want[key]));
    }
    await settle(page);
    await page.getByTestId('intro-steps').scrollIntoViewIfNeeded();
    await settle(page);
    await shot(page, 'intro-steps-motion');
  });
});
