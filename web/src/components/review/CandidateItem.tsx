import { Alert, Anchor, Badge, Button, Card, Group, Radio, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { ALLOWED_TRANSITIONS, STATUS_COLOR, STATUS_LABEL } from '../../../../src/core/status.ts';
import type { PledgeStatus } from '../../../../src/core/types.ts';
import { type CandidateRow, ReviewError, reviewCandidate } from '../../lib/reviewQueries.ts';

const KEEP = 'keep';
const REASON_REQUIRED = '상태를 바꾸려면 이유를 한 줄 적어 주세요';

export default function CandidateItem({ candidate, onDone }: { candidate: CandidateRow; onDone: () => void }) {
  const [adopting, setAdopting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = candidate.pledge?.status ?? null;
  const transitions = current ? ALLOWED_TRANSITIONS[current] : [];

  const form = useForm({
    mode: 'controlled',
    initialValues: { status: KEEP, reason: '' },
    validate: {
      reason: (value, values) => (values.status !== KEEP && value.trim() === '' ? REASON_REQUIRED : null),
    },
  });

  async function run(decision: 'adopt' | 'reject', newStatus: PledgeStatus | null, reason: string | null) {
    setBusy(true);
    setError(null);
    try {
      await reviewCandidate(candidate.id, decision, newStatus, reason);
      onDone();
    } catch (e) {
      setError(e instanceof ReviewError ? e.message : '처리하지 못했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card withBorder data-testid="candidate-item" data-candidate-id={candidate.id}>
      <Stack gap="xs">
        <Anchor href={candidate.url} target="_blank" rel="noopener" fw={600}>
          {candidate.title}
        </Anchor>
        <Text size="sm" c="dimmed">
          {candidate.source} · {candidate.published_at ?? '날짜 없음'} · 매칭어 {candidate.matched_keywords.join(', ')}
        </Text>
        <Group gap="xs">
          <Text size="sm">공약: {candidate.pledge?.title ?? candidate.pledge_id}</Text>
          {current ? (
            <Badge color={STATUS_COLOR[current]} variant="light">
              {STATUS_LABEL[current]}
            </Badge>
          ) : null}
        </Group>
        {candidate.llm_note ? (
          <Text data-testid="llm-note" size="sm" c="dimmed">
            자동 메모(참고용): {candidate.llm_note}
          </Text>
        ) : null}
        {adopting ? (
          <form
            onSubmit={form.onSubmit((v) =>
              run('adopt', v.status === KEEP ? null : (v.status as PledgeStatus), v.reason),
            )}
          >
            <Stack gap="xs">
              <Radio.Group label="상태 변경" {...form.getInputProps('status')}>
                <Group gap="md" mt={4}>
                  <Radio value={KEEP} label="유지" />
                  {transitions.map((s) => (
                    <Radio key={s} value={s} label={STATUS_LABEL[s]} />
                  ))}
                </Group>
              </Radio.Group>
              <TextInput label="이유" {...form.getInputProps('reason')} />
              <Group gap="xs">
                <Button type="submit" loading={busy}>
                  확정
                </Button>
                <Button variant="subtle" color="gray" onClick={() => setAdopting(false)} disabled={busy}>
                  취소
                </Button>
              </Group>
            </Stack>
          </form>
        ) : (
          <Group gap="xs">
            <Button onClick={() => setAdopting(true)} disabled={busy}>
              근거로 채택
            </Button>
            <Button variant="default" onClick={() => run('reject', null, null)} loading={busy}>
              무관
            </Button>
          </Group>
        )}
        {error ? (
          <Alert data-testid="review-error" color="yellow" variant="light">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </Card>
  );
}
