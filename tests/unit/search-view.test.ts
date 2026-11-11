import { describe, expect, it } from 'vitest';
import type { CatalogSearchRow } from '../../src/core/catalog.ts';
import { filterResults, resultCountText, SEARCH_FILTERS, sortTrackedFirst } from '../../web/src/lib/searchView.ts';

function row(id: string, tracked: boolean, level: 'metro' | 'local'): CatalogSearchRow {
  return {
    id,
    person_name: `가상 ${id}`,
    region_name: '가상시',
    office: level === 'metro' ? '도지사' : '시장',
    level,
    term_start: '2026-07-01',
    term_end: '2030-06-30',
    source_url: 'https://example.org',
    is_sample: true,
    tracked,
    pledge_count: 0,
  };
}

const rows: readonly CatalogSearchRow[] = [
  row('a-local', false, 'local'),
  row('b-metro', false, 'metro'),
  row('c-tracked', true, 'local'),
  row('d-local', false, 'local'),
  row('e-tracked', true, 'metro'),
];

describe('SEARCH_FILTERS', () => {
  it('전체·추적 중·광역·기초 순서', () => {
    expect(SEARCH_FILTERS).toEqual([
      { value: 'all', label: '전체' },
      { value: 'tracked', label: '추적 중' },
      { value: 'metro', label: '광역' },
      { value: 'local', label: '기초' },
    ]);
  });
});

describe('sortTrackedFirst', () => {
  it('추적 중을 앞에 두고 그룹 안 순서를 유지한다', () => {
    expect(sortTrackedFirst(rows).map((r) => r.id)).toEqual([
      'c-tracked',
      'e-tracked',
      'a-local',
      'b-metro',
      'd-local',
    ]);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const before = rows.map((r) => r.id);
    const out = sortTrackedFirst(rows);
    expect(rows.map((r) => r.id)).toEqual(before);
    expect(out).not.toBe(rows);
  });

  it('빈 배열은 빈 배열', () => {
    expect(sortTrackedFirst([])).toEqual([]);
  });
});

describe('filterResults', () => {
  it('all 은 전부', () => {
    expect(filterResults(rows, 'all').map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it('tracked 는 추적 중만', () => {
    expect(filterResults(rows, 'tracked').map((r) => r.id)).toEqual(['c-tracked', 'e-tracked']);
  });

  it('metro 는 광역만', () => {
    expect(filterResults(rows, 'metro').map((r) => r.id)).toEqual(['b-metro', 'e-tracked']);
  });

  it('local 은 기초만', () => {
    expect(filterResults(rows, 'local').map((r) => r.id)).toEqual(['a-local', 'c-tracked', 'd-local']);
  });
});

describe('resultCountText', () => {
  it('보이는 수와 전체가 같으면 결과 N명', () => {
    expect(resultCountText(3, 3)).toBe('결과 3명');
  });

  it('다르면 전체 수를 함께 적는다', () => {
    expect(resultCountText(1, 3)).toBe('결과 1명 (전체 3명)');
  });
});
