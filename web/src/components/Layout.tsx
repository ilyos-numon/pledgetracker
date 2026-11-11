import { Alert, Badge, Container, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { DEMO_NOTICE, SAMPLE_NOTICE } from '../../../src/core/status.ts';
import type { Official } from '../../../src/core/types.ts';
import SiteHeader from './nav/SiteHeader.tsx';

export default function Layout({ official, children }: { official?: Official; children: ReactNode }) {
  return (
    <Container size="md" py="md">
      <Stack gap="md">
        <SiteHeader />
        <Alert data-testid="demo-badge" color="gray" variant="light">
          <Group gap="xs">
            <Text size="sm">{DEMO_NOTICE}</Text>
            {official?.is_sample ? (
              <Badge color="gray" variant="outline">
                {SAMPLE_NOTICE}
              </Badge>
            ) : null}
          </Group>
        </Alert>
        <main>{children}</main>
      </Stack>
    </Container>
  );
}
