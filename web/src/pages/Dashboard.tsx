import { Anchor, Button, Group, Loader, Progress, Stack, Tabs, Text, Title, UnstyledButton } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { countByCategory, countByStatus, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER } from '../../../src/core/status.ts';
import { CATEGORIES, type PledgeStatus } from '../../../src/core/types.ts';
import Layout from '../components/Layout.tsx';
import PledgeCard from '../components/public/PledgeCard.tsx';
import { type Board, fetchBoard } from '../lib/publicQueries.ts';

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; board: Board | null };

function isStatus(v: string | null): v is PledgeStatus {
  return v !== null && (STATUS_ORDER as readonly string[]).includes(v);
}

export default function Dashboard() {
  const { officialId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    fetchBoard(officialId)
      .then((board) => alive && setState({ kind: 'ready', board }))
      .catch((e: Error) => alive && setState({ kind: 'error', message: e.message }));
    return () => {
      alive = false;
    };
  }, [officialId]);

  if (state.kind === 'loading') {
    return (
      <Layout>
        <Loader size="sm" />
      </Layout>
    );
  }
  if (state.kind === 'error') {
    return (
      <Layout>
        <Text>공약 정보를 불러오지 못했습니다</Text>
      </Layout>
    );
  }
  if (!state.board) {
    return (
      <Layout>
        <Title order={1}>당선자를 찾을 수 없습니다</Title>
      </Layout>
    );
  }

  const { official, pledges, lastUpdated } = state.board;
  const statusParam = params.get('status');
  const statusFilter = isStatus(statusParam) ? statusParam : null;
  const categoryParam = params.get('category');
  const statusCounts = countByStatus(pledges);
  const categoryCounts = countByCategory(pledges);
  const categories = CATEGORIES.filter((c) => (categoryCounts[c] ?? 0) > 0);
  const categoryFilter = categories.find((c) => c === categoryParam) ?? null;
  const shown = pledges.filter(
    (p) => (!statusFilter || p.status === statusFilter) && (!categoryFilter || p.category === categoryFilter),
  );
  const total = pledges.length;

  function setFilter(key: 'status' | 'category', value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <Layout official={official}>
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={1} size="h2" data-testid="official-header">
            {official.region_name} · {official.office} {official.person_name} · 임기 {official.term_start} ~{' '}
            {official.term_end}
          </Title>
          <Group gap="md">
            <Text size="sm" c="dimmed" data-testid="last-updated">
              마지막 갱신 {lastUpdated ?? '-'}
            </Text>
            <Anchor component={Link} to="/criteria" size="sm">
              판정 기준 보기
            </Anchor>
          </Group>
        </Stack>

        <Stack gap="xs">
          <Text fw={700} size="lg" data-testid="total-count">
            공약 {total}개
          </Text>
          {STATUS_ORDER.map((s) => (
            <UnstyledButton
              key={s}
              data-testid={`status-row-${s}`}
              aria-pressed={statusFilter === s}
              onClick={() => setFilter('status', statusFilter === s ? null : s)}
            >
              <Group gap="sm" wrap="nowrap">
                <Text w={64} size="sm" fw={statusFilter === s ? 700 : 400}>
                  {STATUS_LABEL[s]}
                </Text>
                <Text w={32} size="sm" ta="right" fw={700} data-testid={`status-count-${s}`}>
                  {statusCounts[s]}
                </Text>
                <Progress
                  flex={1}
                  size="lg"
                  color={STATUS_COLOR[s]}
                  value={total === 0 ? 0 : (statusCounts[s] / total) * 100}
                  aria-label={`${STATUS_LABEL[s]} 비율`}
                />
              </Group>
            </UnstyledButton>
          ))}
          {statusFilter ? (
            <Group>
              <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setFilter('status', null)}>
                상태 필터 해제 ({STATUS_LABEL[statusFilter]})
              </Button>
            </Group>
          ) : null}
        </Stack>

        <Tabs value={categoryFilter ?? 'all'} onChange={(v) => setFilter('category', v && v !== 'all' ? v : null)}>
          <Tabs.List>
            <Tabs.Tab value="all" data-testid="category-tab-all">
              전체 {total}
            </Tabs.Tab>
            {categories.map((c) => (
              <Tabs.Tab key={c} value={c} data-testid={`category-tab-${c}`}>
                {c} {categoryCounts[c]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Stack gap="sm">
          {shown.length === 0 ? <Text size="sm">조건에 맞는 공약이 없습니다</Text> : null}
          {shown.map((p) => (
            <PledgeCard key={p.id} officialId={official.id} pledge={p} />
          ))}
        </Stack>

        <Anchor component={Link} to={`/o/${official.id}/objection`} size="sm" data-testid="objection-link">
          이 판정에 이의가 있나요?
        </Anchor>
      </Stack>
    </Layout>
  );
}
