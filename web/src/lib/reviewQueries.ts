import type { EvidenceCandidate, Objection, Official, Pledge, PledgeStatus } from '../../../src/core/types.ts';
import { supabase } from './supabase.ts';

export type PledgeRef = Pick<Pledge, 'id' | 'official_id' | 'title' | 'status'>;
export type CandidateRow = EvidenceCandidate & { pledge: PledgeRef | null };
export type ObjectionRow = Objection & { pledge: PledgeRef | null };
export type PledgeOption = Pick<Pledge, 'id' | 'seq' | 'title'>;

const ERROR_TEXT: Record<string, string> = {
  not_reviewer: '검수 권한이 없습니다',
  reason_required: '상태를 바꾸려면 이유를 한 줄 적어 주세요',
  invalid_transition: '이 상태로는 바로 바꿀 수 없습니다',
  already_decided: '이미 처리된 후보입니다',
  note_required: '처리 메모를 적어 주세요',
};
export const FALLBACK_ERROR = '처리하지 못했습니다';

// RPC 는 raise exception '<code>' 로 실패한다 → PostgREST error.message 가 code.
export function reviewErrorText(error: { message?: string } | null | undefined): string {
  return (error?.message && ERROR_TEXT[error.message]) || FALLBACK_ERROR;
}

export class ReviewError extends Error {}

function fail(error: { message?: string }): never {
  throw new ReviewError(reviewErrorText(error));
}

const PLEDGE_EMBED = 'pledge:pledges(id, official_id, title, status)';

export async function fetchOfficial(officialId: string): Promise<Official | null> {
  const res = await supabase.from('officials').select('*').eq('id', officialId).maybeSingle();
  if (res.error) throw res.error;
  return res.data as Official | null;
}

export async function fetchPledgeOptions(officialId: string): Promise<PledgeOption[]> {
  const res = await supabase.from('pledges').select('id, seq, title').eq('official_id', officialId).order('seq');
  if (res.error) throw res.error;
  return res.data as PledgeOption[];
}

// anon 은 objections 를 읽지 못하므로 insert 뒤 select 하지 않는다.
export async function submitObjection(row: { pledge_id: string; body: string; evidence_url: string | null }) {
  const res = await supabase.from('objections').insert(row);
  if (res.error) throw res.error;
}

export async function isReviewer(): Promise<boolean> {
  const res = await supabase.rpc('is_reviewer');
  if (res.error) throw res.error;
  return res.data === true;
}

export async function fetchPendingCandidates(): Promise<CandidateRow[]> {
  const res = await supabase
    .from('evidence_candidates')
    .select(`*, ${PLEDGE_EMBED}`)
    .eq('state', 'pending')
    .order('created_at', { ascending: false });
  if (res.error) throw res.error;
  return res.data as CandidateRow[];
}

export async function fetchOpenObjections(): Promise<ObjectionRow[]> {
  const res = await supabase
    .from('objections')
    .select(`*, ${PLEDGE_EMBED}`)
    .eq('state', 'open')
    .order('created_at', { ascending: false });
  if (res.error) throw res.error;
  return res.data as ObjectionRow[];
}

export async function reviewCandidate(
  candidateId: string,
  decision: 'adopt' | 'reject',
  newStatus: PledgeStatus | null,
  reason: string | null,
): Promise<void> {
  const res = await supabase.rpc('review_candidate', {
    p_candidate_id: candidateId,
    p_decision: decision,
    p_new_status: newStatus,
    p_reason: reason,
  });
  if (res.error) fail(res.error);
}

export async function resolveObjection(
  objectionId: string,
  decision: 'accepted' | 'rejected',
  note: string,
  newStatus: PledgeStatus | null,
): Promise<void> {
  const res = await supabase.rpc('resolve_objection', {
    p_objection_id: objectionId,
    p_decision: decision,
    p_note: note,
    p_new_status: newStatus,
  });
  if (res.error) fail(res.error);
}
