import { Alert, Anchor, Button, Group, Loader, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AUTH_TEXT, safeNextPath } from '../../../src/core/membership.ts';
import Layout from '../components/Layout.tsx';
import { signupHref } from '../lib/requestReturn.ts';
import { useSession } from '../lib/session.ts';
import { supabase } from '../lib/supabase.ts';

type Values = { email: string; password: string };

function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<Values>({
    mode: 'controlled',
    initialValues: { email: '', password: '' },
  });

  async function submit(values: Values) {
    if (values.email.trim() === '') {
      setError(AUTH_TEXT.email_required);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await supabase.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
    setBusy(false);
    if (res.error || !res.data.session) {
      setError(AUTH_TEXT.login_failed);
      return;
    }
    navigate(safeNextPath(searchParams.get('next')));
  }

  const next = searchParams.get('next');

  return (
    <form onSubmit={form.onSubmit(submit)} noValidate>
      <Stack gap="sm" maw={360}>
        <TextInput label="이메일" type="email" autoComplete="username" {...form.getInputProps('email')} />
        <PasswordInput label="비밀번호" autoComplete="current-password" {...form.getInputProps('password')} />
        <Group>
          <Button type="submit" loading={busy}>
            로그인
          </Button>
        </Group>
        {error ? (
          <Alert data-testid="auth-error" color="yellow" variant="light">
            {error}
          </Alert>
        ) : null}
        <Anchor component={Link} to={next ? signupHref(next) : '/signup'}>
          처음이신가요? 가입
        </Anchor>
      </Stack>
    </form>
  );
}

export default function Login() {
  const { session, loading } = useSession();
  let body: ReactNode;
  if (loading) body = <Loader />;
  else if (session)
    body = (
      <Stack gap="sm">
        <Alert data-testid="auth-info" color="blue" variant="light">
          {AUTH_TEXT.already_signed_in}
        </Alert>
        <Anchor component={Link} to="/search">
          정치인 찾기로
        </Anchor>
      </Stack>
    );
  else body = <LoginForm />;

  return (
    <Layout>
      <Stack gap="md">
        <Title order={1}>로그인</Title>
        {body}
      </Stack>
    </Layout>
  );
}
