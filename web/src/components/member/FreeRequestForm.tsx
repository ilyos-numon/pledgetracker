import { Button, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { FREE_REQUEST_TEXT } from '../../../../src/core/membership.ts';
import type { TrackTarget } from './TrackRequestDialog.tsx';

type Values = { name: string; region: string; office: string };

// 목록에 없는 정치인을 직접 적는다. 저장·요청 없이 안내 대화상자만 연다.
export default function FreeRequestForm({
  onRequest,
  initialValues,
}: {
  onRequest: (target: TrackTarget) => void;
  initialValues?: Values;
}) {
  const form = useForm<Values>({
    mode: 'controlled',
    initialValues: initialValues ?? { name: '', region: '', office: '' },
    validate: {
      name: (v) => (v.trim() ? null : FREE_REQUEST_TEXT.name_required),
      region: (v) => (v.trim() ? null : FREE_REQUEST_TEXT.region_required),
      office: (v) => (v.trim() ? null : FREE_REQUEST_TEXT.office_required),
    },
  });

  function submit(values: Values) {
    onRequest({ person_name: values.name.trim(), region_name: values.region.trim(), office: values.office.trim() });
  }

  return (
    <form data-testid="free-request-form" onSubmit={form.onSubmit(submit)} noValidate>
      <Stack gap="sm">
        <Title order={2} size="h4">
          {FREE_REQUEST_TEXT.title}
        </Title>
        <TextInput label="이름" {...form.getInputProps('name')} />
        <TextInput label="지역" {...form.getInputProps('region')} />
        <TextInput label="직위" {...form.getInputProps('office')} />
        <div>
          <Button type="submit" variant="light">
            추적 요청
          </Button>
        </div>
      </Stack>
    </form>
  );
}
