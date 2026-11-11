import { describe, expect, it } from 'vitest';
import { FORBIDDEN_WORDS } from '../../src/core/dataset.ts';
import * as membership from '../../src/core/membership.ts';
import { HOW_IT_WORKS, safeNextPath } from '../../src/core/membership.ts';

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

describe('safeNextPath', () => {
  it('내부 경로는 그대로 돌려준다', () => {
    expect(safeNextPath('/o/x')).toBe('/o/x');
  });

  it('// 로 시작하거나 외부 주소면 /search', () => {
    expect(safeNextPath('//evil')).toBe('/search');
    expect(safeNextPath('https://x')).toBe('/search');
  });

  it('null·undefined·빈 문자열이면 /search', () => {
    expect(safeNextPath(null)).toBe('/search');
    expect(safeNextPath(undefined)).toBe('/search');
    expect(safeNextPath('')).toBe('/search');
  });
});

describe('HOW_IT_WORKS', () => {
  it('5단계를 정해진 순서로 둔다', () => {
    expect(HOW_IT_WORKS.map((s) => s.key)).toEqual(['source', 'structure', 'evidence', 'review', 'publish']);
    for (const s of HOW_IT_WORKS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });
});

describe('문구 중립성', () => {
  it('모든 문자열 상수에 FORBIDDEN_WORDS 가 없다', () => {
    const strings = collectStrings(Object.values(membership));
    expect(strings.length).toBeGreaterThan(20);
    for (const s of strings) {
      const hit = FORBIDDEN_WORDS.find((w) => s.includes(w));
      expect(hit, s).toBeUndefined();
    }
  });
});
