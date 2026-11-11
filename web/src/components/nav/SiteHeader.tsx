import { Anchor, Box, Burger, Button, Drawer, Group, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../lib/session.ts';
import { supabase } from '../../lib/supabase.ts';
import { activeNavKey, buildNavItems, type NavItem, type NavKey } from './navItems.ts';

const ACTIVE_BORDER = '2px solid var(--mantine-color-teal-7)';
const IDLE_BORDER = '2px solid transparent';

function NavLinks({
  items,
  active,
  prefix,
  onNavigate,
}: {
  items: NavItem[];
  active: NavKey | null;
  prefix: string;
  onNavigate?: () => void;
}) {
  return items.map((item) => {
    const current = item.key === active;
    return (
      <Anchor
        key={item.key}
        component={Link}
        to={item.to}
        data-testid={`${prefix}${item.testId}`}
        aria-current={current ? 'page' : undefined}
        underline="never"
        size="sm"
        fw={current ? 700 : 500}
        c={current ? 'teal.8' : 'gray.8'}
        py={4}
        style={{ borderBottom: current ? ACTIVE_BORDER : IDLE_BORDER, alignSelf: 'flex-start' }}
        onClick={onNavigate}
      >
        {item.label}
      </Anchor>
    );
  });
}

export default function SiteHeader() {
  const { session, loading } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);

  const items = buildNavItems();
  const active = activeNavKey(location.pathname);
  const email = session?.user.email ?? '';

  async function logout() {
    close();
    await supabase.auth.signOut();
    navigate('/');
  }

  let account: ReactNode = null;
  let drawerAccount: ReactNode = null;
  if (!loading && session) {
    account = (
      <>
        <Text data-testid="nav-user" size="sm" c="gray.7" truncate="end" maw={200} title={email}>
          {email}
        </Text>
        <Button variant="default" size="xs" data-testid="nav-logout" onClick={() => void logout()}>
          로그아웃
        </Button>
      </>
    );
    drawerAccount = (
      <>
        <Text data-testid="drawer-user" size="sm" c="gray.7" truncate="end" title={email}>
          {email}
        </Text>
        <Button variant="default" color="gray" data-testid="drawer-logout" onClick={() => void logout()}>
          로그아웃
        </Button>
      </>
    );
  } else if (!loading) {
    account = (
      <>
        <Button component={Link} to="/login" variant="default" size="xs" data-testid="nav-login">
          로그인
        </Button>
        <Button component={Link} to="/signup" color="teal" size="xs" data-testid="nav-signup">
          가입
        </Button>
      </>
    );
    drawerAccount = (
      <>
        <Button component={Link} to="/login" variant="default" data-testid="drawer-login" onClick={close}>
          로그인
        </Button>
        <Button component={Link} to="/signup" color="teal" data-testid="drawer-signup" onClick={close}>
          가입
        </Button>
      </>
    );
  }

  return (
    <header data-testid="site-header" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
      <Group justify="space-between" wrap="nowrap" gap="md" pb="xs">
        <Group gap="xl" wrap="nowrap">
          <Anchor component={Link} to="/" data-testid="nav-logo" fw={700} size="lg" c="teal.8" underline="never">
            공약추적기
          </Anchor>
          <Box component="nav" aria-label="주 메뉴" visibleFrom="sm">
            <Group gap="lg" wrap="nowrap">
              <NavLinks items={items} active={active} prefix="" />
            </Group>
          </Box>
        </Group>
        <Group gap="sm" wrap="nowrap" visibleFrom="sm">
          {account}
        </Group>
        <Burger
          hiddenFrom="sm"
          opened={opened}
          onClick={toggle}
          color="gray"
          size="sm"
          aria-label="메뉴 열기"
          aria-expanded={opened}
          data-testid="nav-burger"
        />
      </Group>
      <Drawer
        opened={opened}
        onClose={close}
        title="메뉴"
        position="right"
        size="xs"
        data-testid="nav-drawer"
        closeButtonProps={{ 'aria-label': '메뉴 닫기' }}
      >
        <Stack gap="lg">
          <Stack component="nav" aria-label="주 메뉴" gap="xs">
            <NavLinks items={items} active={active} prefix="drawer-" onNavigate={close} />
          </Stack>
          <Stack gap="xs">{drawerAccount}</Stack>
        </Stack>
      </Drawer>
    </header>
  );
}
