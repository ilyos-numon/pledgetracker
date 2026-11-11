// 사용법: scripts/sb-env.sh node scripts/load-catalog.ts <catalog.json> [--check]
// 검증 후 로컬 Supabase 의 당선자 목록에 넣는다. --check 는 검증만 한다. 여러 번 실행해도 행 수가 같다.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { validateCatalog } from '../src/core/catalog.ts';
import { adminClient } from '../src/db/admin.ts';
import { loadCatalog } from '../src/db/catalog.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { check: { type: 'boolean' } } });
const path = positionals[0];
if (!path) {
  console.error('usage: node scripts/load-catalog.ts <catalog.json> [--check]');
  process.exit(2);
}

const result = validateCatalog(JSON.parse(readFileSync(path, 'utf8')));
if (!result.ok) {
  for (const e of result.errors) console.error(e);
  process.exit(1);
}
if (values.check) {
  const entries = result.data.entries;
  const metro = entries.filter((e) => e.level === 'metro').length;
  console.log(`ok entries=${entries.length} metro=${metro} local=${entries.length - metro}`);
  process.exit(0);
}
const summary = await loadCatalog(adminClient(), result.data);
console.log(JSON.stringify(summary));
