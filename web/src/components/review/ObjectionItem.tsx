import { Alert, Anchor, Badge, Button, Card, Group, NativeSelect, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../../../../src/core/status.ts';
import type { PledgeStatus } from '../../../../src/core/types.ts';
import { type ObjectionRow, ReviewError, resolveObjection } from '../../lib/reviewQueries.ts';

const NOTE_REQUIRED = '처리 메모를 적어 주세요';

export default function ObjectionItem({ objection, onDone }: { objection: ObjectionRow; onDone: () => void }) {
  const [decision, setDecision] = useState<'accepted' | 'rejected' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = objection.pledge?.status ?? null;
  // 받아들임은 정정이므로 현재 상태를 뺀 모든 상태로 바꿀 수 있다.
  const corrections = STATUS_ORDER.filter((s) => s !== current);

  const form = useForm({
    mode: 'controlled',
    initialValues: { note: '', status: '' },
    validate: {
      note: (value) => (value.trim().length < 2 ? NOTE_REQUIRED : null),
    },
  });

  async function submit(values: { note: string; status: string }) {
    if (!decision) return;
    setBusy(true);
    setError(null);
    try {
      const newStatus = decision === 'accepted' && values.status ? (values.status as PledgeStatus) : null;
      await resolveObjection(objection.id, decision, values.note.trim(), newStatus);
      onDone();
    } catch (e) {
      setError(e instanceof ReviewError ? e.message : '처리하지 못했습니다');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card withBorder data-testid="objection-item" data-objection-id={objection.id}>
      <Stack gap="xs">
        <Group gap="xs">
          <Text size="sm">공약: {objection.pledge?.title ?? objection.pledge_id}</Text>
          {current ? (
            <Badge color={STATUS_COLOR[current]} variant="light">
              {STATUS_LABEL[current]}
            </Badge>
          ) : null}
        </Group>
        <Text style={{ whiteSpace: 'pre-wrap' }}>{objection.body}</Text>
        <Text size="sm" c="dimmed">
          접수 {objection.created_at.slice(0, 10)}
          {objection.evidence_url ? (
            <>
              {' · '}
              <Anchor href={objection.evidence_url} target="_blank" rel="noopener" size="sm">
                첨부 링크
              </Anchor>
            </>
          ) : null}
        </Text>
        <Group gap="xs">
          <Button
            variant={decision === 'accepted' ? 'filled' : 'default'}
            onClick={() => setDecision('accepted')}
            disabled={busy}
          >
            받아들임
          </Button>
          <Button
            variant={decision === 'rejected' ? 'filled' : 'default'}
            onClick={() => setDecision('rejected')}
            disabled={busy}
          >
            받아들이지 않음
          </Button>
        </Group>
        {decision ? (
          <form onSubmit={form.onSubmit(submit)}>
            <Stack gap="xs">
              <TextInput label="처리 메모" {...form.getInputProps('note')} />
              {decision === 'accepted' ? (
                <NativeSelect
                  label="상태 정정"
                  data={[
                    { value: '', label: '선택 안 함' },
                    ...corrections.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
                  ]}
                  {...form.getInputProps('status')}
                />
              ) : null}
              <Group>
                <Button type="submit" loading={busy}>
                  처리
                </Button>
              </Group>
            </Stack>
          </form>
        ) : null}
        {error ? (
          <Alert data-testid="review-error" color="yellow" variant="light">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </Card>
  );
}
