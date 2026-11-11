import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Radio,
  Stack,
  Stepper,
  Text,
  TextInput,
  Timeline,
  Title,
} from '@mantine/core';
import { useReducer, useState } from 'react';
import { TOUR_NOTICE } from '../../../src/core/membership.ts';
import { ALLOWED_TRANSITIONS, EVENT_LABEL, STATUS_COLOR, STATUS_LABEL } from '../../../src/core/status.ts';
import type { PledgeStatus } from '../../../src/core/types.ts';
import Layout from '../components/Layout.tsx';
import {
  initialTourState,
  type TourHistoryItem,
  type TourState,
  type TourStep,
  tourReducer,
} from '../tour/tourMachine.ts';
import { TOUR_OFFICIAL, TOUR_PLEDGE, TOUR_SOURCE_EXCERPT } from '../tour/tourScenario.ts';

const KEEP = 'keep';
const STEPS: readonly { key: TourStep; label: string; guide: string }[] = [
  {
    key: 'source',
    label: '원문',
    guide: '당선인 선거공약서의 한 대목입니다. 원문을 그대로 보관해 두고 언제든 대조합니다.',
  },
  {
    key: 'structure',
    label: '구조화',
    guide: '원문에서 공약 하나를 떼어 분야·키워드와 함께 정리합니다. 처음 상태는 미착수입니다.',
  },
  {
    key: 'candidates',
    label: '근거 후보',
    guide: '공약 키워드가 들어간 보도자료가 후보로 모였습니다. 읽어 보고 근거로 채택하거나 무관으로 넘기세요.',
  },
  {
    key: 'publish',
    label: '공개',
    guide: '검수 결과가 공개 화면에 이렇게 나갑니다. 근거 링크와 변경 이력이 함께 보입니다.',
  },
];

function StatusBadge({ status, testId }: { status: PledgeStatus; testId?: string }) {
  return (
    <Badge color={STATUS_COLOR[status]} variant="light" data-testid={testId}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function PledgeCard({ status }: { status: PledgeStatus }) {
  return (
    <Card data-testid="tour-pledge" withBorder radius="md">
      <Stack gap="xs">
        <Group justify="space-between">
          <Text fw={600}>{TOUR_PLEDGE.title}</Text>
          <StatusBadge status={status} />
        </Group>
        <Text size="sm">분야: {TOUR_PLEDGE.category}</Text>
        <Group gap={6}>
          <Text size="sm">키워드:</Text>
          {TOUR_PLEDGE.keywords.map((k) => (
            <Badge key={k} color="gray" variant="outline">
              {k}
            </Badge>
          ))}
        </Group>
        <Text size="sm" c="dimmed">
          {TOUR_PLEDGE.summary}
        </Text>
      </Stack>
    </Card>
  );
}

function CandidateCard({
  candidate,
  status,
  onDecide,
}: {
  candidate: TourState['candidates'][number];
  status: PledgeStatus;
  onDecide: (decision: 'adopt' | 'reject', newStatus: PledgeStatus | null, reason: string) => void;
}) {
  const [choice, setChoice] = useState(KEEP);
  const [reason, setReason] = useState('');
  const transitions = ALLOWED_TRANSITIONS[status];
  return (
    <Card data-testid="tour-candidate" data-candidate-id={candidate.id} withBorder radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={600}>{candidate.title}</Text>
          {candidate.state === 'adopted' ? (
            <Badge color="teal" variant="light">
              채택됨
            </Badge>
          ) : candidate.state === 'rejected' ? (
            <Badge color="gray" variant="light">
              무관
            </Badge>
          ) : null}
        </Group>
        <Text size="sm" c="dimmed">
          보도자료 · 매칭어 {TOUR_PLEDGE.keywords.filter((k) => candidate.title.includes(k)).join(', ') || '-'}
        </Text>
        {candidate.state === 'pending' ? (
          <>
            <Radio.Group label="상태 변경" name={`status-${candidate.id}`} value={choice} onChange={setChoice}>
              <Group gap="md" mt={4}>
                <Radio value={KEEP} label="유지" color="teal" />
                {transitions.map((s) => (
                  <Radio key={s} value={s} label={STATUS_LABEL[s]} color="teal" />
                ))}
              </Group>
            </Radio.Group>
            <TextInput
              label="이유"
              placeholder="상태를 바꿀 때 한 줄로 적어 주세요"
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
            <Group gap="xs">
              <Button
                color="teal"
                onClick={() => onDecide('adopt', choice === KEEP ? null : (choice as PledgeStatus), reason)}
              >
                근거로 채택
              </Button>
              <Button variant="default" onClick={() => onDecide('reject', null, '')}>
                무관
              </Button>
            </Group>
          </>
        ) : null}
      </Stack>
    </Card>
  );
}

function historyText(h: TourHistoryItem): string {
  if (h.kind === 'status_change' && h.from && h.to) {
    return `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]} · ${h.reason}`;
  }
  if (h.kind === 'seed' && h.to) return `${STATUS_LABEL[h.to]} · ${h.reason}`;
  return h.reason;
}

export default function Tour() {
  const [state, dispatch] = useReducer(tourReducer, undefined, initialTourState);
  const active = STEPS.findIndex((s) => s.key === state.step);
  const current = STEPS[active];

  return (
    <Layout official={TOUR_OFFICIAL}>
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1}>검수 체험</Title>
          <Text c="dimmed">
            {TOUR_OFFICIAL.region_name} {TOUR_OFFICIAL.office} {TOUR_OFFICIAL.person_name}의 가상 공약 하나로 원문에서
            공개까지 따라가 봅니다.
          </Text>
        </Stack>
        <Alert data-testid="tour-notice" color="gray" variant="outline">
          {TOUR_NOTICE}
        </Alert>

        <div data-testid="tour-step" data-step={state.step}>
          <Stepper active={active} allowNextStepsSelect={false} color="teal" size="sm">
            {STEPS.map((s) => (
              <Stepper.Step key={s.key} label={s.label} allowStepSelect={false} />
            ))}
          </Stepper>
        </div>

        {current ? <Text>{current.guide}</Text> : null}

        {state.step === 'source' ? (
          <Card data-testid="tour-source" withBorder radius="md">
            <Stack gap="xs">
              <Text size="sm" c="dimmed">
                가상 선거공약서 발췌 ·{' '}
                <Anchor href={TOUR_OFFICIAL.source_url} target="_blank" rel="noopener" size="sm">
                  원문 위치
                </Anchor>
              </Text>
              <Code block>{TOUR_SOURCE_EXCERPT}</Code>
            </Stack>
          </Card>
        ) : null}

        {state.step === 'structure' ? <PledgeCard status={state.status} /> : null}

        {state.step === 'candidates' ? (
          <Stack gap="sm">
            <Group gap="xs">
              <Text size="sm">현재 상태</Text>
              <StatusBadge status={state.status} testId="tour-current-status" />
            </Group>
            {state.candidates.map((c) => (
              <CandidateCard
                key={c.id}
                candidate={c}
                status={state.status}
                onDecide={(decision, newStatus, reason) =>
                  dispatch({ type: 'decide', candidateId: c.id, decision, newStatus, reason })
                }
              />
            ))}
          </Stack>
        ) : null}

        {state.step === 'publish' ? (
          <Stack gap="md">
            <Card data-testid="tour-result" withBorder radius="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600}>{TOUR_PLEDGE.title}</Text>
                  <StatusBadge status={state.status} />
                </Group>
                <Text size="sm">근거 {state.evidence.length}건</Text>
                {state.evidence.map((e) => (
                  <Anchor
                    key={e.url}
                    data-testid="tour-evidence-link"
                    href={e.url}
                    target="_blank"
                    rel="noopener"
                    size="sm"
                  >
                    {e.title}
                  </Anchor>
                ))}
              </Stack>
            </Card>
            <Stack gap="xs">
              <Title order={2} size="h4">
                변경 이력
              </Title>
              <Timeline bulletSize={14} lineWidth={2} color="gray">
                {[...state.history].reverse().map((h) => (
                  <Timeline.Item
                    key={`${h.kind}-${h.from}-${h.to}-${h.reason}`}
                    data-testid="tour-history-item"
                    title={EVENT_LABEL[h.kind]}
                  >
                    <Text size="sm" c="dimmed">
                      {historyText(h)}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            </Stack>
          </Stack>
        ) : null}

        {state.error ? (
          <Alert data-testid="tour-error" color="yellow" variant="light">
            {state.error}
          </Alert>
        ) : null}

        <Group>
          {state.step === 'publish' ? (
            <Button variant="default" onClick={() => dispatch({ type: 'reset' })}>
              처음부터 다시
            </Button>
          ) : (
            <Button color="teal" onClick={() => dispatch({ type: 'next' })}>
              다음
            </Button>
          )}
        </Group>
      </Stack>
    </Layout>
  );
}
