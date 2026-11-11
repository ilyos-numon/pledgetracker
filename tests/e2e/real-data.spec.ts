import { readdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { countByStatus, STATUS_ORDER } from '../../src/core/status.ts';
import { readDataset } from './helpers/db.ts';

const PLEDGE_DIR = 'data/pledges';
const files = readdirSync(PLEDGE_DIR).filter((f) => f.endsWith('.json'));
if (files.length !== 1) throw new Error(`${PLEDGE_DIR} 에는 파일이 하나여야 합니다: ${files.join(',')}`);
const REAL_PATH = `${PLEDGE_DIR}/${files[0]}`;

test('실데이터 화면의 카운트·카드 수·근거 링크 수가 JSON 과 같다', async ({ page }) => {
  const data = await readDataset(REAL_PATH);
  const id = data.official.id;
  expect(`${id}.json`).toBe(files[0]);
  await page.goto(`/o/${id}`);

  await expect(page.getByTestId('total-count')).toHaveText(`공약 ${data.pledges.length}개`);
  const counts = countByStatus(data.pledges);
  for (const s of STATUS_ORDER) await expect(page.getByTestId(`status-count-${s}`)).toHaveText(String(counts[s]));
  await expect(page.getByTestId('pledge-card')).toHaveCount(data.pledges.length);

  const evidenceTotal = data.pledges.reduce((n, p) => n + p.evidence.length, 0);
  await expect(page.getByTestId('evidence-link')).toHaveCount(evidenceTotal);
  await expect(page.getByTestId('demo-badge')).toHaveCount(1);
});
