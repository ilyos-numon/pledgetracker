import { Anchor, Text, Timeline } from '@mantine/core';
import { EVENT_LABEL, STATUS_LABEL } from '../../../../src/core/status.ts';
import type { EventWithEvidence } from '../../lib/publicQueries.ts';

function transition(e: EventWithEvidence): string | null {
  if (!e.to_status) return null;
  return e.from_status ? `${STATUS_LABEL[e.from_status]} → ${STATUS_LABEL[e.to_status]}` : STATUS_LABEL[e.to_status];
}

// 최신 항목이 위에 오도록 정렬된 이력을 받는다.
export default function EventHistory({ events }: { events: EventWithEvidence[] }) {
  if (events.length === 0) return <Text size="sm">이력이 없습니다</Text>;
  return (
    <Timeline bulletSize={14} lineWidth={2}>
      {events.map((e) => (
        <Timeline.Item key={e.id} data-testid="history-item" title={`${e.event_date} · ${EVENT_LABEL[e.kind]}`}>
          {transition(e) ? <Text size="sm">{transition(e)}</Text> : null}
          {e.reason ? (
            <Text size="sm" c="dimmed">
              {e.reason}
            </Text>
          ) : null}
          {e.evidence ? (
            <Anchor href={e.evidence.url} target="_blank" rel="noopener" size="sm">
              근거: {e.evidence.title}
            </Anchor>
          ) : null}
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
