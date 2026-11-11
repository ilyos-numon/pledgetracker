import { Alert, Anchor, Button, Group, Loader, PasswordInput, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AUTH_TEXT, MIN_PASSWORD_LENGTH, safeNextPath } from '../../../src/core/membership.ts';
import Layout from '../components/Layout.tsx';
import { loginHref } from '../lib/requestReturn.ts';
import { useSession } from '../lib/session.ts';
import { supabase } from '../lib/supabase.ts';

type Values = { email: string; password: string; confirm: string };

function checkValues(values: Values): string | null {
  if (values.email.trim() === '') return AUTH_TEXT.email_required;
  if (values.password.length < MIN_PASSWORD_LENGTH) return AUTH_TEXT.password_short;
  if (values.password !== values.confirm) return AUTH_TEXT.password_mismatch;
  return null;
}

function signupErrorText(error: { code?: string; message?: string }): string {
  if (error.code === 'user_already_exists' || (error.message ?? '').includes('already registered')) {
    return AUTH_TEXT.already_registered;
  }
  return AUTH_TEXT.signup_failed;
}

function SignupForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm<Values>({
    mode: 'controlled',
    initialValues: { email: '', password: '', confirm: '' },
  });

  async function submit(values: Values) {
    setInfo(null);
    const invalid = checkValues(values);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setBusy(true);
    const res = await supabase.auth.signUp({ email: values.email.trim(), password: values.password });
    setBusy(false);
    if (res.error) {
      setError(signupErrorText(res.error));
      return;
    }
    if (res.data.session) navigate(safeNextPath(next));
    else setInfo('가입 확인 메일을 보냈습니다');
  }

  return (
    <form onSubmit={form.onSubmit(submit)} noValidate>
      <Stack gap="sm" maw={360}>
        <TextInput label="이메일" type="email" autoComplete="email" {...form.getInputProps('email')} />
        <PasswordInput label="비밀번호" autoComplete="new-password" {...form.getInputProps('password')} />
        <PasswordInput label="비밀번호 확인" autoComplete="new-password" {...form.getInputProps('confirm')} />
        <Group>
          <Button type="submit" loading={busy}>
            가입하기
          </Button>
        </Group>
        {error ? (
          <Alert data-testid="auth-error" color="yellow" variant="light">
            {error}
          </Alert>
        ) : null}
        {info ? (
          <Alert data-testid="auth-info" color="blue" variant="light">
            {info}
          </Alert>
        ) : null}
        <Anchor component={Link} to={next ? loginHref(next) : '/login'}>
          이미 계정이 있나요? 로그인
        </Anchor>
      </Stack>
    </form>
  );
}

export default function Signup() {
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
  else body = <SignupForm />;

  return (
    <Layout>
      <Stack gap="md">
        <Title order={1}>가입</Title>
        {body}
      </Stack>
    </Layout>
  );
}
