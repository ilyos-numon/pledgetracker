import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { validateDataset } from '../../src/core/dataset.ts';
import { buildHwpx } from '../fixtures/make-hwpx.ts';

// 파이프라인 E2E: 실제 hwp2md(uvx)로 HWPX 변환 → fixture 모드 LLM 추출. DB·브라우저는 쓰지 않는다.
const NODE_ARGS = ['--no-warnings=ExperimentalWarning'];
const HWPX = 'tests/fixtures/pledge-sample.hwpx';
const SAMPLE_MD = 'tests/fixtures/pledge-sample.md';
const SOURCE_URL = 'https://example.org/pledges.pdf';

// 닿을 수 없는 LLM 주소와 빈 키: fixture 모드가 네트워크를 쓰면 실패한다.
const FIXTURE_ENV = {
  ...process.env,
  LLM_MODE: 'fixture',
  LLM_BASE_URL: 'http://localhost:9',
  LLM_API_KEY: '',
  LLM_FIXTURE_DIR: 'tests/fixtures/llm',
};

function node(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  return execFileSync(process.execPath, [...NODE_ARGS, ...args], { env, encoding: 'utf8', timeout: 120_000 });
}

function extract(input: string, out: string): string {
  return node(
    [
      'scripts/extract-pledges.ts',
      '--in',
      input,
      '--official',
      'sample-oo-si',
      '--source-url',
      SOURCE_URL,
      '--out',
      out,
    ],
    FIXTURE_ENV,
  );
}

test.describe.configure({ timeout: 180_000 });

test('HWPX 픽스처는 생성기 출력과 바이트가 같다', () => {
  expect(Buffer.from(buildHwpx()).equals(readFileSync(HWPX))).toBe(true);
});

test('parse-doc: 실제 hwp2md 로 HWPX 를 Markdown 으로 바꾼다', async () => {
  const testInfo = test.info();
  const outDir = testInfo.outputPath('md');
  const mdPath = node(['scripts/parse-doc.ts', HWPX, '--out', outDir]).trim();
  expect(mdPath).toBe(join(outDir, 'pledge-sample.md'));
  const md = readFileSync(mdPath, 'utf8');
  expect(md).toContain('공약');
  expect(md).toContain('# OO시 시장 선거공약서 (가상)');
  expect(md).toContain('## 1. 교통');
  expect(md).toContain('OO역 환승주차장 건립');

  // HWPX → Markdown → fixture 추출까지 이어서
  const out = testInfo.outputPath('hwpx.json');
  extract(mdPath, out);
  const res = validateDataset(JSON.parse(readFileSync(out, 'utf8')));
  expect(res.ok).toBe(true);
  if (res.ok) {
    expect(res.data.pledges.map((p) => p.title)).toEqual([
      'OO역 환승주차장 건립',
      '초등 돌봄교실 확대',
      'OO천 생태하천 복원',
    ]);
  }
});

test('extract-pledges: fixture 모드 2회 실행 결과가 바이트 단위로 같고 데이터셋 검증을 통과한다', async () => {
  const testInfo = test.info();
  const a = testInfo.outputPath('a.json');
  const b = testInfo.outputPath('b.json');
  expect(extract(SAMPLE_MD, a)).toContain('pledges=12');
  extract(SAMPLE_MD, b);
  const bytesA = readFileSync(a);
  expect(bytesA.equals(readFileSync(b))).toBe(true);

  const res = validateDataset(JSON.parse(bytesA.toString('utf8')));
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  const ds = res.data;
  expect(ds.official.id).toBe('sample-oo-si');
  expect(ds.official.is_sample).toBe(true);
  expect(ds.pledges).toHaveLength(12);
  expect(ds.pledges[0]).toMatchObject({ id: 'sample-oo-si-p001', title: 'OO역 환승주차장 건립', category: '교통' });
  expect(ds.pledges.every((p) => p.status === 'not_started' && p.evidence.length === 0)).toBe(true);
  expect(ds.pledges.every((p) => p.status_reason === '근거 없음')).toBe(true);
});

test('parse-doc: 알 수 없는 형식은 종료 코드 1 과 parse_error:unsupported', async () => {
  const testInfo = test.info();
  let status = 0;
  let stderr = '';
  try {
    node(['scripts/parse-doc.ts', SAMPLE_MD, '--out', testInfo.outputPath('x')]);
  } catch (e) {
    const err = e as { status: number; stderr: string };
    status = err.status;
    stderr = String(err.stderr);
  }
  expect(status).toBe(1);
  expect(stderr).toContain('parse_error:unsupported');
});
