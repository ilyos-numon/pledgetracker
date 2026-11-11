import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateDataset } from '../../src/core/dataset.ts';
import { EXTRACT_SYSTEM_PROMPT, extractPledges, splitSections } from '../../src/pipeline/extract.ts';
import { createLlmClient, type LlmClient } from '../../src/pipeline/llm.ts';

const SAMPLE_MD = readFileSync('tests/fixtures/pledge-sample.md', 'utf8');
const OPTS = { officialId: 'sample-oo-si', sourceUrl: 'https://example.org/pledges.pdf' };

describe('splitSections', () => {
  it('제목마다 나누고 상위 제목까지 이은 locator 를 단다', () => {
    const md = '머리말\n\n# 공약서\n\n소개\n\n## 교통\n\n버스\n\n### 세부\n\n노선\n\n## 교육\n\n## 복지 ##\n\n돌봄\n';
    expect(splitSections(md)).toEqual([
      { heading: '', text: '머리말', locator: '' },
      { heading: '공약서', text: '소개', locator: '공약서' },
      { heading: '교통', text: '버스', locator: '공약서 > 교통' },
      { heading: '세부', text: '노선', locator: '공약서 > 교통 > 세부' },
      { heading: '복지', text: '돌봄', locator: '공약서 > 복지' },
    ]);
  });

  it('샘플 공약서는 소개 1 + 분야 6 구역', () => {
    const sections = splitSections(SAMPLE_MD);
    expect(sections).toHaveLength(7);
    expect(sections.slice(1).map((s) => s.heading)).toEqual([
      '1. 교통',
      '2. 교육',
      '3. 복지',
      '4. 환경',
      '5. 경제',
      '6. 행정',
    ]);
  });
});

describe('extractPledges', () => {
  it('구역마다 sha256 기반 fixtureKey 로 묻고, 연번 id·미착수 상태를 붙인다', async () => {
    const calls: { system: string; user: string; fixtureKey: string }[] = [];
    const fake: LlmClient = {
      async completeJson({ system, user, schema, fixtureKey }) {
        calls.push({ system, user, fixtureKey });
        return schema.parse({
          pledges: user.includes('교통')
            ? [
                { title: '가', summary: '가 요약', category: '교통', keywords: ['가'] },
                { title: '나', summary: '나 요약', category: '교통', keywords: ['나'] },
              ]
            : [],
        });
      },
    };
    const md = '# 공약\n\n## 교통\n\n버스 노선\n\n## 교육\n\n돌봄\n';
    const pledges = await extractPledges(md, fake, OPTS);
    expect(calls.map((c) => c.fixtureKey)).toEqual(['extract-294df529457b', 'extract-f28442d2111f']);
    expect(calls[0].system).toBe(EXTRACT_SYSTEM_PROMPT);
    expect(calls[0].user).toContain('버스 노선');
    expect(pledges.map((p) => p.id)).toEqual(['sample-oo-si-p001', 'sample-oo-si-p002']);
    expect(pledges[1]).toEqual({
      id: 'sample-oo-si-p002',
      seq: 2,
      title: '나',
      summary: '나 요약',
      category: '교통',
      keywords: ['나'],
      source_url: OPTS.sourceUrl,
      source_locator: '공약 > 교통',
      status: 'not_started',
      status_decided_at: null,
      status_reason: '근거 없음',
      evidence: [],
    });
  });

  it('프롬프트는 원문 표현 유지와 평가 금지를 지시한다', () => {
    expect(EXTRACT_SYSTEM_PROMPT).toContain('그대로');
    expect(EXTRACT_SYSTEM_PROMPT).toContain('평가');
  });

  it('LLM 응답이 스키마에 맞지 않으면 거부한다', async () => {
    const bad: LlmClient = {
      async completeJson({ schema }) {
        return schema.parse({ pledges: [{ title: 'x', summary: 'y', category: '우주', keywords: [] }] });
      },
    };
    await expect(extractPledges('## 교통\n\n버스\n', bad, OPTS)).rejects.toThrow();
  });

  it('fixture 모드로 샘플 공약서 → 공약 12개, 데이터셋 검증 통과', async () => {
    const llm = createLlmClient({ LLM_MODE: 'fixture', LLM_BASE_URL: 'http://localhost:9' });
    const pledges = await extractPledges(SAMPLE_MD, llm, OPTS);
    expect(pledges).toHaveLength(12);
    expect(pledges[0].title).toBe('OO역 환승주차장 건립');
    expect(pledges[0].keywords).toEqual(['환승주차장', 'OO역']);
    const byCat: Record<string, number> = {};
    for (const p of pledges) byCat[p.category] = (byCat[p.category] ?? 0) + 1;
    expect(byCat).toEqual({ 교통: 3, 교육: 2, 복지: 3, 환경: 2, 경제: 1, 행정: 1 });
    const res = validateDataset({
      schema_version: 1,
      official: {
        id: 'sample-oo-si',
        region_name: 'OO시',
        office: '시장',
        person_name: '가상 당선자',
        term_start: '2026-07-01',
        term_end: '2030-06-30',
        election_date: '2026-06-03',
        source_url: OPTS.sourceUrl,
        source_kind: 'sample',
        is_sample: true,
      },
      sources: [{ url: OPTS.sourceUrl, title: 't', retrieved_at: 'unknown', format: 'pdf', sha256: null }],
      pledges,
    });
    expect(res.ok).toBe(true);
  });
});

describe('createLlmClient', () => {
  const schema = z.object({ ok: z.boolean() });

  it('fixture 파일이 없으면 fixture_missing:<key>', async () => {
    const llm = createLlmClient({ LLM_MODE: 'fixture' });
    await expect(llm.completeJson({ system: 's', user: 'u', schema, fixtureKey: 'extract-nope' })).rejects.toThrow(
      'fixture_missing:extract-nope',
    );
  });

  describe('live (로컬 가짜 OpenAI 호환 서버)', () => {
    let server: Server;
    let baseURL: string;
    const bodies: Record<string, unknown>[] = [];
    let replies: string[] = [];

    beforeAll(async () => {
      server = createServer((req, res) => {
        let raw = '';
        req.on('data', (d) => {
          raw += d;
        });
        req.on('end', () => {
          bodies.push(JSON.parse(raw));
          const content = replies.shift() ?? '{}';
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              id: 'x',
              object: 'chat.completion',
              created: 0,
              model: 'm',
              choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
            }),
          );
        });
      });
      await new Promise<void>((r) => server.listen(0, 'localhost', r));
      baseURL = `http://localhost:${(server.address() as AddressInfo).port}/v1`;
    });
    afterAll(() => new Promise<void>((r) => server.close(() => r())));

    it('json_object·temperature 0 으로 묻고, zod 실패 시 1회 재시도', async () => {
      bodies.length = 0;
      replies = ['{"ok":"no"}', '{"ok":true}'];
      const llm = createLlmClient({ LLM_MODE: 'live', LLM_BASE_URL: baseURL, LLM_API_KEY: 'k', LLM_MODEL: 'm1' });
      await expect(llm.completeJson({ system: 'S', user: 'U', schema, fixtureKey: 'k' })).resolves.toEqual({
        ok: true,
      });
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toMatchObject({
        model: 'm1',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'S' },
          { role: 'user', content: 'U' },
        ],
      });
    });

    it('두 번 다 실패하면 오류', async () => {
      bodies.length = 0;
      replies = ['not json', '{"ok":1}'];
      const llm = createLlmClient({ LLM_MODE: 'live', LLM_BASE_URL: baseURL, LLM_API_KEY: 'k', LLM_MODEL: 'm1' });
      await expect(llm.completeJson({ system: 'S', user: 'U', schema, fixtureKey: 'k' })).rejects.toThrow(
        'llm_invalid_json',
      );
      expect(bodies).toHaveLength(2);
    });
  });
});
