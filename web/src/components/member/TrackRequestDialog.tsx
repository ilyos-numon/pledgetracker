import { Anchor, Button, Group, Modal, Stack, Text } from '@mantine/core';
import {
  ADMIN_CONTACT_EMAIL,
  ADMIN_CONTACT_LABEL,
  TRACK_PAID_NOTICE,
  TRACK_REQUEST_NOTICE,
} from '../../../../src/core/membership.ts';

export interface TrackTarget {
  person_name: string;
  region_name: string;
  office: string;
}

// 결제 대신 관리자 문의 안내만 보여 준다. 요청을 저장하지 않는다.
export default function TrackRequestDialog({ target, onClose }: { target: TrackTarget | null; onClose: () => void }) {
  return (
    <Modal.Root opened={target !== null} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content data-testid="track-request-dialog">
        <Modal.Header>
          <Modal.Title fw={700}>추적 요청</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="sm">
            <Text data-testid="track-request-notice">{TRACK_REQUEST_NOTICE}</Text>
            <Text data-testid="track-request-paid" size="sm" c="dimmed">
              {TRACK_PAID_NOTICE}
            </Text>
            {target ? (
              <Text data-testid="track-request-target" fw={500}>
                {target.person_name} · {target.region_name} · {target.office}
              </Text>
            ) : null}
            <Anchor data-testid="admin-contact" href={`mailto:${ADMIN_CONTACT_EMAIL}`}>
              {ADMIN_CONTACT_LABEL}: {ADMIN_CONTACT_EMAIL}
            </Anchor>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                닫기
              </Button>
            </Group>
          </Stack>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
