import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { type CSSProperties, type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { CatalogSearchRow } from '../../../src/core/catalog.ts';
import {
  FREE_REQUEST_TEXT,
  GUEST_SEARCH_NOTE,
  SEARCH_EMPTY_TEXT,
  SEARCH_ERROR_TEXT,
  SEARCH_FILTER_EMPTY_TEXT,
  SEARCH_HINT,
  SEARCH_LOADING_TEXT,
  SEARCH_PLACEHOLDER,
  TRACK_BUTTON_LABEL,
  TRACK_PAID_HINT,
  TRACKED_BADGE,
} from '../../../src/core/membership.ts';
import { SAMPLE_NOTICE } from '../../../src/core/status.ts';
import { TRACKED_TEXT } from '../../../src/core/tracked.ts';
import Layout from '../components/Layout.tsx';
import FreeRequestForm from '../components/member/FreeRequestForm.tsx';
import LoginRequiredDialog from '../components/member/LoginRequiredDialog.tsx';
import TrackRequestDialog, { type TrackTarget } from '../components/member/TrackRequestDialog.tsx';
import TrackedOfficialsTable from '../components/search/TrackedOfficialsTable.tsx';
import { SearchError, searchCatalog } from '../lib/memberQueries.ts';
import { buildReturnPath, type PendingRequest, parseReturnParams, stripRequestParams } from '../lib/requestReturn.ts';
import {
  filterResults,
  resultCountText,
  SEARCH_FILTERS,
  type SearchFilter,
  sortTrackedFirst,
} from '../lib/searchView.ts';
import { useSession } from '../lib/session.ts';

const DEBOUNCE_MS = 300;

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

function ResultItem({ row, onTrack }: { row: CatalogSearchRow; onTrack: (row: CatalogSearchRow) => void }) {
  return (
    <Card
      withBorder
      padding="md"
      data-testid="catalog-result"
      data-catalog-id={row.id}
      data-tracked={String(row.tracked)}
    >
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <Stack gap={4} style={{ flex: '1 1 200px', minWidth: 0 }}>
          <Text data-testid="result-place" fw={700} size="lg">
            {`${row.region_name} · ${row.office}`}
          </Text>
          <Group gap="xs">
            <Text>{row.person_name}</Text>
            {row.is_sample ? (
              <Badge color="gray" variant="outline">
                {SAMPLE_NOTICE}
              </Badge>
            ) : null}
            {row.tracked ? (
              <Badge color="teal" variant="light" data-testid="tracked-badge">
                {TRACKED_BADGE}
              </Badge>
            ) : null}
          </Group>
          <Text size="sm" c="dimmed">
            {`임기 ${row.term_start} ~ ${row.term_end}`}
          </Text>
        </Stack>
        {row.tracked ? (
          <Button component={Link} to={`/o/${row.id}`} data-testid="open-dashboard" variant="light" color="teal">
            공약 보기<span aria-hidden="true">&nbsp;→</span>
          </Button>
        ) : (
          <Stack gap={2} align="center">
            <Button data-testid="track-start" variant="outline" color="teal" onClick={() => onTrack(row)}>
              {TRACK_BUTTON_LABEL}
            </Button>
            <Text data-testid="track-paid-hint" size="xs" c="dimmed">
              {TRACK_PAID_HINT}
            </Text>
          </Stack>
        )}
      </Group>
    </Card>
  );
}

function SearchResults({
  results,
  filter,
  onFilter,
  onTrack,
}: {
  results: CatalogSearchRow[];
  filter: SearchFilter;
  onFilter: (f: SearchFilter) => void;
  onTrack: (row: CatalogSearchRow) => void;
}) {
  const visible = filterResults(sortTrackedFirst(results), filter);
  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center" wrap="wrap" gap="sm">
        <SegmentedControl
          data-testid="search-filter"
          color="teal"
          data={[...SEARCH_FILTERS]}
          value={filter}
          onChange={(v) => onFilter(v as SearchFilter)}
        />
        <Text data-testid="search-count" fw={500}>
          {resultCountText(visible.length, results.length)}
        </Text>
      </Group>
      {visible.length === 0 ? (
        <Text data-testid="search-filter-empty" c="dimmed">
          {SEARCH_FILTER_EMPTY_TEXT}
        </Text>
      ) : (
        <Stack gap="xs">
          {visible.map((row) => (
            <ResultItem key={row.id} row={row} onTrack={onTrack} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

type GuestPrompt = { target: TrackTarget; next: string };

// 세션과 무관하게 같은 검색 화면. 추적 요청만 회원(관리자 문의)과 비회원(로그인 안내)이 갈린다.
function SearchScreen({ member }: { member: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  // 마운트 시 1회만 읽는다. 비회원이면 request 는 무시한다.
  const [initial] = useState(() => {
    const parsed = parseReturnParams(searchParams);
    return { query: parsed.query, request: member ? parsed.request : null, params: searchParams };
  });
  const initialFree = initial.request?.kind === 'free' ? initial.request : null;
  const [query, setQuery] = useState(initial.query);
  const [debounced] = useDebouncedValue(query, DEBOUNCE_MS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CatalogSearchRow[] | null>(null);
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [target, setTarget] = useState<TrackTarget | null>(null);
  const [guestPrompt, setGuestPrompt] = useState<GuestPrompt | null>(null);
  const [freeOpen, setFreeOpen] = useState(initialFree !== null);
  const lastQueryRef = useRef(initial.query);
  const seqRef = useRef(0);

  // 최신 요청의 응답만 반영한다. 반영한 결과를 돌려주고, 낡았거나 실패하면 null.
  const run = useCallback(async (q: string): Promise<CatalogSearchRow[] | null> => {
    const seq = ++seqRef.current;
    setBusy(true);
    setError(null);
    try {
      const rows = await searchCatalog(q);
      if (seq !== seqRef.current) return null;
      setResults(rows);
      return rows;
    } catch (e) {
      if (seq !== seqRef.current) return null;
      setResults(null);
      setError(e instanceof SearchError ? e.message : SEARCH_ERROR_TEXT.unknown);
      return null;
    } finally {
      if (seq === seqRef.current) setBusy(false);
    }
  }, []);

  // q 로 즉시 1회 검색하고, 로그인 뒤 돌아온 회원이면 같은 요청 대화상자를 연다.
  // biome-ignore lint/correctness/useExhaustiveDependencies: 마운트 시 1회만 실행한다.
  useEffect(() => {
    const { query: q, request, params } = initial;
    const clearRequest = () => setSearchParams(stripRequestParams(params), { replace: true });
    if (request?.kind === 'free') {
      setTarget({ person_name: request.name, region_name: request.region, office: request.office });
      clearRequest();
    }
    if (q === '') {
      if (request?.kind === 'catalog') clearRequest();
      return;
    }
    void run(q).then((rows) => {
      if (request?.kind !== 'catalog') return;
      const hit = rows?.find((r) => r.id === request.id && !r.tracked);
      if (hit) setTarget(hit);
      clearRequest();
    });
  }, []);

  // 진행 중인 요청을 무시하고 처음 상태로 돌린다.
  const reset = useCallback((err: string | null) => {
    seqRef.current += 1;
    setBusy(false);
    setResults(null);
    setError(err);
  }, []);

  useEffect(() => {
    const q = debounced.trim();
    if (q === lastQueryRef.current) return;
    lastQueryRef.current = q;
    if (q === '') reset(null);
    else void run(q);
  }, [debounced, run, reset]);

  function requestTrack(t: TrackTarget, req: PendingRequest) {
    if (member) setTarget(t);
    else setGuestPrompt({ target: t, next: buildReturnPath(query, req) });
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    lastQueryRef.current = q;
    if (q === '') reset(SEARCH_ERROR_TEXT.query_required);
    else void run(q);
  }

  let status: ReactNode;
  if (busy)
    status = (
      <Group data-testid="search-loading" gap="xs">
        <Loader size="sm" color="teal" />
        <Text c="dimmed">{SEARCH_LOADING_TEXT}</Text>
      </Group>
    );
  else if (error)
    status = (
      <Alert color="yellow" variant="light" data-testid="search-error">
        {error}
      </Alert>
    );
  else if (results === null)
    status = (
      <Text data-testid="search-hint" c="dimmed">
        {SEARCH_HINT}
      </Text>
    );
  else if (results.length === 0) status = <Text data-testid="search-empty">{SEARCH_EMPTY_TEXT}</Text>;
  else
    status = (
      <SearchResults
        results={results}
        filter={filter}
        onFilter={setFilter}
        onTrack={(row) => requestTrack(row, { kind: 'catalog', id: row.id })}
      />
    );

  return (
    <Stack gap="md">
      {member ? null : <Text data-testid="guest-note">{GUEST_SEARCH_NOTE}</Text>}
      <form data-testid="search-form" onSubmit={submit}>
        <Group gap="sm" wrap="nowrap" align="center">
          <TextInput
            size="lg"
            aria-label="검색어"
            placeholder={SEARCH_PLACEHOLDER}
            leftSection={<SearchIcon />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 0 }}
            styles={{ input: { '--input-bd-focus': 'var(--mantine-color-teal-6)' } as CSSProperties }}
          />
          <Button type="submit" size="lg" color="teal">
            검색
          </Button>
        </Group>
      </form>
      {status}
      <Stack gap="xs" align="flex-start">
        <Button
          data-testid="free-request-toggle"
          variant="subtle"
          color="teal"
          px={0}
          aria-expanded={freeOpen}
          aria-controls="free-request-panel"
          onClick={() => setFreeOpen((o) => !o)}
        >
          {FREE_REQUEST_TEXT.toggle}
        </Button>
      </Stack>
      <Collapse expanded={freeOpen} id="free-request-panel">
        <Card withBorder padding="md">
          <FreeRequestForm
            onRequest={(t) =>
              requestTrack(t, { kind: 'free', name: t.person_name, region: t.region_name, office: t.office })
            }
            initialValues={
              initialFree
                ? { name: initialFree.name, region: initialFree.region, office: initialFree.office }
                : undefined
            }
          />
        </Card>
      </Collapse>
      <TrackRequestDialog target={target} onClose={() => setTarget(null)} />
      <LoginRequiredDialog
        target={guestPrompt?.target ?? null}
        next={guestPrompt?.next ?? '/search'}
        onClose={() => setGuestPrompt(null)}
      />
    </Stack>
  );
}

export default function Search() {
  const { session, loading } = useSession();
  let body: ReactNode;
  if (loading) body = <Loader color="teal" />;
  else body = <SearchScreen member={session !== null} />;
  return (
    <Layout>
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={1}>정치인 찾기</Title>
          <Text c="dimmed">2026 지방선거 광역·기초 단체장을 이름이나 지역으로 찾습니다</Text>
        </Stack>
        <Stack gap="sm" component="section" aria-labelledby="tracked-heading">
          <Title order={2} size="h3" id="tracked-heading">
            {TRACKED_TEXT.heading}
          </Title>
          <TrackedOfficialsTable />
        </Stack>
        <Stack gap="sm" component="section" aria-labelledby="search-heading">
          <Title order={2} size="h3" id="search-heading">
            이름·지역으로 찾기
          </Title>
          {body}
        </Stack>
      </Stack>
    </Layout>
  );
}
