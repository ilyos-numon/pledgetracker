import {
  Alert,
  Anchor,
  Button,
  Group,
  Loader,
  NativeSelect,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Official } from '../../../src/core/types.ts';
import Layout from '../components/Layout.tsx';
import { fetchOfficial, fetchPledgeOptions, type PledgeOption, submitObjection } from '../lib/reviewQueries.ts';

const BODY_MIN = 10;
const BODY_MAX = 2000;
const URL_ERROR = 'http 또는 https 주소를 넣어 주세요';

type Values = { pledge_id: string; body: string; evidence_url: string };

function ObjectionForm({ official, pledges, preset }: { official: Official; pledges: PledgeOption[]; preset: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const form = useForm<Values>({
    mode: 'controlled',
    initialValues: { pledge_id: preset, body: '', evidence_url: '' },
    validate: {
      pledge_id: (v) => (v ? null : '공약을 골라 주세요'),
      body: (v) => {
        const n = [...v.trim()].length;
        return n < BODY_MIN || n > BODY_MAX ? `내용은 ${BODY_MIN}자 이상 ${BODY_MAX}자 이하로 적어 주세요` : null;
      },
      evidence_url: (v) => (v.trim() === '' || /^https?:\/\/\S+$/.test(v.trim()) ? null : URL_ERROR),
    },
  });

  async function submit(values: Values) {
    setBusy(true);
    setError(null);
    try {
      const url = values.evidence_url.trim();
      await submitObjection({ pledge_id: values.pledge_id, body: values.body.trim(), evidence_url: url || null });
      setDone(true);
    } catch {
      setError('보내지 못했습니다. 잠시 뒤 다시 시도해 주세요');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Stack gap="sm">
        <Alert color="teal" variant="light">
          접수되었습니다
        </Alert>
        <Group gap="md">
          <Anchor component={Link} to={`/o/${official.id}/p/${form.values.pledge_id}`}>
            공약으로 돌아가기
          </Anchor>
          <Anchor component={Link} to={`/o/${official.id}`}>
            전체 공약 보기
          </Anchor>
        </Group>
      </Stack>
    );
  }

  return (
    <form onSubmit={form.onSubmit(submit)}>
      <Stack gap="sm">
        <NativeSelect
          label="공약"
          data={pledges.map((p) => ({ value: p.id, label: `${p.seq}. ${p.title}` }))}
          {...form.getInputProps('pledge_id')}
        />
        <Textarea
          label="내용"
          description={`${BODY_MIN}~${BODY_MAX}자`}
          autosize
          minRows={4}
          {...form.getInputProps('body')}
        />
        <TextInput label="근거 링크(선택)" placeholder="https://" {...form.getInputProps('evidence_url')} />
        <Group>
          <Button type="submit" loading={busy}>
            보내기
          </Button>
        </Group>
        {error ? (
          <Alert color="yellow" variant="light">
            {error}
          </Alert>
        ) : null}
      </Stack>
    </form>
  );
}

export default function Objection() {
  const { officialId = '' } = useParams();
  const [params] = useSearchParams();
  const wanted = params.get('pledge');
  const [official, setOfficial] = useState<Official | null | undefined>(undefined);
  const [pledges, setPledges] = useState<PledgeOption[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchOfficial(officialId), fetchPledgeOptions(officialId)])
      .then(([o, list]) => {
        if (!alive) return;
        setPledges(list);
        setOfficial(o);
      })
      .catch(() => alive && setOfficial(null));
    return () => {
      alive = false;
    };
  }, [officialId]);

  if (official === undefined) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }
  if (official === null) {
    return (
      <Layout>
        <Text>지자체를 찾을 수 없습니다</Text>
      </Layout>
    );
  }

  const preset = (pledges.find((p) => p.id === wanted) ?? pledges[0])?.id ?? '';

  return (
    <Layout official={official}>
      <Stack gap="md">
        <Title order={1}>이의 제기</Title>
        <Text size="sm" c="dimmed">
          {official.region_name} {official.office} 공약 판정에 다른 근거가 있으면 알려 주세요. 이름이나 연락처는 받지
          않습니다. 검수자가 확인한 뒤 변경 이력에 남깁니다.
        </Text>
        <ObjectionForm key={preset} official={official} pledges={pledges} preset={preset} />
      </Stack>
    </Layout>
  );
}
