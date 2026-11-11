// 사용법: scripts/sb-env.sh node scripts/load-dataset.ts <dataset.json> [--prefix <p>]
// 검증 후 로컬 Supabase 에 넣는다. 여러 번 실행해도 행 수가 같다.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { validateDataset } from '../src/core/dataset.ts';
import { adminClient, loadDataset } from '../src/db/admin.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { prefix: { type: 'string' } } });
const path = positionals[0];
if (!path) {
  console.error('usage: node scripts/load-dataset.ts <dataset.json> [--prefix <p>]');
  process.exit(2);
}

const result = validateDataset(JSON.parse(readFileSync(path, 'utf8')));
if (!result.ok) {
  for (const e of result.errors) console.error(e);
  process.exit(1);
}
const summary = await loadDataset(adminClient(), result.data, { idPrefix: values.prefix });
console.log(JSON.stringify(summary));
