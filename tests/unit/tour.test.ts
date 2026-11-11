import { describe, expect, it } from 'vitest';
import { initialTourState, type TourState, tourReducer } from '../../web/src/tour/tourMachine.ts';
import { TOUR_CANDIDATES, TOUR_OFFICIAL, TOUR_PLEDGE, TOUR_SOURCE_EXCERPT } from '../../web/src/tour/tourScenario.ts';

function toCandidates(s: TourState): TourState {
  return tourReducer(tourReducer(s, { type: 'next' }), { type: 'next' });
}

describe('tourScenario', () => {
  it('가상 당선자와 공약서 발췌를 쓴다', () => {
    expect(TOUR_OFFICIAL.id).toBe('tour-oo-si');
    expect(TOUR_OFFICIAL.is_sample).toBe(true);
    expect(TOUR_OFFICIAL.source_kind).toBe('sample');
    expect(TOUR_SOURCE_EXCERPT).toContain(TOUR_PLEDGE.title);
    expect(TOUR_CANDIDATES.map((c) => c.id)).toEqual(['tour-c1', 'tour-c2']);
  });
});

describe('tourReducer', () => {
  it('초기 상태는 원문 단계·미착수·후보 2개 대기·seed 이력 1개', () => {
    const s = initialTourState();
    expect(s.step).toBe('source');
    expect(s.status).toBe('not_started');
    expect(s.evidence).toEqual([]);
    expect(s.error).toBeNull();
    expect(s.candidates.map((c) => [c.id, c.state])).toEqual([
      ['tour-c1', 'pending'],
      ['tour-c2', 'pending'],
    ]);
    expect(s.history).toEqual([{ kind: 'seed', from: null, to: 'not_started', reason: '근거 없음' }]);
  });

  it('next 는 source → structure → candidates 순서로 간다', () => {
    let s = initialTourState();
    s = tourReducer(s, { type: 'next' });
    expect(s.step).toBe('structure');
    s = tourReducer(s, { type: 'next' });
    expect(s.step).toBe('candidates');
  });

  it('미처리 후보가 남아 있으면 next 는 오류를 내고 단계를 유지한다', () => {
    let s = toCandidates(initialTourState());
    s = tourReducer(s, { type: 'decide', candidateId: 'tour-c2', decision: 'reject', newStatus: null, reason: '' });
    s = tourReducer(s, { type: 'next' });
    expect(s.step).toBe('candidates');
    expect(s.error).toBe('후보를 모두 처리해 주세요');
  });

  it('이유 없이 상태를 바꾸면 오류를 내고 아무것도 바꾸지 않는다', () => {
    const before = toCandidates(initialTourState());
    const s = tourReducer(before, {
      type: 'decide',
      candidateId: 'tour-c1',
      decision: 'adopt',
      newStatus: 'in_progress',
      reason: '  ',
    });
    expect(s.error).toBe('상태를 바꾸려면 이유를 한 줄 적어 주세요');
    expect(s.status).toBe('not_started');
    expect(s.evidence).toEqual([]);
    expect(s.history).toEqual(before.history);
    expect(s.candidates[0]?.state).toBe('pending');
  });

  it('허용되지 않은 전이는 오류를 낸다', () => {
    const s = tourReducer(toCandidates(initialTourState()), {
      type: 'decide',
      candidateId: 'tour-c1',
      decision: 'adopt',
      newStatus: 'fulfilled',
      reason: '완료 보도',
    });
    expect(s.error).toBe('이 상태로는 바로 바꿀 수 없습니다');
    expect(s.status).toBe('not_started');
    expect(s.candidates[0]?.state).toBe('pending');
  });

  it('채택+진행 중이면 근거 1개·이력 3개가 되고 공개 단계로 간다', () => {
    let s = toCandidates(initialTourState());
    s = tourReducer(s, { type: 'next' });
    s = tourReducer(s, {
      type: 'decide',
      candidateId: 'tour-c1',
      decision: 'adopt',
      newStatus: 'in_progress',
      reason: '예산 반영',
    });
    expect(s.error).toBeNull();
    s = tourReducer(s, { type: 'decide', candidateId: 'tour-c2', decision: 'reject', newStatus: null, reason: '' });
    expect(s.history).toHaveLength(3);
    s = tourReducer(s, { type: 'next' });
    expect(s.step).toBe('publish');
    expect(s.error).toBeNull();
    expect(s.status).toBe('in_progress');
    expect(s.evidence).toEqual([{ title: TOUR_CANDIDATES[0]?.title, url: TOUR_CANDIDATES[0]?.url }]);
    expect(s.candidates.map((c) => c.state)).toEqual(['adopted', 'rejected']);
    expect(s.history.map((h) => h.kind)).toEqual(['seed', 'evidence_added', 'status_change']);
    expect(s.history[2]).toEqual({
      kind: 'status_change',
      from: 'not_started',
      to: 'in_progress',
      reason: '예산 반영',
    });
    expect(tourReducer(s, { type: 'next' })).toEqual(s);
  });

  it('상태를 유지하고 채택하면 근거 추가 이력만 남는다', () => {
    const s = tourReducer(toCandidates(initialTourState()), {
      type: 'decide',
      candidateId: 'tour-c1',
      decision: 'adopt',
      newStatus: null,
      reason: '',
    });
    expect(s.status).toBe('not_started');
    expect(s.history.map((h) => h.kind)).toEqual(['seed', 'evidence_added']);
    expect(s.evidence).toHaveLength(1);
  });

  it('이미 처리된 후보는 오류를 낸다', () => {
    let s = toCandidates(initialTourState());
    s = tourReducer(s, { type: 'decide', candidateId: 'tour-c2', decision: 'reject', newStatus: null, reason: '' });
    const again = tourReducer(s, {
      type: 'decide',
      candidateId: 'tour-c2',
      decision: 'adopt',
      newStatus: null,
      reason: '',
    });
    expect(again.error).toBe('이미 처리된 후보입니다');
    expect(again.candidates[1]?.state).toBe('rejected');
    expect(again.evidence).toEqual([]);
  });

  it('reset 은 초기 상태로 돌아간다', () => {
    let s = toCandidates(initialTourState());
    s = tourReducer(s, { type: 'decide', candidateId: 'tour-c2', decision: 'reject', newStatus: null, reason: '' });
    s = tourReducer(s, { type: 'reset' });
    expect(s).toEqual(initialTourState());
  });
});
