import type { Evidence, Official, Pledge, PledgeEvent } from '../../../src/core/types.ts';
import { supabase } from './supabase.ts';

// 공개 화면은 anon 키로 officials·pledges·evidence·pledge_events 만 읽는다 (RLS public_read).

export type PledgeWithEvidence = Pledge & { evidence: Evidence[] };
export type EventWithEvidence = PledgeEvent & { evidence: Pick<Evidence, 'title' | 'url'> | null };

export interface Board {
  official: Official;
  pledges: PledgeWithEvidence[];
  lastUpdated: string | null;
}

export interface Detail {
  official: Official;
  pledge: PledgeWithEvidence | null;
  events: EventWithEvidence[];
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`);
}

function sortEvidence(p: PledgeWithEvidence): PledgeWithEvidence {
  const evidence = [...(p.evidence ?? [])].sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? ''));
  return { ...p, evidence };
}

export async function fetchOfficial(officialId: string): Promise<Official | null> {
  const { data, error } = await supabase.from('officials').select('*').eq('id', officialId).maybeSingle();
  if (error) fail('officials', error);
  return (data as Official | null) ?? null;
}

// 마지막 갱신일 = 그 당선자 공약들의 max(pledge_events.event_date)
export async function fetchLastUpdated(officialId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('pledge_events')
    .select('event_date, pledges!inner(official_id)')
    .eq('pledges.official_id', officialId)
    .order('event_date', { ascending: false })
    .limit(1);
  if (error) fail('pledge_events', error);
  const rows = (data ?? []) as { event_date: string }[];
  return rows[0]?.event_date ?? null;
}

export async function fetchBoard(officialId: string): Promise<Board | null> {
  const official = await fetchOfficial(officialId);
  if (!official) return null;
  const { data, error } = await supabase
    .from('pledges')
    .select('*, evidence(*)')
    .eq('official_id', officialId)
    .order('seq', { ascending: true });
  if (error) fail('pledges', error);
  const pledges = ((data ?? []) as PledgeWithEvidence[]).map(sortEvidence);
  return { official, pledges, lastUpdated: await fetchLastUpdated(officialId) };
}

export async function fetchDetail(officialId: string, pledgeId: string): Promise<Detail | null> {
  const official = await fetchOfficial(officialId);
  if (!official) return null;
  const { data, error } = await supabase
    .from('pledges')
    .select('*, evidence(*)')
    .eq('official_id', officialId)
    .eq('id', pledgeId)
    .maybeSingle();
  if (error) fail('pledges', error);
  if (!data) return { official, pledge: null, events: [] };
  const ev = await supabase
    .from('pledge_events')
    .select('*, evidence(title, url)')
    .eq('pledge_id', pledgeId)
    .order('event_date', { ascending: false })
    .order('id', { ascending: false });
  if (ev.error) fail('pledge_events', ev.error);
  return {
    official,
    pledge: sortEvidence(data as PledgeWithEvidence),
    events: (ev.data ?? []) as EventWithEvidence[],
  };
}
