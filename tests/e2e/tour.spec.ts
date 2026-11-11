import { expect, type Page, test } from '@playwright/test';
import { HOW_IT_WORKS, TOUR_NOTICE } from '../../src/core/membership.ts';
import { SAMPLE_NOTICE } from '../../src/core/status.ts';
import { shot } from './helpers/shot.ts';

test.use({ reducedMotion: 'reduce' });

const REASON_REQUIRED = '상태를 바꾸려면 이유를 한 줄 적어 주세요';

function trackRest(page: Page): string[] {
  const hits: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/')) hits.push(req.url());
  });
  return hits;
}

async function goToCandidates(page: Page) {
  await page.goto('/tour');
  await expect(page.getByTestId('tour-notice')).toHaveText(TOUR_NOTICE);
  await expect(page.getByTestId('demo-badge')).toContainText(SAMPLE_NOTICE);
  await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', 'source');
  await expect(page.getByTestId('tour-source')).toContainText('OO역 환승주차장 건립');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', 'structure');
  const pledge = page.getByTestId('tour-pledge');
  await expect(pledge).toContainText('OO역 환승주차장 건립');
  await expect(pledge).toContainText('교통');
  await expect(pledge).toContainText('환승주차장');
  await expect(pledge).toContainText('미착수');
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', 'candidates');
  await expect(page.getByTestId('tour-candidate')).toHaveCount(2);
}

function candidate(page: Page, id: string) {
  return page.locator(`[data-testid="tour-candidate"][data-candidate-id="${id}"]`);
}

test('랜딩은 동작 5단계를 순서대로 보여 주고 CTA 링크 2개를 둔다', async ({ page }) => {
  const rest = trackRest(page);
  await page.goto('/');
  await expect(page.getByTestId('landing-hero')).toContainText('공약은 당선 다음 날부터 잊힌다.');
  await expect(page.getByTestId('demo-badge')).toHaveCount(1);
  const steps = page.locator('[data-testid^="how-step-"]');
  await expect(steps).toHaveCount(5);
  const ids = await steps.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')));
  expect(ids).toEqual(HOW_IT_WORKS.map((s) => `how-step-${s.key}`));
  for (const s of HOW_IT_WORKS) {
    await expect(page.getByTestId(`how-step-${s.key}`)).toContainText(s.title);
    await expect(page.getByTestId(`how-step-${s.key}`)).toContainText(s.body);
  }
  await expect(page.getByRole('link', { name: '대시보드 보기', exact: true })).toHaveCount(0);
  const cta = page.getByTestId('intro-cta');
  await expect(cta.getByRole('link', { name: '검수 체험 해 보기', exact: true })).toHaveAttribute('href', '/tour');
  await expect(cta.getByRole('link', { name: '정치인 찾기', exact: true })).toHaveAttribute('href', '/search');
  await shot(page, 'landing');
  // 소개 페이지의 숫자 카운터는 공개 읽기뿐이다. 체험으로 넘어간 뒤부터 요청이 0이어야 한다.
  await expect(page.getByTestId('intro-stat-officials')).toHaveAttribute('data-value', /^\d+$/);
  const landingRest = rest.length;
  await cta.getByRole('link', { name: '검수 체험 해 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/tour$/);
  expect(rest.slice(landingRest)).toEqual([]);
});

test('체험 성공 경로: 관련 후보 채택·진행 중, 무관 후보 넘김 → 결과와 이력', async ({ page }) => {
  const rest = trackRest(page);
  await goToCandidates(page);

  // 후보가 남아 있으면 다음으로 갈 수 없다
  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByTestId('tour-error')).toHaveText('후보를 모두 처리해 주세요');

  const c1 = candidate(page, 'tour-c1');
  await c1.getByRole('radio', { name: '진행 중', exact: true }).check();
  await c1.getByRole('textbox', { name: '이유', exact: true }).fill('예산 반영');
  await c1.getByRole('button', { name: '근거로 채택', exact: true }).click();
  await expect(c1).toContainText('채택됨');
  await expect(page.getByTestId('tour-error')).toHaveCount(0);

  const c2 = candidate(page, 'tour-c2');
  await c2.getByRole('button', { name: '무관', exact: true }).click();
  await expect(c2.getByText('무관', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '다음', exact: true }).click();
  await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', 'publish');
  const result = page.getByTestId('tour-result');
  await expect(result).toContainText('진행 중');
  await expect(page.getByTestId('tour-evidence-link')).toHaveCount(1);
  await expect(page.getByTestId('tour-evidence-link')).toHaveAttribute('href', 'https://example.org/tour/press-1');
  const history = page.getByTestId('tour-history-item');
  await expect(history).toHaveCount(3);
  await expect(history.nth(0)).toContainText('상태 변경');
  await expect(history.nth(0)).toContainText('예산 반영');
  await expect(history.nth(1)).toContainText('근거 추가');
  await expect(history.nth(2)).toContainText('데모 판정');
  await shot(page, 'tour-result');

  await page.getByRole('button', { name: '처음부터 다시', exact: true }).click();
  await expect(page.getByTestId('tour-step')).toHaveAttribute('data-step', 'source');
  expect(rest).toEqual([]);
});

test('체험 실패 경로: 이유 없이 진행 중으로 바꾸면 오류, 상태는 미착수 유지', async ({ page }) => {
  const rest = trackRest(page);
  await goToCandidates(page);
  const c1 = candidate(page, 'tour-c1');
  await c1.getByRole('radio', { name: '진행 중', exact: true }).check();
  await c1.getByRole('button', { name: '근거로 채택', exact: true }).click();
  await expect(page.getByTestId('tour-error')).toHaveText(REASON_REQUIRED);
  await expect(c1.getByRole('button', { name: '근거로 채택', exact: true })).toBeVisible();
  await expect(c1).not.toContainText('채택됨');
  await expect(page.getByTestId('tour-current-status')).toHaveText('미착수');
  expect(rest).toEqual([]);
});
