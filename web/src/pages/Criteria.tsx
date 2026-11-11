import { Card, ColorSwatch, Group, List, Stack, Text, Title } from '@mantine/core';
import { CRITERIA } from '../../../src/core/criteria.ts';
import { STATUS_COLOR } from '../../../src/core/status.ts';
import Layout from '../components/Layout.tsx';

export default function Criteria() {
  return (
    <Layout>
      <Stack gap="lg">
        <Title order={1}>판정 기준</Title>
        <Stack gap="sm">
          <Title order={2} size="h3">
            상태 정의
          </Title>
          {CRITERIA.statuses.map((s) => (
            <Card key={s.status} withBorder padding="sm" data-testid={`criteria-status-${s.status}`}>
              <Group gap="sm" align="center">
                <ColorSwatch color={`var(--mantine-color-${STATUS_COLOR[s.status]}-6)`} size={12} aria-hidden />
                <Title order={3} size="h4">
                  {s.label}
                </Title>
              </Group>
              <Text size="sm" mt={4}>
                {s.definition}
              </Text>
            </Card>
          ))}
        </Stack>
        <Stack gap="sm">
          <Title order={2} size="h3">
            규칙
          </Title>
          <List spacing={4}>
            {CRITERIA.rules.map((r) => (
              <List.Item key={r} data-testid="criteria-rule">
                {r}
              </List.Item>
            ))}
          </List>
        </Stack>
      </Stack>
    </Layout>
  );
}
