import { expect, type Page, test } from '@playwright/test';
import { admin, createReviewer, insertCandidate, readDataset, seedCopy } from './helpers/db.ts';
import { shot } from './helpers/shot.ts';

const SAMPLE = 'tests/fixtures/dataset.sample.json';

async function login(page: Page, email: string, password: string) {
  await page.goto('/review');
  await page.getByLabel('이메일').fill(email);
  await page.getByLabel('비밀번호').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
}

test('로그인 전에는 로그인 폼만 보이고 후보가 없다', async ({ page }) => {
  await page.goto('/review');
  await expect(page.getByLabel('이메일')).toBeVisible();
  await expect(page.getByLabel('비밀번호')).toBeVisible();
  await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
  await expect(page.getByTestId('candidate-item')).toHaveCount(0);
  await expect(page.getByTestId('objection-item')).toHaveCount(0);
});

test('검수자가 아닌 사용자는 "검수 권한이 없습니다"', async ({ page }) => {
  const db = admin();
  const email = `e2e-nr-${Date.now()}@example.org`;
  const password = `pw-${Date.now()}-x`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull();
  const userId = created.data.user?.id as string;
  try {
    await login(page, email, password);
    await expect(page.getByTestId('review-error')).toHaveText('검수 권한이 없습니다');
    await expect(page.getByTestId('candidate-item')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  } finally {
    await db.auth.admin.deleteUser(userId);
  }
});

test('후보를 채택하며 상태를 바꾼다 — 이유가 없으면 막힌다', async ({ page }) => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  const reviewer = await createReviewer();
  const pledgeId = `${copy.prefix}sample-oo-si-p001`; // not_started
  try {
    const older = await insertCandidate({
      pledge_id: `${copy.prefix}sample-oo-si-p005`,
      title: '진로체험센터 부지 검토',
      url: 'https://example.org/news/career-center',
      matched_keywords: ['진로체험센터'],
    });
    const candidateId = await insertCandidate({
      pledge_id: pledgeId,
      title: '환승주차장 예산 반영',
      url: 'https://example.org/press/parking',
      source: 'press-rss',
      matched_keywords: ['환승주차장'],
    });
    await admin()
      .from('evidence_candidates')
      .update({ llm_note: '예산 항목이 공약 제목과 맞습니다', created_at: new Date(Date.now() + 1000).toISOString() })
      .eq('id', candidateId);

    await login(page, reviewer.email, reviewer.password);
    const item = page.locator(`[data-testid="candidate-item"][data-candidate-id="${candidateId}"]`);
    await expect(item).toBeVisible();
    await expect(item).toContainText('OO역 환승주차장 건립');
    await expect(item).toContainText('미착수');
    await expect(item.getByTestId('llm-note')).toHaveText('자동 메모(참고용): 예산 항목이 공약 제목과 맞습니다');

    // 최신순: 나중에 만든 후보가 먼저 나온다
    const ids = await page.getByTestId('candidate-item').evaluateAll((els) => els.map((e) => e.dataset.candidateId));
    expect(ids.indexOf(candidateId)).toBeLessThan(ids.indexOf(older));

    await item.getByRole('button', { name: '근거로 채택' }).click();
    const group = item.getByRole('radiogroup', { name: '상태 변경' });
    await expect(group.getByRole('radio')).toHaveCount(3);
    await expect(group.getByRole('radio', { name: '유지' })).toBeChecked();
    await expect(group.getByRole('radio', { name: '진행 중' })).toBeVisible();
    await expect(group.getByRole('radio', { name: '폐기' })).toBeVisible();
    await expect(group.getByRole('radio', { name: '이행' })).toHaveCount(0);
    await shot(page, 'review-candidates');

    // 실패 경로: 상태를 바꾸는데 이유가 없다
    await group.getByRole('radio', { name: '진행 중' }).check();
    await item.getByRole('button', { name: '확정' }).click();
    await expect(item).toContainText('상태를 바꾸려면 이유를 한 줄 적어 주세요');
    const unchanged = await admin().from('pledges').select('status').eq('id', pledgeId).single();
    expect(unchanged.data?.status).toBe('not_started');

    await item.getByRole('textbox', { name: '이유' }).fill('예산 반영');
    await item.getByRole('button', { name: '확정' }).click();
    await expect(item).toHaveCount(0);

    const pledge = await admin().from('pledges').select('status, status_reason').eq('id', pledgeId).single();
    expect(pledge.data).toEqual({ status: 'in_progress', status_reason: '예산 반영' });
    const ev = await admin().from('evidence').select('url, added_by, kind').eq('pledge_id', pledgeId);
    expect(ev.data).toEqual([
      { url: 'https://example.org/press/parking', added_by: 'reviewer', kind: 'press_release' },
    ]);
    const events = await admin()
      .from('pledge_events')
      .select('kind, from_status, to_status, reason')
      .eq('pledge_id', pledgeId)
      .eq('kind', 'status_change');
    expect(events.data).toEqual([
      { kind: 'status_change', from_status: 'not_started', to_status: 'in_progress', reason: '예산 반영' },
    ]);
  } finally {
    await reviewer.cleanup();
    await copy.cleanup();
  }
});

test('무관 처리와 이미 처리된 후보 오류', async ({ page }) => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  const reviewer = await createReviewer();
  try {
    const a = await insertCandidate({
      pledge_id: `${copy.prefix}sample-oo-si-p008`,
      title: '복지관 행사 안내',
      url: 'https://example.org/news/welfare-event',
    });
    const b = await insertCandidate({
      pledge_id: `${copy.prefix}sample-oo-si-p010`,
      title: '공원 행사 안내',
      url: 'https://example.org/news/park-event',
    });
    await login(page, reviewer.email, reviewer.password);
    const itemA = page.locator(`[data-testid="candidate-item"][data-candidate-id="${a}"]`);
    const itemB = page.locator(`[data-testid="candidate-item"][data-candidate-id="${b}"]`);
    await expect(itemB).toBeVisible();

    await itemA.getByRole('button', { name: '무관' }).click();
    await expect(itemA).toHaveCount(0);
    const rowA = await admin().from('evidence_candidates').select('state').eq('id', a).single();
    expect(rowA.data?.state).toBe('rejected');

    // 화면을 연 뒤 다른 곳에서 먼저 처리된 경우
    await admin().from('evidence_candidates').update({ state: 'rejected' }).eq('id', b);
    await itemB.getByRole('button', { name: '무관' }).click();
    await expect(itemB.getByTestId('review-error')).toHaveText('이미 처리된 후보입니다');
  } finally {
    await reviewer.cleanup();
    await copy.cleanup();
  }
});

test('열린 이의 제기를 받아들이고 상태를 정정한다', async ({ page }) => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  const reviewer = await createReviewer();
  const pledgeId = `${copy.prefix}sample-oo-si-p002`; // in_progress
  try {
    const ins = await admin()
      .from('objections')
      .insert({
        pledge_id: pledgeId,
        body: '시의회 회의록에 노선 개편 중단 결정이 있습니다',
        evidence_url: 'https://example.org/council/minutes-1',
      })
      .select('id')
      .single();
    expect(ins.error).toBeNull();
    const objectionId = ins.data?.id as string;

    await login(page, reviewer.email, reviewer.password);
    const item = page.locator(`[data-testid="objection-item"][data-objection-id="${objectionId}"]`);
    await expect(item).toContainText('시의회 회의록에 노선 개편 중단 결정이 있습니다');
    await expect(item).toContainText('시내버스 노선 개편');

    await item.getByRole('button', { name: '받아들임' }).click();
    await item.getByRole('button', { name: '처리' }).click();
    await expect(item).toContainText('처리 메모를 적어 주세요');

    await item.getByRole('textbox', { name: '처리 메모' }).fill('회의록 확인');
    await item.getByRole('combobox', { name: '상태 정정' }).selectOption({ label: '폐기' });
    await item.getByRole('button', { name: '처리' }).click();
    await expect(item).toHaveCount(0);

    const obj = await admin().from('objections').select('state, resolution_note').eq('id', objectionId).single();
    expect(obj.data).toEqual({ state: 'accepted', resolution_note: '회의록 확인' });
    const pledge = await admin().from('pledges').select('status').eq('id', pledgeId).single();
    expect(pledge.data?.status).toBe('abandoned');
    const events = await admin()
      .from('pledge_events')
      .select('from_status, to_status, reason')
      .eq('pledge_id', pledgeId)
      .eq('kind', 'objection_resolved');
    expect(events.data).toEqual([{ from_status: 'in_progress', to_status: 'abandoned', reason: '회의록 확인' }]);
  } finally {
    await reviewer.cleanup();
    await copy.cleanup();
  }
});
