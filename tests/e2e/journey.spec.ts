import { readdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import type { PledgeDataset } from '../../src/core/dataset.ts';
import { countByCategory, countByStatus, STATUS_ORDER } from '../../src/core/status.ts';
import { admin, createReviewer, insertCandidate, readDataset, seedCopy } from './helpers/db.ts';
import { shot } from './helpers/shot.ts';

const PLEDGE_DIR = 'data/pledges';
const files = readdirSync(PLEDGE_DIR).filter((f) => f.endsWith('.json'));
if (files.length !== 1) throw new Error(`${PLEDGE_DIR} 에는 파일이 하나여야 합니다: ${files.join(',')}`);
const REAL_PATH = `${PLEDGE_DIR}/${files[0]}`;

type Copy = Awaited<ReturnType<typeof seedCopy>>;
type Reviewer = Awaited<ReturnType<typeof createReviewer>>;

let dataset: PledgeDataset;
let copy: Copy;

test.beforeEach(async () => {
  dataset = await readDataset(REAL_PATH);
  copy = await seedCopy(dataset);
});

test.afterEach(async () => {
  await copy.cleanup();
});

function card(page: Page, pledgeId: string) {
  return page.locator(`[data-testid="pledge-card"][data-pledge-id="${pledgeId}"]`);
}

async function login(page: Page, reviewer: Reviewer) {
  await page.goto('/review');
  await page.getByLabel('이메일').fill(reviewer.email);
  await page.getByLabel('비밀번호').fill(reviewer.password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test('시나리오 1: 대시보드 카운트·분야 탭·카드 근거 링크가 데이터와 같다', async ({ page }) => {
  await page.goto(`/o/${copy.officialId}`);
  await expect(page.getByTestId('total-count')).toHaveText(`공약 ${dataset.pledges.length}개`);
  const counts = countByStatus(dataset.pledges);
  for (const s of STATUS_ORDER) await expect(page.getByTestId(`status-count-${s}`)).toHaveText(String(counts[s]));
  await expect(page.getByTestId('pledge-card')).toHaveCount(dataset.pledges.length);
  await shot(page, 'journey-dashboard');

  const [category, n] = Object.entries(countByCategory(dataset.pledges))[0] as [string, number];
  await page.getByTestId(`category-tab-${category}`).click();
  await expect(page).toHaveURL(/[?&]category=/);
  await expect(page.getByTestId('pledge-card')).toHaveCount(n);
  await page.getByTestId('category-tab-all').click();
  await expect(page.getByTestId('pledge-card')).toHaveCount(dataset.pledges.length);

  for (const p of dataset.pledges) {
    const links = card(page, `${copy.prefix}${p.id}`).getByTestId('evidence-link');
    const hrefs = await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.sort(), p.id).toEqual(p.evidence.map((e) => e.url).sort());
  }
});

test('시나리오 2: 진행 중 필터 URL 을 새 context 에서 열면 같은 목록이다', async ({ page, browser }) => {
  const expected = dataset.pledges.filter((p) => p.status === 'in_progress');
  expect(expected.length).toBeGreaterThan(0);
  await page.goto(`/o/${copy.officialId}`);
  await page.getByTestId('status-count-in_progress').click();
  await expect(page).toHaveURL(/[?&]status=in_progress/);
  const cards = page.getByTestId('pledge-card');
  await expect(cards).toHaveCount(expected.length);
  const ids = await cards.evaluateAll((els) => els.map((e) => e.dataset.pledgeId).sort());
  expect(ids).toEqual(expected.map((p) => `${copy.prefix}${p.id}`).sort());
  for (const s of await cards.getByTestId('pledge-status').allTextContents()) expect(s.trim()).toBe('진행 중');

  const ctx = await browser.newContext();
  try {
    const other = await ctx.newPage();
    await other.goto(page.url());
    await expect(other.getByTestId('pledge-card')).toHaveCount(expected.length);
    const otherIds = await other
      .getByTestId('pledge-card')
      .evaluateAll((els) => els.map((e) => e.dataset.pledgeId).sort());
    expect(otherIds).toEqual(ids);
  } finally {
    await ctx.close();
  }
});

test('시나리오 3: 후보 채택으로 미착수→진행 중 변경이 공개 이력에 남는다 (이유 없으면 막힘)', async ({
  page,
  browser,
}) => {
  const target = dataset.pledges.find((p) => p.status === 'not_started' && p.evidence.length === 0);
  if (!target) throw new Error('데이터에 근거 없는 미착수 공약이 없습니다');
  const pledgeId = `${copy.prefix}${target.id}`;
  const reviewer = await createReviewer();
  try {
    const candidateId = await insertCandidate({
      pledge_id: pledgeId,
      title: '관련 예산 반영 보도',
      url: 'https://example.org/press/journey-budget',
      matched_keywords: ['예산'],
    });
    await login(page, reviewer);
    const item = page.locator(`[data-testid="candidate-item"][data-candidate-id="${candidateId}"]`);
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: '근거로 채택' }).click();
    const group = item.getByRole('radiogroup', { name: '상태 변경' });
    await group.getByRole('radio', { name: '진행 중' }).check();
    await expect(group.getByRole('radio', { name: '진행 중' })).toBeChecked();
    await expect(group.getByRole('radio', { name: '유지' })).not.toBeChecked();
    await shot(page, 'journey-review');

    // 실패 경로: 이유 없이 상태 변경
    await item.getByRole('button', { name: '확정' }).click();
    await expect(item).toContainText('상태를 바꾸려면 이유를 한 줄 적어 주세요');

    await item.getByRole('textbox', { name: '이유' }).fill('예산 반영 확인');
    await item.getByRole('button', { name: '확정' }).click();
    await expect(item).toHaveCount(0);

    const ctx = await browser.newContext();
    try {
      const pub = await ctx.newPage();
      await pub.goto(`/o/${copy.officialId}/p/${pledgeId}`);
      await expect(pub.getByTestId('pledge-status')).toHaveText('진행 중');
      const history = pub.getByTestId('history-item');
      await expect(history.filter({ hasText: '미착수 → 진행 중' })).toHaveCount(1);
      await expect(history.filter({ hasText: '예산 반영 확인' })).toHaveCount(1);
      await expect(pub.getByTestId('evidence-link')).toHaveAttribute(
        'href',
        'https://example.org/press/journey-budget',
      );
      await shot(pub, 'journey-history');
      await shot(pub, 'journey-detail');
    } finally {
      await ctx.close();
    }
  } finally {
    await reviewer.cleanup();
  }
});

test('시나리오 4: 이의 제기를 접수하고 검수자가 받아들이면 이력에 처리 기록이 남는다', async ({ page, browser }) => {
  const target = dataset.pledges.find((p) => p.status === 'in_progress');
  if (!target) throw new Error('데이터에 진행 중 공약이 없습니다');
  const pledgeId = `${copy.prefix}${target.id}`;
  const reviewer = await createReviewer();
  try {
    await page.goto(`/o/${copy.officialId}/objection?pledge=${pledgeId}`);
    await page.getByRole('textbox', { name: '내용' }).fill('공식 누리집의 사업 현황과 표시된 근거가 다릅니다');
    await page.getByRole('textbox', { name: '근거 링크(선택)' }).fill('https://example.org/journey/objection');
    await shot(page, 'journey-objection');
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.getByText('접수되었습니다')).toBeVisible();

    const rows = await admin().from('objections').select('id, state').eq('pledge_id', pledgeId);
    expect(rows.data).toHaveLength(1);
    const objectionId = rows.data?.[0]?.id as string;

    const rev = await browser.newContext();
    try {
      const rp = await rev.newPage();
      await login(rp, reviewer);
      const item = rp.locator(`[data-testid="objection-item"][data-objection-id="${objectionId}"]`);
      await expect(item).toContainText('공식 누리집의 사업 현황과 표시된 근거가 다릅니다');
      await item.getByRole('button', { name: '받아들임' }).click();
      await item.getByRole('textbox', { name: '처리 메모' }).fill('원문 확인 후 근거 보강');
      await item.getByRole('button', { name: '처리' }).click();
      await expect(item).toHaveCount(0);
    } finally {
      await rev.close();
    }

    await page.goto(`/o/${copy.officialId}/p/${pledgeId}`);
    const done = page.getByTestId('history-item').filter({ hasText: '이의 제기 처리' });
    await expect(done).toHaveCount(1);
    await expect(done).toContainText('원문 확인 후 근거 보강');
  } finally {
    await reviewer.cleanup();
  }
});

test('실패 경로: 잘못된 근거 URL 로 이의 제기를 보내면 오류 문구가 보이고 행이 없다', async ({ page }) => {
  const pledgeId = `${copy.prefix}${dataset.pledges[0]?.id}`;
  await page.goto(`/o/${copy.officialId}/objection?pledge=${pledgeId}`);
  await page.getByRole('textbox', { name: '내용' }).fill('근거 링크 형식을 확인하는 시험 입력입니다');
  await page.getByRole('textbox', { name: '근거 링크(선택)' }).fill('not-a-url');
  await page.getByRole('button', { name: '보내기' }).click();
  await expect(page.getByText('http 또는 https 주소를 넣어 주세요')).toBeVisible();
  await expect(page.getByText('접수되었습니다')).toHaveCount(0);
  const rows = await admin().from('objections').select('id').eq('pledge_id', pledgeId);
  expect(rows.data).toEqual([]);
});

test('기준 화면: 다섯 상태와 규칙이 보인다', async ({ page }) => {
  await page.goto(`/o/${copy.officialId}`);
  await page.getByRole('link', { name: '판정 기준 보기' }).click();
  await expect(page).toHaveURL(/\/criteria$/);
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['미착수', '진행 중', '이행', '변경', '폐기']);
  await shot(page, 'journey-criteria');
});
