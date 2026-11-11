import type { TrackedOfficialRow, TrackedStats } from '../../../src/core/tracked.ts';
import { buildTrackedRows, isListedOfficial } from '../../../src/core/tracked.ts';
import type { Official, PledgeStatus } from '../../../src/core/types.ts';
import { fetchLastUpdated } from './publicQueries.ts';
import { supabase } from './supabase.ts';

// 추적 중인 정치인 표·소개 페이지 카운터. anon 키로 읽기만 한다.

const PAGE_SIZE = 1000; // supabase/config.toml max_rows

type ListedOfficial = Pick<Official, 'id' | 'person_name' | 'region_name' | 'office' | 'is_sample'>;
type PledgeStatusRow = { official_id: string; status: PledgeStatus };

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`);
}

async function fetchListedOfficials(): Promise<ListedOfficial[]> {
  const { data, error } = await supabase.from('officials').select('id, person_name, region_name, office, is_sample');
  if (error) fail('officials', error);
  return ((data ?? []) as ListedOfficial[]).filter(isListedOfficial);
}

async function fetchPledgeStatuses(ids: string[]): Promise<PledgeStatusRow[]> {
  const all: PledgeStatusRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('pledges')
      .select('official_id, status')
      .in('official_id', ids)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) fail('pledges', error);
    const page = (data ?? []) as PledgeStatusRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

async function fetchEvidenceCount(ids: string[]): Promise<number> {
  const { count, error } = await supabase
    .from('evidence')
    .select('id, pledges!inner(official_id)', { count: 'exact', head: true })
    .in('pledges.official_id', ids);
  if (error) fail('evidence', error);
  return count ?? 0;
}

async function rowsFor(officials: ListedOfficial[]): Promise<TrackedOfficialRow[]> {
  if (officials.length === 0) return [];
  const ids = officials.map((o) => o.id);
  const [pledges, dates] = await Promise.all([
    fetchPledgeStatuses(ids),
    Promise.all(ids.map(async (id) => [id, await fetchLastUpdated(id)] as const)),
  ]);
  return buildTrackedRows(officials, pledges, Object.fromEntries(dates));
}

export async function fetchTrackedOfficials(): Promise<TrackedOfficialRow[]> {
  return rowsFor(await fetchListedOfficials());
}

export async function fetchTrackedStats(): Promise<TrackedStats> {
  const officials = await fetchListedOfficials();
  if (officials.length === 0) return { officials: 0, pledges: 0, evidence: 0 };
  const ids = officials.map((o) => o.id);
  const [pledges, evidence] = await Promise.all([fetchPledgeStatuses(ids), fetchEvidenceCount(ids)]);
  return { officials: officials.length, pledges: pledges.length, evidence };
}
