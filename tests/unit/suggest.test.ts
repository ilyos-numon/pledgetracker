import { describe, expect, it } from 'vitest';
import { createLlmClient, type LlmClient } from '../../src/pipeline/llm.ts';
import { SUGGEST_SYSTEM_PROMPT, suggestNote } from '../../src/pipeline/suggest.ts';

const FIXTURE_ENV = { LLM_MODE: 'fixture', LLM_FIXTURE_DIR: 'tests/fixtures/llm' };
const PLEDGE = { title: 'OO역 환승주차장 건립', summary: 'OO역 인근에 환승주차장을 짓는다.' };
const CAND = {
  title: 'OO역 환승주차장 실시설계 용역 발주',
  url: 'https://example.org/oo-si/news/1001',
  source: 'example.org',
};

function fakeLlm(answer: unknown, calls: { fixtureKey: string; user: string; system: string }[] = []): LlmClient {
  return {
    async completeJson({ schema, fixtureKey, user, system }) {
      calls.push({ fixtureKey, user, system });
      return schema.parse(answer);
    },
  };
}

describe('suggestNote', () => {
  it('fixture 모드: 관련 가능 메모 한 줄', async () => {
    const note = await suggestNote(CAND, PLEDGE, createLlmClient(FIXTURE_ENV));
    expect(note).toBe('관련 가능: 기사 제목이 OO역 환승주차장 실시설계 용역 발주를 적고 있음');
  });

  it('fixture 모드: 관련 낮음 메모', async () => {
    const note = await suggestNote(
      { title: '버스 정류장 청소', url: 'https://example.org/news/2', source: 'example.org' },
      { title: '시내버스 노선 개편', summary: '노선을 다시 짠다.' },
      createLlmClient(FIXTURE_ENV),
    );
    expect(note.startsWith('관련 낮음: ')).toBe(true);
  });

  it('fixtureKey 는 sha256(url + 공약 제목) 앞 12자, 프롬프트에 후보·공약 정보를 넣는다', async () => {
    const calls: { fixtureKey: string; user: string; system: string }[] = [];
    await suggestNote(CAND, PLEDGE, fakeLlm({ related: true, reason: '같은 시설' }, calls));
    expect(calls).toHaveLength(1);
    expect(calls[0].fixtureKey).toBe('suggest-f3289f8ca8e1');
    expect(calls[0].system).toBe(SUGGEST_SYSTEM_PROMPT);
    for (const s of [CAND.title, CAND.url, CAND.source, PLEDGE.title, PLEDGE.summary])
      expect(calls[0].user).toContain(s);
  });

  it('여러 줄 이유는 한 줄로 접고 120자로 자른다', async () => {
    const note = await suggestNote(
      CAND,
      PLEDGE,
      fakeLlm({ related: false, reason: `첫 줄\n둘째 줄 ${'가'.repeat(200)}` }),
    );
    expect(note.startsWith('관련 낮음: 첫 줄 둘째 줄')).toBe(true);
    expect(note).not.toContain('\n');
    expect(note.length).toBeLessThanOrEqual(120);
  });

  it('평가어가 섞이면 이유를 중립 문구로 바꾼다', async () => {
    const note = await suggestNote(CAND, PLEDGE, fakeLlm({ related: true, reason: '훌륭한 사업 진행' }));
    expect(note).toBe('관련 가능: 키워드가 겹침 (메모 표현 생략)');
  });

  it('형식이 틀린 응답은 오류', async () => {
    await expect(suggestNote(CAND, PLEDGE, fakeLlm({ related: 'yes' }))).rejects.toThrow();
  });

  it('fixture 가 없으면 fixture_missing', async () => {
    await expect(
      suggestNote({ ...CAND, url: 'https://example.org/none' }, PLEDGE, createLlmClient(FIXTURE_ENV)),
    ).rejects.toThrow(/^fixture_missing:suggest-/);
  });
});
