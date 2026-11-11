import { expect, test } from '@playwright/test';
import { DEMO_NOTICE } from '../../src/core/status.ts';
import { shot } from './helpers/shot.ts';

test('판정 기준 화면에 데모 판정 배지가 하나 보인다', async ({ page }) => {
  await page.goto('/criteria');
  const badge = page.getByTestId('demo-badge');
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveText(DEMO_NOTICE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('판정 기준');
  await shot(page, 'smoke');
});
