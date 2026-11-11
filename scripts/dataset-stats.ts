// 데이터셋 통계: 공약 수, 분야별·상태별 수, 근거 수와 점검 항목.
// 사용: node scripts/dataset-stats.ts <dataset.json> [--json]
//   통과하면 종료 0 과 요약(또는 JSON), 검증 실패면 오류 목록과 종료 1, 인자 없음은 종료 2.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type PledgeDataset, validateDataset } from '../src/core/dataset.ts';
import type { Category, PledgeStatus } from '../src/core/types.ts';

export interface DatasetStats {
  officialId: string;
  pledges: number;
  byCategory: Partial<Record<Category, number>>;
  byStatus: Partial<Record<PledgeStatus, number>>;
  evidenceTotal: number;
  evidencePerPledge: number;
  pledgesWithoutEvidence: number;
  nonNotStartedWithoutEvidence: number;
  evidenceWithoutCheckedAt: number;
}

export function computeDatasetStats(ds: PledgeDataset): DatasetStats {
  const byCategory: DatasetStats['byCategory'] = {};
  const byStatus: DatasetStats['byStatus'] = {};
  let evidenceTotal = 0;
  let pledgesWithoutEvidence = 0;
  let nonNotStartedWithoutEvidence = 0;
  let evidenceWithoutCheckedAt = 0;
  for (const p of ds.pledges) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    evidenceTotal += p.evidence.length;
    if (p.evidence.length === 0) {
      pledgesWithoutEvidence += 1;
      if (p.status !== 'not_started') nonNotStartedWithoutEvidence += 1;
    }
    evidenceWithoutCheckedAt += p.evidence.filter((e) => !e.checked_at).length;
  }
  const pledges = ds.pledges.length;
  return {
    officialId: ds.official.id,
    pledges,
    byCategory,
    byStatus,
    evidenceTotal,
    evidencePerPledge: pledges === 0 ? 0 : evidenceTotal / pledges,
    pledgesWithoutEvidence,
    nonNotStartedWithoutEvidence,
    evidenceWithoutCheckedAt,
  };
}

function formatCounts(counts: Record<string, number | undefined>): string {
  return Object.entries(counts)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { json: { type: 'boolean', default: false } },
  });
  const path = positionals[0];
  if (!path) {
    console.error('usage: node scripts/dataset-stats.ts <dataset.json> [--json]');
    process.exit(2);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    console.error(`${path}: JSON 을 읽지 못했습니다 — ${(err as Error).message}`);
    process.exit(1);
  }
  const result = validateDataset(raw);
  if (!result.ok) {
    for (const e of result.errors) console.error(e);
    console.error(`invalid: ${result.errors.length} error(s)`);
    process.exit(1);
  }

  const s = computeDatasetStats(result.data);
  if (values.json) {
    console.log(JSON.stringify(s, null, 2));
    return;
  }
  console.log(`official=${s.officialId} pledges=${s.pledges}`);
  console.log(`category: ${formatCounts(s.byCategory)}`);
  console.log(`status: ${formatCounts(s.byStatus)}`);
  console.log(
    `evidence=${s.evidenceTotal} per_pledge=${s.evidencePerPledge.toFixed(2)} without_evidence=${s.pledgesWithoutEvidence}`,
  );
  console.log(
    `nonNotStartedWithoutEvidence=${s.nonNotStartedWithoutEvidence} evidenceWithoutCheckedAt=${s.evidenceWithoutCheckedAt}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
