import { Anchor, Loader, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout.tsx';
import EventHistory from '../components/public/EventHistory.tsx';
import PledgeCard from '../components/public/PledgeCard.tsx';
import { type Detail, fetchDetail } from '../lib/publicQueries.ts';

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; detail: Detail | null };

export default function PledgeDetail() {
  const { officialId = '', pledgeId = '' } = useParams();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    fetchDetail(officialId, pledgeId)
      .then((detail) => alive && setState({ kind: 'ready', detail }))
      .catch(() => alive && setState({ kind: 'error' }));
    return () => {
      alive = false;
    };
  }, [officialId, pledgeId]);

  const back = (
    <Anchor component={Link} to={`/o/${officialId}`} size="sm">
      공약 목록으로
    </Anchor>
  );

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
        <Stack gap="sm">
          <Text>공약 정보를 불러오지 못했습니다</Text>
          {back}
        </Stack>
      </Layout>
    );
  }
  const detail = state.detail;
  if (!detail?.pledge) {
    return (
      <Layout official={detail?.official}>
        <Stack gap="sm">
          <Title order={1}>공약을 찾을 수 없습니다</Title>
          {back}
        </Stack>
      </Layout>
    );
  }

  const { official, pledge, events } = detail;
  return (
    <Layout official={official}>
      <Stack gap="md">
        {back}
        <Text size="sm" c="dimmed" data-testid="official-header">
          {official.region_name} · {official.office} {official.person_name} · 임기 {official.term_start} ~{' '}
          {official.term_end}
        </Text>
        <PledgeCard officialId={official.id} pledge={pledge} showHistoryLink={false} />
        <Title order={2} size="h3">
          변경 이력
        </Title>
        <EventHistory events={events} />
        <Anchor component={Link} to="/criteria" size="sm">
          판정 기준 보기
        </Anchor>
      </Stack>
    </Layout>
  );
}
