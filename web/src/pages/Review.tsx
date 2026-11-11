import { Alert, Button, Group, Loader, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import type { Session } from '@supabase/supabase-js';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import Layout from '../components/Layout.tsx';
import CandidateItem from '../components/review/CandidateItem.tsx';
import ObjectionItem from '../components/review/ObjectionItem.tsx';
import {
  type CandidateRow,
  fetchOpenObjections,
  fetchPendingCandidates,
  isReviewer,
  type ObjectionRow,
} from '../lib/reviewQueries.ts';
import { supabase } from '../lib/supabase.ts';

function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const form = useForm({
    mode: 'controlled',
    initialValues: { email: '', password: '' },
    validate: {
      email: (v) => (v.trim() === '' ? '이메일을 적어 주세요' : null),
      password: (v) => (v === '' ? '비밀번호를 적어 주세요' : null),
    },
  });

  async function submit(values: { email: string; password: string }) {
    setBusy(true);
    setError(null);
    const res = await supabase.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
    setBusy(false);
    if (res.error) setError('로그인하지 못했습니다');
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="sm" maw={360}>
        <TextInput label="이메일" type="email" autoComplete="username" {...form.getInputProps('email')} />
        <PasswordInput label="비밀번호" autoComplete="current-password" {...form.getInputProps('password')} />
        <Group>
          <Button type="submit" loading={busy}>
            로그인
          </Button>
        </Group>
        {error ? (
          <Alert data-testid="review-error" color="yellow" variant="light">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </form>
  );
}

function ReviewLists() {
  const [candidates, setCandidates] = useState<CandidateRow[] | null>(null);
  const [objections, setObjections] = useState<ObjectionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, o] = await Promise.all([fetchPendingCandidates(), fetchOpenObjections()]);
      setCandidates(c);
      setObjections(o);
      setError(null);
    } catch {
      setError('목록을 불러오지 못했습니다');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Alert data-testid="review-error" color="yellow" variant="light">
        {error}
      </Alert>
    );
  }
  if (!candidates || !objections) return <Loader />;

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <Title order={2}>근거 후보 ({candidates.length})</Title>
        {candidates.length === 0 ? <Text c="dimmed">검토할 근거 후보가 없습니다</Text> : null}
        {candidates.map((c) => (
          <CandidateItem key={c.id} candidate={c} onDone={load} />
        ))}
      </Stack>
      <Stack gap="sm">
        <Title order={2}>열린 이의 제기 ({objections.length})</Title>
        {objections.length === 0 ? <Text c="dimmed">열린 이의 제기가 없습니다</Text> : null}
        {objections.map((o) => (
          <ObjectionItem key={o.id} objection={o} onDone={load} />
        ))}
      </Stack>
    </Stack>
  );
}

export default function Review() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [reviewer, setReviewer] = useState<boolean | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;
  useEffect(() => {
    setReviewer(null);
    if (!userId) return;
    let alive = true;
    isReviewer()
      .then((ok) => alive && setReviewer(ok))
      .catch(() => alive && setReviewer(false));
    return () => {
      alive = false;
    };
  }, [userId]);

  let body: ReactNode;
  if (session === undefined) body = <Loader />;
  else if (!session) body = <LoginForm />;
  else if (reviewer === null) body = <Loader />;
  else if (!reviewer)
    body = (
      <Alert data-testid="review-error" color="yellow" variant="light">
        검수 권한이 없습니다
      </Alert>
    );
  else body = <ReviewLists />;

  return (
    <Layout>
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={1}>검수</Title>
        </Group>
        {body}
      </Stack>
    </Layout>
  );
}
