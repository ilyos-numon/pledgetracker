import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PledgeDataset } from '../core/dataset.ts';
import { CATEGORIES } from '../core/types.ts';
import type { LlmClient } from './llm.ts';

const HEADING = /^(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** Markdown 을 제목 단위로 나눈다. 본문이 빈 구역은 버린다. locator 는 상위 제목까지 이은 경로. */
export function splitSections(markdown: string): { heading: string; text: string; locator: string }[] {
  const out: { heading: string; text: string; locator: string }[] = [];
  const stack: { level: number; title: string }[] = [];
  let heading = '';
  let locator = '';
  let body: string[] = [];
  const flush = () => {
    const text = body.join('\n').trim();
    if (text) out.push({ heading, text, locator });
    body = [];
  };
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const m = HEADING.exec(line);
    if (!m) {
      body.push(line);
      continue;
    }
    flush();
    const level = m[1].length;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, title: m[2].trim() });
    heading = m[2].trim();
    locator = stack.map((s) => s.title).join(' > ');
  }
  flush();
  return out;
}

export const ExtractResponseSchema = z.object({
  pledges: z.array(
    z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      category: z.enum(CATEGORIES),
      keywords: z.array(z.string().min(1)).min(1).max(8),
    }),
  ),
});

export const EXTRACT_SYSTEM_PROMPT = [
  '너는 선거 공약 문서에서 공약 항목을 뽑아 JSON 으로만 답한다.',
  '응답 형식: {"pledges":[{"title":string,"summary":string,"category":string,"keywords":string[]}]}',
  `category 는 다음 중 하나: ${CATEGORIES.join(', ')}.`,
  'title 은 문서에 적힌 공약 표현을 그대로 옮긴다. 줄이거나 바꾸지 않는다.',
  'summary 는 문서에 적힌 내용만으로 한두 문장. 문서에 없는 사실을 더하지 않는다.',
  '공약의 좋고 나쁨, 실현 가능성, 정당·정치 성향에 대한 평가나 의견을 넣지 않는다.',
  'keywords 는 이행 근거 기사·문서를 찾을 때 쓸 고유한 낱말 2~6개 (지명·시설명·사업명).',
  '구역에 공약이 없으면 {"pledges":[]} 로 답한다.',
].join('\n');

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** 구역마다 LLM 에 공약 항목을 묻고, 순서대로 id 를 붙여 데이터셋 공약 목록으로 만든다. 상태는 모두 미착수. */
export async function extractPledges(
  markdown: string,
  llm: LlmClient,
  opts: { officialId: string; sourceUrl: string },
): Promise<PledgeDataset['pledges']> {
  const pledges: PledgeDataset['pledges'] = [];
  for (const section of splitSections(markdown)) {
    const res = await llm.completeJson({
      system: EXTRACT_SYSTEM_PROMPT,
      user: `구역 제목: ${section.locator || '(제목 없음)'}\n\n${section.text}`,
      schema: ExtractResponseSchema,
      fixtureKey: `extract-${sha256(section.text).slice(0, 12)}`,
    });
    for (const item of res.pledges) {
      const seq = pledges.length + 1;
      pledges.push({
        id: `${opts.officialId}-p${String(seq).padStart(3, '0')}`,
        seq,
        title: item.title,
        summary: item.summary,
        category: item.category,
        keywords: item.keywords,
        source_url: opts.sourceUrl,
        source_locator: section.locator || null,
        status: 'not_started',
        status_decided_at: null,
        status_reason: '근거 없음',
        evidence: [],
      });
    }
  }
  return pledges;
}
