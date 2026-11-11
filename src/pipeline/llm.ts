import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import OpenAI from 'openai';
import type { z } from 'zod';

export interface LlmClient {
  completeJson<T>(args: { system: string; user: string; schema: z.ZodType<T>; fixtureKey: string }): Promise<T>;
}

const DEFAULT_FIXTURE_DIR = 'tests/fixtures/llm';

function fixtureClient(dir: string): LlmClient {
  return {
    async completeJson({ schema, fixtureKey }) {
      let raw: string;
      try {
        raw = await readFile(join(dir, `${fixtureKey}.json`), 'utf8');
      } catch {
        throw new Error(`fixture_missing:${fixtureKey}`);
      }
      return schema.parse(JSON.parse(raw));
    },
  };
}

function liveClient(env: NodeJS.ProcessEnv): LlmClient {
  const model = env.LLM_MODEL;
  if (!model) throw new Error('LLM_MODEL is not set');
  const openai = new OpenAI({ baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY });
  return {
    async completeJson({ system, user, schema }) {
      let lastError: unknown;
      // zod 검증에 실패하면 1회만 다시 묻는다
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await openai.chat.completions.create({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        });
        const content = res.choices[0]?.message?.content ?? '';
        try {
          return schema.parse(JSON.parse(content));
        } catch (err) {
          lastError = err;
        }
      }
      throw new Error(`llm_invalid_json: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    },
  };
}

/** LLM_MODE=fixture 면 디스크의 응답 파일만 읽는다 (네트워크 없음). 그 밖에는 OpenAI 호환 API. */
export function createLlmClient(env: NodeJS.ProcessEnv = process.env): LlmClient {
  if (env.LLM_MODE === 'fixture') return fixtureClient(env.LLM_FIXTURE_DIR ?? DEFAULT_FIXTURE_DIR);
  return liveClient(env);
}
