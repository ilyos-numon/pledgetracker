import { describe, expect, it } from 'vitest';
import { FORBIDDEN_WORDS } from '../../src/core/dataset.ts';
import { STATUS_ORDER } from '../../src/core/status.ts';
import {
  buildTrackedRows,
  formatCount,
  INTRO_TEXT,
  isListedOfficial,
  sortTrackedRows,
  statusBarLabel,
  TRACKED_TEXT,
  type TrackedOfficialRow,
} from '../../src/core/tracked.ts';
import type { PledgeStatus } from '../../src/core/types.ts';

function zero(): Record<PledgeStatus, number> {
  return { fulfilled: 0, in_progress: 0, not_started: 0, modified: 0, abandoned: 0 };
}

function off(id: string, region_name: string, office: string, is_sample = false) {
  return { id, person_name: `사람-${id}`, region_name, office, is_sample };
}

function row(id: string, region_name: string, office: string): TrackedOfficialRow {
  return {
    id,
    person_name: id,
    region_name,
    office,
    pledgeCount: 0,
    statusCounts: zero(),
    lastUpdated: null,
  };
}

describe('isListedOfficial', () => {
  it('샘플은 뺀다', () => {
    expect(isListedOfficial({ id: 'sample-oo-si', is_sample: true })).toBe(false);
  });
  it('e2e 로 시작하는 id 는 뺀다', () => {
    expect(isListedOfficial({ id: 'e2e-daegu', is_sample: false })).toBe(false);
    expect(isListedOfficial({ id: 'e2edaegu', is_sample: false })).toBe(false);
  });
  it('보통 정치인은 넣는다', () => {
    expect(isListedOfficial({ id: 'daegu-mayor-2026', is_sample: false })).toBe(true);
    expect(isListedOfficial({ id: 'president-2025', is_sample: false })).toBe(true);
  });
});

describe('buildTrackedRows', () => {
  const officials = [
    off('daegu-mayor-2026', '대구광역시', '시장'),
    off('president-2025', '대한민국', '대통령'),
    off('sample-oo-si', 'OO시', '시장', true),
    off('e2e-copy', '가상시', '시장'),
  ];
  const pledges: { official_id: string; status: PledgeStatus }[] = [
    { official_id: 'daegu-mayor-2026', status: 'fulfilled' },
    { official_id: 'daegu-mayor-2026', status: 'fulfilled' },
    { official_id: 'daegu-mayor-2026', status: 'in_progress' },
    { official_id: 'sample-oo-si', status: 'fulfilled' },
    { official_id: 'e2e-copy', status: 'abandoned' },
  ];
  const rows = buildTrackedRows(officials, pledges, { 'daegu-mayor-2026': '2026-10-01' });

  it('샘플·e2e 를 버리고 정렬해 돌려준다', () => {
    expect(rows.map((r) => r.id)).toEqual(['daegu-mayor-2026', 'president-2025']);
  });

  it('상태별 수를 세고 없는 상태는 0 으로 채운다', () => {
    const daegu = rows[0];
    expect(daegu.pledgeCount).toBe(3);
    expect(daegu.statusCounts).toEqual({ fulfilled: 2, in_progress: 1, not_started: 0, modified: 0, abandoned: 0 });
    expect(Object.keys(daegu.statusCounts).sort()).toEqual([...STATUS_ORDER].sort());
    expect(daegu.lastUpdated).toBe('2026-10-01');
    expect(daegu.person_name).toBe('사람-daegu-mayor-2026');
    expect(daegu.office).toBe('시장');
    expect(daegu.region_name).toBe('대구광역시');
  });

  it('공약이 없는 정치인도 0 행으로 남고 lastUpdated 는 null', () => {
    const president = rows[1];
    expect(president.pledgeCount).toBe(0);
    expect(president.statusCounts).toEqual(zero());
    expect(president.lastUpdated).toBeNull();
  });
});

describe('sortTrackedRows', () => {
  it('지역명 가나다순, 같으면 직위순', () => {
    const sorted = sortTrackedRows([
      row('busan', '부산광역시', '시장'),
      row('president', '대한민국', '대통령'),
      row('daegu', '대구광역시', '시장'),
      row('seoul-b', '서울특별시', '시장'),
      row('seoul-a', '서울특별시', '교육감'),
      row('gyeonggi', '경기도', '도지사'),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['gyeonggi', 'daegu', 'president', 'busan', 'seoul-a', 'seoul-b']);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const input = [row('b', '부산광역시', '시장'), row('a', '경기도', '도지사')];
    sortTrackedRows(input);
    expect(input.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('statusBarLabel', () => {
  it('STATUS_ORDER 순으로 0 까지 표시한다', () => {
    expect(statusBarLabel({ fulfilled: 2, in_progress: 4, not_started: 4, modified: 1, abandoned: 0 })).toBe(
      '이행 2 · 진행 중 4 · 미착수 4 · 변경 1 · 폐기 0',
    );
  });
});

describe('formatCount', () => {
  it('ko-KR 자리 구분', () => {
    expect(formatCount(1234)).toBe('1,234');
    expect(formatCount(0)).toBe('0');
  });
});

describe('문구', () => {
  it('금지어를 쓰지 않는다', () => {
    const strings = [...Object.values(TRACKED_TEXT), ...Object.values(INTRO_TEXT)];
    for (const s of strings) for (const w of FORBIDDEN_WORDS) expect(s).not.toContain(w);
  });
});
