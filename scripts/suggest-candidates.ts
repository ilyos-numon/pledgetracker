// 사용법: scripts/sb-env.sh node scripts/suggest-candidates.ts [--limit <n>]
// 검수 대기(pending) 근거 후보 중 메모가 없는 것에 LLM 자동 메모(참고용)를 단다. 상태·근거는 바꾸지 않는다.
import { parseArgs } from 'node:util';
import { adminClient } from '../src/db/admin.ts';
import { createLlmClient } from '../src/pipeline/llm.ts';
import { suggestNote } from '../src/pipeline/suggest.ts';

const { values } = parseArgs({ options: { limit: { type: 'string', default: '20' } } });
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1) {
  console.error('usage: node scripts/suggest-candidates.ts [--limit <n>]  (n >= 1)');
  process.exit(2);
}

const db = adminClient();
const llm = createLlmClient();
const res = await db
  .from('evidence_candidates')
  .select('id, title, url, source, pledges(title, summary)')
  .eq('state', 'pending')
  .is('llm_note', null)
  .order('created_at', { ascending: true })
  .order('id', { ascending: true })
  .limit(limit);
if (res.error) {
  console.error(`select evidence_candidates: ${res.error.message}`);
  process.exit(1);
}

let done = 0;
let failed = 0;
for (const c of res.data) {
  const p = c.pledges;
  if (!p) {
    failed++;
    console.error(`${c.id}: pledge not found`);
    continue;
  }
  try {
    const note = await suggestNote(c, p, llm);
    const up = await db.from('evidence_candidates').update({ llm_note: note }).eq('id', c.id).is('llm_note', null);
    if (up.error) throw new Error(up.error.message);
    done++;
  } catch (err) {
    failed++;
    console.error(`${c.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
console.log(`noted=${done} failed=${failed}`);
if (failed > 0) process.exitCode = 1;
