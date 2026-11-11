import { describe, expect, it } from 'vitest';
import { CRITERIA } from '../../src/core/criteria.ts';
import { FORBIDDEN_WORDS } from '../../src/core/dataset.ts';
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  countByCategory,
  countByStatus,
  DEMO_NOTICE,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
} from '../../src/core/status.ts';
import type { PledgeStatus } from '../../src/core/types.ts';

const ALL: PledgeStatus[] = ['not_started', 'in_progress', 'fulfilled', 'modified', 'abandoned'];

describe('countByStatus', () => {
  it('빈 목록이면 다섯 상태 모두 0', () => {
    expect(countByStatus([])).toEqual({ fulfilled: 0, in_progress: 0, not_started: 0, modified: 0, abandoned: 0 });
  });

  it('상태별 개수를 센다', () => {
    const pledges: { status: PledgeStatus }[] = [
      { status: 'fulfilled' },
      { status: 'fulfilled' },
      { status: 'in_progress' },
      { status: 'not_started' },
      { status: 'abandoned' },
    ];
    expect(countByStatus(pledges)).toEqual({ fulfilled: 2, in_progress: 1, not_started: 1, modified: 0, abandoned: 1 });
  });
});

describe('countByCategory', () => {
  it('공약이 있는 분야만 담는다', () => {
    const result = countByCategory([{ category: '교통' }, { category: '교통' }, { category: '복지' }]);
    expect(result).toEqual({ 교통: 2, 복지: 1 });
    expect(Object.keys(result)).not.toContain('교육');
  });
});

describe('canTransition', () => {
  it('허용 전이만 true', () => {
    expect(canTransition('not_started', 'in_progress')).toBe(true);
    expect(canTransition('not_started', 'abandoned')).toBe(true);
    expect(canTransition('in_progress', 'fulfilled')).toBe(true);
    expect(canTransition('in_progress', 'modified')).toBe(true);
    expect(canTransition('in_progress', 'abandoned')).toBe(true);
  });

  it('건너뛰기·되돌리기·제자리는 false', () => {
    expect(canTransition('not_started', 'fulfilled')).toBe(false);
    expect(canTransition('fulfilled', 'in_progress')).toBe(false);
    expect(canTransition('in_progress', 'not_started')).toBe(false);
    for (const s of ALL) expect(canTransition(s, s)).toBe(false);
  });

  it('종결 상태에서는 어디로도 갈 수 없다', () => {
    for (const s of ['fulfilled', 'modified', 'abandoned'] as const) {
      expect(ALLOWED_TRANSITIONS[s]).toEqual([]);
      for (const to of ALL) expect(canTransition(s, to)).toBe(false);
    }
  });
});

describe('표시 상수', () => {
  it('STATUS_ORDER 는 다섯 상태를 한 번씩', () => {
    expect([...STATUS_ORDER].sort()).toEqual([...ALL].sort());
    expect(STATUS_ORDER[0]).toBe('fulfilled');
  });

  it('라벨', () => {
    expect(STATUS_LABEL).toEqual({
      not_started: '미착수',
      in_progress: '진행 중',
      fulfilled: '이행',
      modified: '변경',
      abandoned: '폐기',
    });
  });

  it('상태 색에 빨강·파랑 계열이 없다', () => {
    const banned = ['red', 'pink', 'blue', 'indigo', 'cyan', 'grape', 'violet'];
    for (const s of ALL) expect(banned).not.toContain(STATUS_COLOR[s]);
  });

  it('데모 고지와 판정 기준에 금지어가 없다', () => {
    const texts = [
      DEMO_NOTICE,
      ...Object.values(STATUS_LABEL),
      ...CRITERIA.rules,
      ...CRITERIA.statuses.map((s) => s.definition),
    ];
    for (const text of texts) {
      for (const word of FORBIDDEN_WORDS) expect(text).not.toContain(word);
    }
  });

  it('판정 기준은 다섯 상태와 "근거가 없으면 미착수로 둔다" 규칙을 갖는다', () => {
    expect(CRITERIA.statuses.map((s) => s.label)).toEqual(['미착수', '진행 중', '이행', '변경', '폐기']);
    expect(CRITERIA.rules).toContain('근거가 없으면 미착수로 둔다');
  });
});
