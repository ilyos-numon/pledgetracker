import { expect, type Page, test } from '@playwright/test';
import { FORBIDDEN_WORDS, type PledgeDataset } from '../../src/core/dataset.ts';
import { DEMO_NOTICE, SAMPLE_NOTICE, STATUS_ORDER } from '../../src/core/status.ts';
import { seedSample } from './helpers/db.ts';
import { shot } from './helpers/shot.ts';

let dataset: PledgeDataset;
let officialId: string;

test.beforeAll(async () => {
  const seeded = await seedSample();
  dataset = seeded.dataset;
  officialId = seeded.officialId;
});

async function expectNeutral(page: Page) {
  const text = (await page.locator('body').textContent()) ?? '';
  for (const w of FORBIDDEN_WORDS) expect(text, `금지어 "${w}"`).not.toContain(w);
}

test('대시보드: 머리글·카운트·비율 막대·데모 배지', async ({ page }) => {
  await page.goto(`/o/${officialId}`);
  const header = page.getByTestId('official-header');
  const o = dataset.official;
  await expect(header).toContainText(o.region_name);
  await expect(header).toContainText(o.office);
  await expect(header).toContainText(o.person_name);
  await expect(header).toContainText(o.term_start);
  await expect(header).toContainText(o.term_end);
  await expect(page.getByTestId('last-updated')).toContainText(/\d{4}-\d{2}-\d{2}/);

  await expect(page.getByTestId('total-count')).toHaveText('공약 12개');
  const expected = [2, 4, 4, 1, 1];
  for (const [i, s] of STATUS_ORDER.entries()) {
    await expect(page.getByTestId(`status-count-${s}`)).toHaveText(String(expected[i]));
    await expect(page.getByTestId(`status-row-${s}`).getByRole('progressbar')).toHaveCount(1);
  }
  await expect(page.getByTestId('pledge-card')).toHaveCount(12);

  const badge = page.getByTestId('demo-badge');
  await expect(badge).toHaveCount(1);
  await expect(badge).toContainText(DEMO_NOTICE);
  await expect(badge).toContainText(SAMPLE_NOTICE);
  await expectNeutral(page);
  await shot(page, 'public-dashboard');
});

test('폐기 카운트를 누르면 status=abandoned 로 1장만 보인다', async ({ page }) => {
  await page.goto(`/o/${officialId}`);
  await page.getByTestId('status-count-abandoned').click();
  await expect(page).toHaveURL(/[?&]status=abandoned/);
  const cards = page.getByTestId('pledge-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByTestId('pledge-status')).toHaveText('폐기');
});

test('분야 탭 교통을 누르면 3장이 보인다', async ({ page }) => {
  await page.goto(`/o/${officialId}`);
  await expect(page.getByTestId('category-tab-all')).toBeVisible();
  await page.getByTestId('category-tab-교통').click();
  await expect(page).toHaveURL(/[?&]category=/);
  await expect(page.getByTestId('pledge-card')).toHaveCount(3);
  for (const id of await page.getByTestId('pledge-card').evaluateAll((els) => els.map((e) => e.dataset.pledgeId))) {
    expect(dataset.pledges.find((p) => p.id === id)?.category).toBe('교통');
  }
});

test('카드의 근거 링크 href 가 데이터와 같고, 근거 없는 카드는 "근거: 아직 없음"', async ({ page }) => {
  await page.goto(`/o/${officialId}`);
  await expect(page.getByTestId('pledge-card')).toHaveCount(12);
  for (const p of dataset.pledges) {
    const card = page.locator(`[data-testid="pledge-card"][data-pledge-id="${p.id}"]`);
    const links = card.getByTestId('evidence-link');
    if (p.evidence.length === 0) {
      await expect(links).toHaveCount(0);
      await expect(card.getByTestId('no-evidence')).toHaveText('근거: 아직 없음');
      continue;
    }
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.sort()).toEqual(p.evidence.map((e) => e.url).sort());
    await expect(links.first()).toHaveAttribute('target', '_blank');
    await expect(links.first()).toHaveAttribute('rel', /noopener/);
  }
  const p001 = page.locator('[data-testid="pledge-card"][data-pledge-id="sample-oo-si-p001"]');
  await expect(p001.getByTestId('objection-link')).toHaveAttribute(
    'href',
    `/o/${officialId}/objection?pledge=sample-oo-si-p001`,
  );
});

test('공유 링크를 새 context 에서 열면 같은 제목·상태·근거가 보인다', async ({ page, browser }) => {
  await page.goto(`/o/${officialId}`);
  const target = dataset.pledges.find((p) => p.evidence.length > 0 && p.status === 'abandoned');
  if (!target) throw new Error('sample has no abandoned pledge with evidence');
  const card = page.locator(`[data-testid="pledge-card"][data-pledge-id="${target.id}"]`);
  const title = (await card.getByRole('heading').textContent())?.trim() ?? '';
  const status = (await card.getByTestId('pledge-status').textContent())?.trim() ?? '';
  const hrefs = await card.getByTestId('evidence-link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));

  await card.getByTestId('share-button').click();
  const shareInput = card.getByTestId('share-url');
  await expect(shareInput).toBeVisible();
  const url = await shareInput.inputValue();
  expect(url).toMatch(/^https?:\/\//);
  expect(new URL(url).pathname).toBe(`/o/${officialId}/p/${target.id}`);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

  const ctx = await browser.newContext();
  try {
    const other = await ctx.newPage();
    await other.goto(url);
    const shared = other.getByTestId('pledge-card');
    await expect(shared).toHaveCount(1);
    await expect(shared.getByRole('heading')).toHaveText(title);
    await expect(shared.getByTestId('pledge-status')).toHaveText(status);
    const sharedHrefs = await shared
      .getByTestId('evidence-link')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(sharedHrefs).toEqual(hrefs);
    await expect(other.getByTestId('history-item').first()).toBeVisible();
    await expect(other.getByTestId('demo-badge')).toHaveCount(1);
    await expectNeutral(other);
  } finally {
    await ctx.close();
  }
});

test('상세 화면: 변경 이력과 스크린샷', async ({ page }) => {
  const target = dataset.pledges.find((p) => p.evidence.length > 0 && p.status !== 'not_started');
  if (!target) throw new Error('sample has no decided pledge');
  await page.goto(`/o/${officialId}`);
  await page
    .locator(`[data-testid="pledge-card"][data-pledge-id="${target.id}"]`)
    .getByRole('link', { name: '변경 이력 보기' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/o/${officialId}/p/${target.id}$`));
  await expect(page.getByTestId('pledge-card')).toHaveCount(1);
  const items = page.getByTestId('history-item');
  await expect(items.first()).toBeVisible();
  await expect(items.first()).toContainText('데모 판정');
  await expect(page.getByTestId('demo-badge')).toHaveCount(1);
  await shot(page, 'public-detail');
});

test('없는 공약 id 는 "공약을 찾을 수 없습니다" 와 목록 링크', async ({ page }) => {
  await page.goto(`/o/${officialId}/p/${officialId}-p999`);
  await expect(page.getByRole('heading', { name: '공약을 찾을 수 없습니다' })).toBeVisible();
  await page.getByRole('link', { name: '공약 목록으로' }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${officialId}$`));
  await expect(page.getByTestId('total-count')).toHaveText('공약 12개');
});

test('판정 기준 보기 → 다섯 상태 heading 과 규칙', async ({ page }) => {
  await page.goto(`/o/${officialId}`);
  await page.getByRole('link', { name: '판정 기준 보기' }).click();
  await expect(page).toHaveURL(/\/criteria$/);
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['미착수', '진행 중', '이행', '변경', '폐기']);
  for (const s of STATUS_ORDER) await expect(page.getByTestId(`criteria-status-${s}`)).toHaveCount(1);
  await expect(page.getByTestId('criteria-rule').filter({ hasText: '근거가 없으면 미착수로 둔다' })).toHaveCount(1);
  await expect(page.getByTestId('demo-badge')).toHaveCount(1);
  await expectNeutral(page);
  await shot(page, 'public-criteria');
});
