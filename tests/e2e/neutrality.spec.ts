import { expect, type Page, test } from '@playwright/test';
import { FORBIDDEN_WORDS } from '../../src/core/dataset.ts';
import { STATUS_ORDER } from '../../src/core/status.ts';
import { seedSample } from './helpers/db.ts';

let officialId: string;
let firstPledgeId: string;

test.beforeAll(async () => {
  const seeded = await seedSample();
  officialId = seeded.officialId;
  firstPledgeId = seeded.dataset.pledges[0]?.id as string;
});

function routes(): string[] {
  return [
    `/o/${officialId}`,
    `/o/${officialId}/p/${firstPledgeId}`,
    `/o/${officialId}/objection`,
    '/criteria',
    '/review',
  ];
}

// Mantine 기본 팔레트의 red·blue (0~9)
const RED = [
  '#fff5f5',
  '#ffe3e3',
  '#ffc9c9',
  '#ffa8a8',
  '#ff8787',
  '#ff6b6b',
  '#fa5252',
  '#f03e3e',
  '#e03131',
  '#c92a2a',
];
const BLUE = [
  '#e7f5ff',
  '#d0ebff',
  '#a5d8ff',
  '#74c0fc',
  '#4dabf7',
  '#339af0',
  '#228be6',
  '#1c7ed6',
  '#1971c2',
  '#1864ab',
];

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

function hueOf(r: number, g: number, b: number): { h: number; s: number } {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  if (d === 0) return { h: 0, s: 0 };
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s: d / (1 - Math.abs(max + min - 1)) };
}

async function expectNeutral(page: Page) {
  const text = (await page.locator('body').textContent()) ?? '';
  for (const w of FORBIDDEN_WORDS) expect(text, `금지어 "${w}"`).not.toContain(w);
}

test('5개 라우트 모두 데모 배지가 정확히 1개', async ({ page }) => {
  for (const path of routes()) {
    await page.goto(path);
    await expect(page.getByTestId('demo-badge'), path).toHaveCount(1);
  }
});

test('샘플 대시보드·상세·기준 화면에 금지어가 없다', async ({ page }) => {
  for (const path of [`/o/${officialId}`, `/o/${officialId}/p/${firstPledgeId}`, '/criteria']) {
    await page.goto(path);
    await expect(page.getByTestId('demo-badge')).toHaveCount(1);
    await expectNeutral(page);
  }
});

test('상태 배지의 글자색·배경색에 빨강·파랑 계열이 없다', async ({ page }) => {
  await page.goto(`/o/${officialId}`);
  await expect(page.getByTestId('pledge-card').first()).toBeVisible();
  // 다섯 상태가 모두 화면에 나오는지 먼저 확인 (샘플은 상태가 고르게 있다)
  for (const s of STATUS_ORDER) await expect(page.getByTestId(`status-count-${s}`)).not.toHaveText('0');

  const colors = await page.getByTestId('pledge-status').evaluateAll((els) => {
    const ctx = document.createElement('canvas').getContext('2d');
    const toRgba = (css: string): [number, number, number, number] => {
      if (!ctx) throw new Error('canvas unavailable');
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] as number, d[1] as number, d[2] as number, d[3] as number];
    };
    return els.flatMap((el) => {
      const cs = getComputedStyle(el);
      return [cs.color, cs.backgroundColor, cs.borderTopColor].map((c) => ({ css: c, rgba: toRgba(c) }));
    });
  });
  expect(colors.length).toBeGreaterThan(0);

  for (const { css, rgba } of colors) {
    const [r, g, b, a] = rgba;
    if (a === 0) continue;
    const h = hex(r, g, b);
    expect(RED, `${css} → ${h}`).not.toContain(h);
    expect(BLUE, `${css} → ${h}`).not.toContain(h);
    const { h: hue, s } = hueOf(r, g, b);
    if (s > 0.25) {
      const redLike = hue <= 15 || hue >= 345;
      const blueLike = hue >= 190 && hue <= 260;
      expect(redLike || blueLike, `${css} (hue ${Math.round(hue)}) 는 빨강·파랑 계열`).toBe(false);
    }
  }
});
