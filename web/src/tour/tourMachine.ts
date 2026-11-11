import { canTransition } from '../../../src/core/status.ts';
import type { EventKind, PledgeStatus } from '../../../src/core/types.ts';
import { TOUR_CANDIDATES } from './tourScenario.ts';

export type TourStep = 'source' | 'structure' | 'candidates' | 'publish';

export interface TourHistoryItem {
  kind: EventKind;
  from: PledgeStatus | null;
  to: PledgeStatus | null;
  reason: string;
}

export interface TourState {
  step: TourStep;
  status: PledgeStatus;
  evidence: { title: string; url: string }[];
  candidates: { id: string; title: string; url: string; state: 'pending' | 'adopted' | 'rejected' }[];
  history: TourHistoryItem[]; // 오래된 것 먼저 저장, 화면은 역순
  error: string | null;
}

export type TourAction =
  | { type: 'next' }
  | {
      type: 'decide';
      candidateId: string;
      decision: 'adopt' | 'reject';
      newStatus: PledgeStatus | null;
      reason: string;
    }
  | { type: 'reset' };

// 검수 RPC 와 같은 문구
const ALREADY_DECIDED = '이미 처리된 후보입니다';
const REASON_REQUIRED = '상태를 바꾸려면 이유를 한 줄 적어 주세요';
const NOT_ALLOWED = '이 상태로는 바로 바꿀 수 없습니다';
const PENDING_LEFT = '후보를 모두 처리해 주세요';

const NEXT_STEP: Record<TourStep, TourStep> = {
  source: 'structure',
  structure: 'candidates',
  candidates: 'publish',
  publish: 'publish',
};

export function initialTourState(): TourState {
  return {
    step: 'source',
    status: 'not_started',
    evidence: [],
    candidates: TOUR_CANDIDATES.map((c) => ({ id: c.id, title: c.title, url: c.url, state: 'pending' })),
    history: [{ kind: 'seed', from: null, to: 'not_started', reason: '근거 없음' }],
    error: null,
  };
}

function decide(state: TourState, action: Extract<TourAction, { type: 'decide' }>): TourState {
  const candidate = state.candidates.find((c) => c.id === action.candidateId);
  if (!candidate) return state;
  if (candidate.state !== 'pending') return { ...state, error: ALREADY_DECIDED };

  if (action.decision === 'reject') {
    return {
      ...state,
      candidates: state.candidates.map((c) => (c.id === candidate.id ? { ...c, state: 'rejected' } : c)),
      error: null,
    };
  }

  const changes = action.newStatus !== null && action.newStatus !== state.status;
  const reason = action.reason.trim();
  if (changes && reason === '') return { ...state, error: REASON_REQUIRED };
  if (changes && action.newStatus && !canTransition(state.status, action.newStatus)) {
    return { ...state, error: NOT_ALLOWED };
  }

  const history: TourHistoryItem[] = [
    ...state.history,
    { kind: 'evidence_added', from: null, to: null, reason: candidate.title },
  ];
  let status = state.status;
  if (changes && action.newStatus) {
    history.push({ kind: 'status_change', from: state.status, to: action.newStatus, reason });
    status = action.newStatus;
  }
  return {
    ...state,
    status,
    evidence: [...state.evidence, { title: candidate.title, url: candidate.url }],
    candidates: state.candidates.map((c) => (c.id === candidate.id ? { ...c, state: 'adopted' } : c)),
    history,
    error: null,
  };
}

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'reset':
      return initialTourState();
    case 'decide':
      return decide(state, action);
    case 'next': {
      if (state.step === 'publish') return state;
      if (state.step === 'candidates' && state.candidates.some((c) => c.state === 'pending')) {
        return { ...state, error: PENDING_LEFT };
      }
      return { ...state, step: NEXT_STEP[state.step], error: null };
    }
  }
}
