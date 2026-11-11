// Markdown 공약서에서 공약을 뽑아 PledgeDataset JSON 을 쓴다. 상태는 모두 미착수.
// 사용: node scripts/extract-pledges.ts --in <md> --official <id> --source-url <url> --out <json> [--official-meta <meta.json>]
//   LLM_MODE=fixture 면 tests/fixtures/llm 의 응답 파일만 읽는다 (네트워크 없음).
//   --official-meta: data/sources/<id>.meta.json ({ url, title, retrieved_at, format, sha256, source_kind, ... }).
//     선택 필드 official 에 region_name·office·person_name·term_start·term_end·election_date 를 넣으면 그 값을 쓴다.
//   meta 가 없으면 가상 'OO시' 기본값(source_kind sample, is_sample true)으로 채운다.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { type PledgeDataset, validateDataset } from '../src/core/dataset.ts';
import type { Official } from '../src/core/types.ts';
import { extractPledges } from '../src/pipeline/extract.ts';
import { createLlmClient } from '../src/pipeline/llm.ts';

const { values } = parseArgs({
  options: {
    in: { type: 'string' },
    official: { type: 'string' },
    'source-url': { type: 'string' },
    out: { type: 'string' },
    'official-meta': { type: 'string' },
  },
});

const input = values.in;
const officialId = values.official;
const sourceUrl = values['source-url'];
const out = values.out;
if (!input || !officialId || !sourceUrl || !out) {
  console.error(
    'usage: node scripts/extract-pledges.ts --in <md> --official <id> --source-url <url> --out <json> [--official-meta <meta.json>]',
  );
  process.exit(64);
}

type Source = PledgeDataset['sources'][number];
interface SourceMeta extends Partial<Source> {
  source_kind?: Official['source_kind'];
  official?: Partial<Omit<Official, 'id' | 'source_url' | 'source_kind' | 'is_sample'>>;
}

function formatFromUrl(url: string): Source['format'] {
  const ext = extname(new URL(url).pathname).slice(1).toLowerCase();
  return ext === 'pdf' || ext === 'hwp' || ext === 'hwpx' ? ext : 'html';
}

const meta: SourceMeta = values['official-meta'] ? JSON.parse(await readFile(values['official-meta'], 'utf8')) : {};
const sourceKind = meta.source_kind ?? 'sample';

const official: Official = {
  id: officialId,
  region_name: 'OO시',
  office: '시장',
  person_name: '가상 당선자',
  term_start: '2026-07-01',
  term_end: '2030-06-30',
  election_date: '2026-06-03',
  ...meta.official,
  source_url: sourceUrl,
  source_kind: sourceKind,
  is_sample: sourceKind === 'sample',
};

const source: Source = {
  url: meta.url ?? sourceUrl,
  title: meta.title ?? basename(input),
  retrieved_at: meta.retrieved_at ?? 'unknown',
  format: meta.format ?? formatFromUrl(sourceUrl),
  sha256: meta.sha256 ?? null,
};

const markdown = await readFile(input, 'utf8');
const pledges = await extractPledges(markdown, createLlmClient(), { officialId, sourceUrl });

const dataset: PledgeDataset = { schema_version: 1, official, sources: [source], pledges };
const result = validateDataset(dataset);
if (!result.ok) {
  for (const e of result.errors) console.error(e);
  process.exit(1);
}

await mkdir(dirname(out), { recursive: true });
await writeFile(out, `${JSON.stringify(result.data, null, 2)}\n`);
console.log(`${out} pledges=${pledges.length}`);
