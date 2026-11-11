import type { Official } from '../../../src/core/types.ts';

// 체험 화면 전용 가상 데이터. DB 에 넣지 않고 브라우저 안에서만 쓴다.
export const TOUR_OFFICIAL: Official = {
  id: 'tour-oo-si',
  region_name: 'OO시',
  office: '시장',
  person_name: '가상 당선자',
  term_start: '2026-07-01',
  term_end: '2030-06-30',
  election_date: '2026-06-03',
  source_url: 'https://example.org/tour/pledge-book',
  source_kind: 'sample',
  is_sample: true,
};

export const TOUR_SOURCE_EXCERPT = [
  '3. 출퇴근이 편한 교통 도시',
  '  가. OO역 환승주차장 건립',
  '    - OO역 인근 시유지에 환승주차장 500면 규모 조성',
  '    - 임기 내 착공, 2029년 개장 목표',
  '    - 재원: 시비 및 국비 공모',
].join('\n');

export const TOUR_PLEDGE: {
  title: 'OO역 환승주차장 건립';
  category: '교통';
  keywords: ['환승주차장', 'OO역'];
  summary: string;
} = {
  title: 'OO역 환승주차장 건립',
  category: '교통',
  keywords: ['환승주차장', 'OO역'],
  summary: 'OO역 인근 시유지에 환승주차장 500면을 만들고 임기 안에 착공합니다.',
};

export const TOUR_CANDIDATES: readonly { id: 'tour-c1' | 'tour-c2'; title: string; url: string; source: 'press' }[] = [
  { id: 'tour-c1', title: 'OO시, 환승주차장 건립 예산 반영', url: 'https://example.org/tour/press-1', source: 'press' },
  { id: 'tour-c2', title: 'OO역 광장 문화 행사 개최', url: 'https://example.org/tour/press-2', source: 'press' },
];
