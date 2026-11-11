import type { Category, EventKind, EvidenceKind, Pledge, PledgeStatus } from './types.ts';

export const STATUS_ORDER: readonly PledgeStatus[] = [
  'fulfilled',
  'in_progress',
  'not_started',
  'modified',
  'abandoned',
];

export const STATUS_LABEL: Record<PledgeStatus, string> = {
  not_started: '미착수',
  in_progress: '진행 중',
  fulfilled: '이행',
  modified: '변경',
  abandoned: '폐기',
};

// Mantine 색 이름. 정당 색과 겹치지 않도록 빨강·파랑 계열은 쓰지 않는다.
export const STATUS_COLOR: Record<PledgeStatus, string> = {
  fulfilled: 'teal',
  in_progress: 'lime',
  not_started: 'gray',
  modified: 'yellow',
  abandoned: 'dark',
};

export const ALLOWED_TRANSITIONS: Record<PledgeStatus, readonly PledgeStatus[]> = {
  not_started: ['in_progress', 'abandoned'],
  in_progress: ['fulfilled', 'modified', 'abandoned'],
  fulfilled: [],
  modified: [],
  abandoned: [],
};

export const EVENT_LABEL: Record<EventKind, string> = {
  seed: '데모 판정',
  status_change: '상태 변경',
  evidence_added: '근거 추가',
  objection_resolved: '이의 제기 처리',
};

export const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  press_release: '보도자료',
  council_minutes: '의회 회의록',
  budget: '예산서',
  official_page: '공식 누리집',
  news: '언론 보도',
  objection: '이의 제기 첨부',
  other: '기타',
};

export const DEMO_NOTICE =
  '데모 판정 — 상태는 시연을 위해 공개 자료를 보고 임시로 정한 값이며 공식 평가가 아닙니다. 근거 링크로 직접 확인하세요.';

export const SAMPLE_NOTICE = '가상 데이터';

export function countByStatus(pledges: Pick<Pledge, 'status'>[]): Record<PledgeStatus, number> {
  const counts: Record<PledgeStatus, number> = {
    fulfilled: 0,
    in_progress: 0,
    not_started: 0,
    modified: 0,
    abandoned: 0,
  };
  for (const p of pledges) counts[p.status] += 1;
  return counts;
}

export function countByCategory(pledges: Pick<Pledge, 'category'>[]): Partial<Record<Category, number>> {
  const counts: Partial<Record<Category, number>> = {};
  for (const p of pledges) counts[p.category] = (counts[p.category] ?? 0) + 1;
  return counts;
}

export function canTransition(from: PledgeStatus, to: PledgeStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
