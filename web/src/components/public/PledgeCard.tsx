import { Anchor, Badge, Button, Card, Group, List, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EVIDENCE_LABEL, STATUS_COLOR, STATUS_LABEL } from '../../../../src/core/status.ts';
import type { Evidence } from '../../../../src/core/types.ts';
import type { PledgeWithEvidence } from '../../lib/publicQueries.ts';

function evidenceText(e: Evidence): string {
  return [EVIDENCE_LABEL[e.kind], e.published_at, `"${e.title}"`, e.locator].filter(Boolean).join(' · ');
}

export default function PledgeCard({
  officialId,
  pledge,
  showHistoryLink = true,
}: {
  officialId: string;
  pledge: PledgeWithEvidence;
  showHistoryLink?: boolean;
}) {
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const detailPath = `/o/${officialId}/p/${pledge.id}`;

  async function share() {
    const url = new URL(detailPath, window.location.origin).toString();
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // 클립보드 권한이 없으면 읽기 전용 입력칸의 주소를 직접 복사한다.
    }
  }

  return (
    <Card withBorder padding="md" data-testid="pledge-card" data-pledge-id={pledge.id}>
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Title order={3} size="h4">
            {pledge.title}
          </Title>
          <Badge data-testid="pledge-status" color={STATUS_COLOR[pledge.status]} variant="light">
            {STATUS_LABEL[pledge.status]}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed">
          {pledge.category} ·{' '}
          <span data-testid="decided-at">
            {pledge.status_decided_at ? `판정 ${pledge.status_decided_at}` : '판정일 없음'}
          </span>
        </Text>
        {pledge.evidence.length === 0 ? (
          <Text size="sm" data-testid="no-evidence">
            근거: 아직 없음
          </Text>
        ) : (
          <Stack gap={4}>
            <Text size="sm">근거 {pledge.evidence.length}건</Text>
            <List size="sm" spacing={2}>
              {pledge.evidence.map((e) => (
                <List.Item key={e.id ?? e.url}>
                  <Anchor href={e.url} target="_blank" rel="noopener" size="sm" data-testid="evidence-link">
                    {evidenceText(e)}
                  </Anchor>
                </List.Item>
              ))}
            </List>
          </Stack>
        )}
        <Group gap="md">
          {showHistoryLink ? (
            <Anchor component={Link} to={detailPath} size="sm">
              변경 이력 보기
            </Anchor>
          ) : null}
          <Anchor
            component={Link}
            to={`/o/${officialId}/objection?pledge=${encodeURIComponent(pledge.id)}`}
            size="sm"
            data-testid="objection-link"
          >
            이 판정에 이의가 있나요?
          </Anchor>
          <Button size="compact-sm" variant="default" onClick={share} data-testid="share-button">
            공유
          </Button>
        </Group>
        {shareUrl ? <TextInput readOnly value={shareUrl} aria-label="공유 주소" data-testid="share-url" /> : null}
      </Stack>
    </Card>
  );
}
