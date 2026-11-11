import type { Page } from '@playwright/test';

export async function shot(page: Page, name: string) {
  const dir = process.env.ILLY_SHOT_DIR ?? 'tests/e2e/screenshots';
  await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}
