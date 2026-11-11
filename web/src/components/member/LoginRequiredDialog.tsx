import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { Link } from 'react-router-dom';
import {
  LOGIN_TO_REQUEST_LABEL,
  SIGNUP_TO_REQUEST_LABEL,
  TRACK_LOGIN_REQUIRED_DETAIL,
  TRACK_LOGIN_REQUIRED_NOTICE,
} from '../../../../src/core/membership.ts';
import { loginHref, signupHref } from '../../lib/requestReturn.ts';
import type { TrackTarget } from './TrackRequestDialog.tsx';

// 비회원이 추적 요청을 누르면 로그인·가입을 안내한다. 로그인 뒤 next 로 같은 요청에 돌아온다.
export default function LoginRequiredDialog({
  target,
  next,
  onClose,
}: {
  target: TrackTarget | null;
  next: string;
  onClose: () => void;
}) {
  return (
    <Modal.Root opened={target !== null} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content data-testid="login-required-dialog">
        <Modal.Header>
          <Modal.Title fw={700}>추적 요청</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Stack gap="sm">
            <Text data-testid="login-required-notice">{TRACK_LOGIN_REQUIRED_NOTICE}</Text>
            <Text data-testid="login-required-detail" size="sm" c="dimmed">
              {TRACK_LOGIN_REQUIRED_DETAIL}
            </Text>
            {target ? (
              <Text data-testid="track-request-target" fw={500}>
                {target.person_name} · {target.region_name} · {target.office}
              </Text>
            ) : null}
            <Group gap="sm" wrap="wrap">
              <Button component={Link} to={loginHref(next)} color="teal" data-testid="login-required-login">
                {LOGIN_TO_REQUEST_LABEL}
              </Button>
              <Button component={Link} to={signupHref(next)} variant="default" data-testid="login-required-signup">
                {SIGNUP_TO_REQUEST_LABEL}
              </Button>
            </Group>
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
