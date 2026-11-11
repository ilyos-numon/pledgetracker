import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeDatasetStats } from '../../scripts/dataset-stats.ts';
import type { PledgeDataset } from '../../src/core/dataset.ts';

const SAMPLE_PATH = 'tests/fixtures/dataset.sample.json';
const SAMPLE = JSON.parse(readFileSync(SAMPLE_PATH, 'utf8')) as PledgeDataset;
const NODE_ARGS = ['--no-warnings=ExperimentalWarning', 'scripts/dataset-stats.ts'];

describe('computeDatasetStats', () => {
  it('샘플 데이터셋의 공약 수, 분야별·상태별 수, 근거 수를 센다', () => {
    const s = computeDatasetStats(SAMPLE);
    expect(s.officialId).toBe('sample-oo-si');
    expect(s.pledges).toBe(12);
    expect(s.byCategory).toEqual({ 교통: 3, 교육: 2, 복지: 3, 환경: 2, 경제: 1, 행정: 1 });
    expect(s.byStatus).toEqual({ fulfilled: 2, in_progress: 4, not_started: 4, modified: 1, abandoned: 1 });
    expect(s.evidenceTotal).toBe(8);
    expect(s.evidencePerPledge).toBeCloseTo(8 / 12, 5);
    expect(s.pledgesWithoutEvidence).toBe(4);
    expect(s.nonNotStartedWithoutEvidence).toBe(0);
    expect(s.evidenceWithoutCheckedAt).toBe(0);
  });

  it('미착수가 아닌데 근거가 없는 공약과 checked_at 없는 근거를 센다', () => {
    const ds = structuredClone(SAMPLE);
    const withEvidence = ds.pledges.find((p) => p.status !== 'not_started' && p.evidence.length > 0);
    if (!withEvidence) throw new Error('fixture 에 근거 있는 공약이 없다');
    withEvidence.evidence[0].checked_at = null;
    const target = ds.pledges.find((p) => p.status === 'fulfilled' && p !== withEvidence);
    if (!target) throw new Error('fixture 에 fulfilled 공약이 없다');
    const removed = target.evidence.length;
    target.evidence = [];
    const s = computeDatasetStats(ds);
    expect(s.nonNotStartedWithoutEvidence).toBe(1);
    expect(s.pledgesWithoutEvidence).toBe(5);
    expect(s.evidenceTotal).toBe(8 - removed);
    expect(s.evidenceWithoutCheckedAt).toBe(1);
  });
});

describe('scripts/dataset-stats.ts CLI', () => {
  it('--json 이면 통계 JSON 을 출력하고 종료 0', () => {
    const out = execFileSync('node', [...NODE_ARGS, SAMPLE_PATH, '--json'], { encoding: 'utf8' });
    const s = JSON.parse(out);
    expect(s.pledges).toBe(12);
    expect(s.byStatus.not_started).toBe(4);
  });

  it('기본 출력은 사람이 읽는 요약 줄이다', () => {
    const out = execFileSync('node', [...NODE_ARGS, SAMPLE_PATH], { encoding: 'utf8' });
    expect(out).toContain('pledges=12');
    expect(out).toContain('교통=3');
  });

  it('검증에 실패하는 데이터셋이면 종료 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dataset-stats-'));
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ schema_version: 1, pledges: [] }));
    const res = spawnSync('node', [...NODE_ARGS, bad], { encoding: 'utf8' });
    expect(res.status).toBe(1);
  });

  it('인자가 없으면 사용법과 종료 2', () => {
    const res = spawnSync('node', NODE_ARGS, { encoding: 'utf8' });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('usage');
  });
});
