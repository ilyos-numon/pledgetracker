import { createHash } from 'node:crypto';
import { z } from 'zod';
import { FORBIDDEN_WORDS } from '../core/dataset.ts';
import type { EvidenceCandidate, Pledge } from '../core/types.ts';
import type { LlmClient } from './llm.ts';

export const SuggestResponseSchema = z.object({
  related: z.boolean(),
  reason: z.string().min(1),
});

export const SUGGEST_SYSTEM_PROMPT = [
  '너는 기사·문서 한 건이 선거 공약 한 개와 관련 있는지 사실만 보고 판단해 JSON 으로만 답한다.',
  '응답 형식: {"related":boolean,"reason":string}',
  'related 는 기사가 그 공약의 사업·시설·정책을 직접 다루면 true, 아니면 false.',
  'reason 은 "기사가 <사실>을 적고 있음" 형태의 한 문장, 80자 이내.',
  '공약이나 사업의 좋고 나쁨, 이행 여부 판정, 정당·정치 성향에 대한 평가나 의견을 넣지 않는다.',
].join('\n');

const MAX_LEN = 120;
const NEUTRAL_REASON = '키워드가 겹침 (메모 표현 생략)';

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** 후보 기사와 공약의 관련성을 LLM 에 묻고 "관련 가능: ..." | "관련 낮음: ..." 한 줄(120자 이하)로 돌려준다. 상태는 정하지 않는다. */
export async function suggestNote(
  c: Pick<EvidenceCandidate, 'title' | 'url' | 'source'>,
  p: Pick<Pledge, 'title' | 'summary'>,
  llm: LlmClient,
): Promise<string> {
  const res = await llm.completeJson({
    system: SUGGEST_SYSTEM_PROMPT,
    user: [
      `공약 제목: ${p.title}`,
      `공약 요약: ${p.summary}`,
      '',
      `기사 제목: ${c.title}`,
      `기사 주소: ${c.url}`,
      `출처: ${c.source}`,
    ].join('\n'),
    schema: SuggestResponseSchema,
    fixtureKey: `suggest-${sha256(c.url + p.title).slice(0, 12)}`,
  });
  let reason = res.reason.replace(/\s+/g, ' ').trim();
  if (reason === '' || FORBIDDEN_WORDS.some((w) => reason.includes(w))) reason = NEUTRAL_REASON;
  const note = `${res.related ? '관련 가능' : '관련 낮음'}: ${reason}`;
  return note.length <= MAX_LEN ? note : `${note.slice(0, MAX_LEN - 1)}…`;
}
