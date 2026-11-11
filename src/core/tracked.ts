import { STATUS_LABEL, STATUS_ORDER } from './status.ts';
import type { Official, PledgeStatus } from './types.ts';

export interface TrackedOfficialRow {
  id: string;
  person_name: string;
  region_name: string;
  office: string;
  pledgeCount: number;
  statusCounts: Record<PledgeStatus, number>; // STATUS_ORDER 의 모든 키, 없으면 0
  lastUpdated: string | null; // YYYY-MM-DD, max(pledge_events.event_date)
}
export interface TrackedStats {
  officials: number;
  pledges: number;
  evidence: number;
}

function zeroCounts(): Record<PledgeStatus, number> {
  const counts = {} as Record<PledgeStatus, number>;
  for (const s of STATUS_ORDER) counts[s] = 0;
  return counts;
}

// 샘플(is_sample=true)과 E2E 사본(id 가 'e2e' 로 시작)은 제외
export function isListedOfficial(o: Pick<Official, 'id' | 'is_sample'>): boolean {
  return !o.is_sample && !o.id.startsWith('e2e');
}

// pledges 를 official_id 로 묶어 행을 만들고 sortTrackedRows 로 정렬해 돌려준다
export function buildTrackedRows(
  officials: Pick<Official, 'id' | 'person_name' | 'region_name' | 'office' | 'is_sample'>[],
  pledges: { official_id: string; status: PledgeStatus }[],
  lastUpdated: Record<string, string | null>,
): TrackedOfficialRow[] {
  const byId = new Map<string, TrackedOfficialRow>();
  for (const o of officials) {
    if (!isListedOfficial(o)) continue;
    byId.set(o.id, {
      id: o.id,
      person_name: o.person_name,
      region_name: o.region_name,
      office: o.office,
      pledgeCount: 0,
      statusCounts: zeroCounts(),
      lastUpdated: lastUpdated[o.id] ?? null,
    });
  }
  for (const p of pledges) {
    const row = byId.get(p.official_id);
    if (!row) continue;
    row.pledgeCount += 1;
    row.statusCounts[p.status] = (row.statusCounts[p.status] ?? 0) + 1;
  }
  return sortTrackedRows([...byId.values()]);
}

// region_name → office 순, localeCompare(…, 'ko')
export function sortTrackedRows(rows: TrackedOfficialRow[]): TrackedOfficialRow[] {
  return [...rows].sort(
    (a, b) => a.region_name.localeCompare(b.region_name, 'ko') || a.office.localeCompare(b.office, 'ko'),
  );
}

// 예: "이행 2 · 진행 중 4 · 미착수 4 · 변경 1 · 폐기 1" (STATUS_ORDER 순, STATUS_LABEL 사용, 0 도 표시)
export function statusBarLabel(counts: Record<PledgeStatus, number>): string {
  return STATUS_ORDER.map((s) => `${STATUS_LABEL[s]} ${counts[s] ?? 0}`).join(' · ');
}

export function formatCount(n: number): string {
  return n.toLocaleString('ko-KR');
}

export const TRACKED_TEXT = {
  heading: '추적 중인 정치인',
  loading: '불러오는 중…',
  error: '추적 중인 정치인을 불러오지 못했습니다',
  empty: '아직 추적 중인 정치인이 없습니다',
  colName: '이름',
  colPlace: '직위 · 지역',
  colCount: '공약 수',
  colStatus: '상태 분포',
  colUpdated: '마지막 갱신',
  noUpdate: '—',
} as const;
export const INTRO_TEXT = {
  slogan: '공약은 당선 다음 날부터 잊힌다.',
  statsError: '숫자를 불러오지 못했습니다',
  statOfficials: '추적 중인 정치인',
  statPledges: '공약',
  statEvidence: '근거 링크',
  ctaSearch: '정치인 찾기',
  ctaTour: '검수 체험 해 보기',
} as const;
