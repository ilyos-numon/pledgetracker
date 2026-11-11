export type PledgeStatus = 'not_started' | 'in_progress' | 'fulfilled' | 'modified' | 'abandoned';
export const CATEGORIES = ['교통', '교육', '복지', '환경', '경제', '행정', '문화', '안전', '도시', '기타'] as const;
export type Category = (typeof CATEGORIES)[number];
export type EvidenceKind =
  | 'press_release'
  | 'council_minutes'
  | 'budget'
  | 'official_page'
  | 'news'
  | 'objection'
  | 'other';
export type EventKind = 'seed' | 'status_change' | 'evidence_added' | 'objection_resolved';
export type SourceKind = 'nec' | 'municipality' | 'sample';

export interface Official {
  id: string; // ^[a-z0-9-]{3,60}$ 예: 2026-<region-slug>-mayor
  region_name: string; // 예: OO시
  office: string; // 예: 시장, 군수, 구청장, 도지사, 시도지사, 특별시장, 광역시장
  person_name: string; // 공인 이름 (데이터 파일·DB·화면에만)
  term_start: string; // YYYY-MM-DD
  term_end: string;
  election_date: string; // 2026-06-03
  source_url: string;
  source_kind: SourceKind;
  is_sample: boolean;
}
export interface Evidence {
  id?: string;
  pledge_id?: string;
  kind: EvidenceKind;
  title: string;
  url: string; // ^https?://
  published_at: string | null;
  locator: string | null; // 예: "p.112"
  note: string | null;
  checked_at: string | null; // 링크 실측일 YYYY-MM-DD
  added_by?: 'seed' | 'reviewer' | 'objection';
}
export interface Pledge {
  id: string; // `${official_id}-p${NNN}`
  official_id: string;
  seq: number;
  title: string; // 원문 표현 유지
  summary: string;
  category: Category;
  keywords: string[]; // 1..8개, 근거 매칭용
  source_url: string;
  source_locator: string | null;
  status: PledgeStatus;
  status_decided_at: string | null;
  status_reason: string;
}
export interface PledgeEvent {
  id: number;
  pledge_id: string;
  kind: EventKind;
  from_status: PledgeStatus | null;
  to_status: PledgeStatus | null;
  reason: string;
  evidence_id: string | null;
  objection_id: string | null;
  event_date: string; // YYYY-MM-DD
  created_at: string;
}
export interface EvidenceCandidate {
  id: string;
  pledge_id: string;
  title: string;
  url: string;
  published_at: string | null;
  source: string;
  matched_keywords: string[];
  score: number;
  llm_note: string | null;
  state: 'pending' | 'adopted' | 'rejected';
  created_at: string;
}
export interface Objection {
  id: string;
  pledge_id: string;
  body: string; // 10..2000자
  evidence_url: string | null;
  state: 'open' | 'accepted' | 'rejected';
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}
