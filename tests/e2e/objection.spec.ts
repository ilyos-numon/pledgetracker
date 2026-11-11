import { expect, test } from '@playwright/test';
import { admin, readDataset, seedCopy } from './helpers/db.ts';
import { shot } from './helpers/shot.ts';

const SAMPLE = 'tests/fixtures/dataset.sample.json';

async function objectionsOf(officialPrefix: string) {
  const res = await admin()
    .from('objections')
    .select('pledge_id, body, evidence_url, state')
    .like('pledge_id', `${officialPrefix}%`);
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

test('이의 제기를 보내면 접수되고 개인정보 칸은 없다', async ({ page }) => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  const pledgeId = `${copy.prefix}sample-oo-si-p003`;
  try {
    await page.goto(`/o/${copy.officialId}/objection?pledge=${pledgeId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('이의 제기');
    await expect(page.getByTestId('demo-badge')).toHaveCount(1);
    const select = page.getByRole('combobox', { name: '공약' });
    await expect(select).toHaveValue(pledgeId);

    // 입력칸은 공약·내용·근거 링크 셋뿐
    await expect(page.getByRole('textbox')).toHaveCount(2);
    await expect(page.getByLabel(/이름|연락처|이메일|전화/)).toHaveCount(0);

    await page
      .getByRole('textbox', { name: '내용' })
      .fill('정비 구간 일부가 아직 공사 중입니다. 현장 사진을 확인해 주세요.');
    await page.getByRole('textbox', { name: '근거 링크(선택)' }).fill('https://example.org/photo/123');
    await shot(page, 'objection-form');
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.getByText('접수되었습니다')).toBeVisible();
    await shot(page, 'objection-done');

    expect(await objectionsOf(copy.prefix)).toEqual([
      {
        pledge_id: pledgeId,
        body: '정비 구간 일부가 아직 공사 중입니다. 현장 사진을 확인해 주세요.',
        evidence_url: 'https://example.org/photo/123',
        state: 'open',
      },
    ]);
  } finally {
    await copy.cleanup();
  }
});

test('?pledge 가 없으면 첫 공약이 선택되고 근거 링크 없이도 보낼 수 있다', async ({ page }) => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  try {
    await page.goto(`/o/${copy.officialId}/objection`);
    await expect(page.getByRole('combobox', { name: '공약' })).toHaveValue(`${copy.prefix}sample-oo-si-p001`);
    await page.getByRole('textbox', { name: '내용' }).fill('착공 소식이 시 누리집에 있습니다');
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.getByText('접수되었습니다')).toBeVisible();
    const rows = await objectionsOf(copy.prefix);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.evidence_url).toBeNull();
  } finally {
    await copy.cleanup();
  }
});

test('잘못된 근거 링크와 짧은 내용은 막히고 행이 생기지 않는다', async ({ page }) => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  try {
    await page.goto(`/o/${copy.officialId}/objection?pledge=${copy.prefix}sample-oo-si-p002`);
    await page.getByRole('textbox', { name: '내용' }).fill('회의록에 다른 기록이 있습니다');
    await page.getByRole('textbox', { name: '근거 링크(선택)' }).fill('ftp://x');
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.getByText('http 또는 https 주소를 넣어 주세요')).toBeVisible();

    await page.getByRole('textbox', { name: '근거 링크(선택)' }).fill('');
    await page.getByRole('textbox', { name: '내용' }).fill('짧음');
    await page.getByRole('button', { name: '보내기' }).click();
    await expect(page.getByText('내용은 10자 이상 2000자 이하로 적어 주세요')).toBeVisible();

    await expect(page.getByText('접수되었습니다')).toHaveCount(0);
    expect(await objectionsOf(copy.prefix)).toEqual([]);
  } finally {
    await copy.cleanup();
  }
});
