import { Alert, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useEffect, useLayoutEffect, useState } from 'react';
import type { TrackedStats } from '../../../src/core/tracked.ts';
import { formatCount, INTRO_TEXT } from '../../../src/core/tracked.ts';
import { fetchTrackedStats } from '../lib/trackedQueries.ts';

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; stats: TrackedStats };

const STATS: { key: keyof TrackedStats; label: string }[] = [
  { key: 'officials', label: INTRO_TEXT.statOfficials },
  { key: 'pledges', label: INTRO_TEXT.statPledges },
  { key: 'evidence', label: INTRO_TEXT.statEvidence },
];

// 소개 페이지 카운터 3개. 숫자는 anon 으로 센 DB 집계값이고, 도착하면 onReady 로 애니메이션을 붙인다.
export default function IntroCounters({ onReady }: { onReady?: () => void }) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchTrackedStats()
      .then((stats) => {
        if (!cancelled) setLoad({ kind: 'ready', stats });
      })
      .catch(() => {
        if (!cancelled) setLoad({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = load.kind === 'ready';
  useLayoutEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  return (
    <Stack gap="sm" component="section" aria-labelledby="intro-stats-title">
      <Title id="intro-stats-title" order={2} size="h3">
        지금까지 모은 자료
      </Title>
      <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="md">
        {STATS.map(({ key, label }) => {
          const value = load.kind === 'ready' ? load.stats[key] : null;
          return (
            <Paper key={key} withBorder radius="md" p="lg" bg="gray.0">
              <Text
                data-testid={`intro-stat-${key}`}
                data-value={value ?? undefined}
                data-count-to={value ?? undefined}
                fz={{ base: 36, sm: 44 }}
                fw={700}
                c="teal.8"
                lh={1.1}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {value === null ? '—' : formatCount(value)}
              </Text>
              <Text size="sm" c="dimmed" mt={6}>
                {label}
              </Text>
            </Paper>
          );
        })}
      </SimpleGrid>
      {load.kind === 'error' ? (
        <Alert data-testid="intro-stats-error" color="gray" variant="light">
          {INTRO_TEXT.statsError}
        </Alert>
      ) : null}
    </Stack>
  );
}
