import { Alert, Anchor, Card, Group, Loader, Progress, Stack, Table, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../../../../src/core/status.ts';
import { formatCount, statusBarLabel, TRACKED_TEXT, type TrackedOfficialRow } from '../../../../src/core/tracked.ts';
import { fetchTrackedOfficials } from '../../lib/trackedQueries.ts';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; rows: TrackedOfficialRow[] };

// 공약이 없으면 회색 빈 막대. 세그먼트는 STATUS_ORDER 순서로 쌓는다.
function StatusBar({ row }: { row: TrackedOfficialRow }) {
  const total = row.pledgeCount;
  return (
    <Progress.Root
      size="lg"
      role="img"
      aria-label={statusBarLabel(row.statusCounts)}
      data-testid="tracked-status-bar"
      style={{ minWidth: 120 }}
    >
      {total === 0
        ? null
        : STATUS_ORDER.map((s) =>
            row.statusCounts[s] > 0 ? (
              <Progress.Section
                key={s}
                value={(row.statusCounts[s] / total) * 100}
                color={STATUS_COLOR[s]}
                title={`${STATUS_LABEL[s]} ${row.statusCounts[s]}`}
              />
            ) : null,
          )}
    </Progress.Root>
  );
}

function NameLink({ row }: { row: TrackedOfficialRow }) {
  return (
    <Anchor component={Link} to={`/o/${row.id}`} fw={700} c="teal.8" data-testid="tracked-name">
      {row.person_name}
    </Anchor>
  );
}

function place(row: TrackedOfficialRow): string {
  return `${row.office} · ${row.region_name}`;
}

function DesktopTable({ rows }: { rows: TrackedOfficialRow[] }) {
  return (
    <Table.ScrollContainer minWidth={640}>
      <Table data-testid="tracked-table" verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{TRACKED_TEXT.colName}</Table.Th>
            <Table.Th>{TRACKED_TEXT.colPlace}</Table.Th>
            <Table.Th ta="right">{TRACKED_TEXT.colCount}</Table.Th>
            <Table.Th w="30%">{TRACKED_TEXT.colStatus}</Table.Th>
            <Table.Th>{TRACKED_TEXT.colUpdated}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.id} data-testid="tracked-row" data-official-id={row.id}>
              <Table.Td>
                <NameLink row={row} />
              </Table.Td>
              <Table.Td>{place(row)}</Table.Td>
              <Table.Td ta="right" data-testid="tracked-pledge-count">
                {formatCount(row.pledgeCount)}
              </Table.Td>
              <Table.Td>
                <StatusBar row={row} />
              </Table.Td>
              <Table.Td data-testid="tracked-updated">{row.lastUpdated ?? TRACKED_TEXT.noUpdate}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

// 좁은 화면: 같은 test id 를 가진 카드 목록. 가로 스크롤 없이 한 열로 읽힌다.
function MobileList({ rows }: { rows: TrackedOfficialRow[] }) {
  return (
    <Stack gap="xs" data-testid="tracked-table" role="list" aria-label={TRACKED_TEXT.heading}>
      {rows.map((row) => (
        <Card key={row.id} withBorder padding="sm" role="listitem" data-testid="tracked-row" data-official-id={row.id}>
          <Stack gap={6}>
            <Group justify="space-between" align="baseline" wrap="wrap" gap="xs">
              <NameLink row={row} />
              <Text size="sm" c="dimmed">
                {place(row)}
              </Text>
            </Group>
            <StatusBar row={row} />
            <Group justify="space-between" gap="xs" wrap="wrap">
              <Text size="sm">
                {TRACKED_TEXT.colCount} <span data-testid="tracked-pledge-count">{formatCount(row.pledgeCount)}</span>
              </Text>
              <Text size="sm" c="dimmed">
                {TRACKED_TEXT.colUpdated}{' '}
                <span data-testid="tracked-updated">{row.lastUpdated ?? TRACKED_TEXT.noUpdate}</span>
              </Text>
            </Group>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

// 상태 막대 색 범례. 막대만으로는 색이 무엇인지 알 수 없으므로 한 번 보여 준다.
function Legend() {
  return (
    <Group gap="sm" wrap="wrap" aria-hidden="true">
      {STATUS_ORDER.map((s) => (
        <Group key={s} gap={4} wrap="nowrap">
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: 2,
              background: `var(--mantine-color-${STATUS_COLOR[s]}-filled)`,
            }}
          />
          <Text size="xs" c="dimmed">
            {STATUS_LABEL[s]}
          </Text>
        </Group>
      ))}
    </Group>
  );
}

export default function TrackedOfficialsTable() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const narrow = useMediaQuery('(max-width: 47.99em)', false, { getInitialValueInEffect: false });

  useEffect(() => {
    let alive = true;
    fetchTrackedOfficials()
      .then((rows) => {
        if (alive) setState({ kind: 'ready', rows });
      })
      .catch(() => {
        if (alive) setState({ kind: 'error' });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === 'loading')
    return (
      <Group data-testid="tracked-loading" gap="xs">
        <Loader size="sm" color="teal" />
        <Text c="dimmed">{TRACKED_TEXT.loading}</Text>
      </Group>
    );
  if (state.kind === 'error')
    return (
      <Alert color="yellow" variant="light" data-testid="tracked-error">
        {TRACKED_TEXT.error}
      </Alert>
    );
  if (state.rows.length === 0)
    return (
      <Text data-testid="tracked-empty" c="dimmed">
        {TRACKED_TEXT.empty}
      </Text>
    );
  return (
    <Stack gap="xs">
      <Legend />
      {narrow ? <MobileList rows={state.rows} /> : <DesktopTable rows={state.rows} />}
    </Stack>
  );
}
