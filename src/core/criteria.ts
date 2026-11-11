import { STATUS_LABEL } from './status.ts';
import type { PledgeStatus } from './types.ts';

const DEFINITIONS: Record<PledgeStatus, string> = {
  not_started: '예산 편성·사업 착수·조례 제정 같은 공식 근거가 확인되지 않음',
  in_progress: '예산 반영·용역 발주·착공 등 착수를 보여주는 공식 근거 1건 이상',
  fulfilled: '완료·개통·시행을 보여주는 공식 근거 1건 이상',
  modified: '규모·방식·대상이 바뀌었다는 공식 근거',
  abandoned: '철회 또는 추진 불가 판단을 보여주는 공식 근거',
};

const CRITERIA_ORDER: readonly PledgeStatus[] = ['not_started', 'in_progress', 'fulfilled', 'modified', 'abandoned'];

export const CRITERIA: { statuses: { status: PledgeStatus; label: string; definition: string }[]; rules: string[] } = {
  statuses: CRITERIA_ORDER.map((status) => ({ status, label: STATUS_LABEL[status], definition: DEFINITIONS[status] })),
  rules: [
    '근거가 없으면 미착수로 둔다',
    '모든 상태 변경에는 근거 링크와 이유 한 줄을 남긴다',
    '공약의 좋고 나쁨은 평가하지 않는다',
    '판정일은 마지막으로 상태를 정한 날이다',
    '이의 제기는 검수자가 확인하고 처리 결과를 이력에 남긴다',
    '현재 판정은 시연용 데모 판정이다',
  ],
};
