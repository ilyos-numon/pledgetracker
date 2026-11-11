// 사용법: node scripts/validate-dataset.ts <dataset.json>
// 통과하면 종료 0 과 요약 한 줄, 실패하면 오류 목록(공약 id 포함)과 종료 1.
import { readFileSync } from 'node:fs';
import { validateDataset } from '../src/core/dataset.ts';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/validate-dataset.ts <dataset.json>');
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
const evidence = result.data.pledges.reduce((n, p) => n + p.evidence.length, 0);
console.log(`ok official=${result.data.official.id} pledges=${result.data.pledges.length} evidence=${evidence}`);
