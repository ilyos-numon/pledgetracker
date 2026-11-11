// 사용법: node scripts/build-workflow.ts [--check]
// workflows/evidence-collect.template.json 의 "Match Pledges" Code 노드에 src/core/match.ts(타입을 지운 소스)를 넣어
// workflows/evidence-collect.json 을 만든다. --check 는 파일이 최신이 아니면 exit 1.
import { readFileSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLACEHOLDER = '/*@@MATCH_CODE@@*/';
const NODE_NAME = 'Match Pledges';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_REL = 'workflows/evidence-collect.template.json';
const MATCH_REL = 'src/core/match.ts';
const OUT_REL = 'workflows/evidence-collect.json';

// Code 노드 안에서 matchItems 를 부르는 부분. 공약은 Load Pledges, 피드 주소는 Feed URLs 에서 가져온다.
const GLUE = `
const pledges = $('Load Pledges')
  .all()
  .map((i) => ({ id: String(i.json.id ?? ''), keywords: Array.isArray(i.json.keywords) ? i.json.keywords.map(String) : [] }))
  .filter((p) => p.id !== '');
const feeds = $('Feed URLs').all();
function hostOf(u) {
  try {
    return new URL(String(u)).hostname;
  } catch {
    return '';
  }
}
function feedOf(it) {
  const pi = Array.isArray(it.pairedItem) ? it.pairedItem[0] : it.pairedItem;
  const idx = pi && typeof pi.item === 'number' ? pi.item : 0;
  return feeds[idx] ? feeds[idx].json.url : '';
}
const items = $input.all().map((it) => {
  const j = it.json;
  const link = typeof j.link === 'string' ? j.link : '';
  return {
    title: typeof j.title === 'string' ? j.title : '',
    link,
    pubDate: typeof j.isoDate === 'string' ? j.isoDate : typeof j.pubDate === 'string' ? j.pubDate : undefined,
    contentSnippet: typeof j.contentSnippet === 'string' ? j.contentSnippet : undefined,
    source: hostOf(feedOf(it)) || hostOf(link) || 'rss',
  };
});
const rows = matchItems(items, pledges);
return rows.length === 0 ? [] : [{ json: { rows } }];
`;

export function buildWorkflow(templatePath: string, matchPath: string): string {
  const template = JSON.parse(readFileSync(templatePath, 'utf8'));
  const matchSrc = stripTypeScriptTypes(readFileSync(matchPath, 'utf8'))
    .replace(/^export /gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  const node = (template.nodes ?? []).find((n: { name: string }) => n.name === NODE_NAME);
  if (!node || node.parameters?.jsCode !== PLACEHOLDER) {
    throw new Error(`template: ${NODE_NAME} jsCode placeholder missing`);
  }
  node.parameters.jsCode = `${matchSrc.trimEnd()}\n${GLUE}`;
  return `${JSON.stringify(template, null, 2)}\n`;
}

function main(argv: string[]): number {
  const out = buildWorkflow(path.join(ROOT, TEMPLATE_REL), path.join(ROOT, MATCH_REL));
  const outPath = path.join(ROOT, OUT_REL);
  if (argv.includes('--check')) {
    let current: string | null = null;
    try {
      current = readFileSync(outPath, 'utf8');
    } catch {
      current = null;
    }
    if (current === out) {
      console.log('workflow up to date');
      return 0;
    }
    console.log('workflow stale: run npm run build:workflow');
    return 1;
  }
  writeFileSync(outPath, out);
  console.log(`built ${OUT_REL}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
