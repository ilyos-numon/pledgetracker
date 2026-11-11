import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../core/database.types.ts';
import type { PledgeDataset } from '../core/dataset.ts';

type Db = SupabaseClient<Database>;

// service_role 클라이언트. RLS 를 우회하므로 스크립트·테스트에서만 쓴다.
export function adminClient(env: NodeJS.ProcessEnv = process.env): Db {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다 (scripts/sb-env.sh 로 실행)');
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

async function countRows(
  client: Db,
  table: 'pledges' | 'evidence' | 'pledge_events',
  column: 'official_id' | 'pledge_id',
  values: string[],
): Promise<number> {
  const res = await client.from(table).select('*', { count: 'exact', head: true }).in(column, values);
  if (res.error) throw new Error(`count ${table}: ${res.error.message}`);
  return res.count ?? 0;
}

// 공약·당선자를 upsert 하고, seed 근거를 교체하고, seed 이력은 없을 때만 넣는다. 두 번 돌려도 행 수가 같다.
export async function loadDataset(
  client: Db,
  dataset: PledgeDataset,
  opts: { idPrefix?: string } = {},
): Promise<{ officialId: string; pledges: number; evidence: number; events: number }> {
  const prefix = opts.idPrefix ?? '';
  const officialId = `${prefix}${dataset.official.id}`;
  const now = new Date().toISOString();

  check(
    await client
      .from('officials')
      .upsert({ ...dataset.official, id: officialId, updated_at: now }, { onConflict: 'id' }),
    'upsert officials',
  );

  const pledgeRows = dataset.pledges.map((p) => ({
    id: `${prefix}${p.id}`,
    official_id: officialId,
    seq: p.seq,
    title: p.title,
    summary: p.summary,
    category: p.category,
    keywords: p.keywords,
    source_url: p.source_url,
    source_locator: p.source_locator,
    status: p.status,
    status_decided_at: p.status_decided_at,
    status_reason: p.status_reason,
    updated_at: now,
  }));
  check(await client.from('pledges').upsert(pledgeRows, { onConflict: 'id' }), 'upsert pledges');
  const ids = pledgeRows.map((p) => p.id);

  check(await client.from('evidence').delete().eq('added_by', 'seed').in('pledge_id', ids), 'delete seed evidence');
  const evidenceRows = dataset.pledges.flatMap((p) =>
    p.evidence.map((e) => ({ ...e, pledge_id: `${prefix}${p.id}`, added_by: 'seed' })),
  );
  if (evidenceRows.length > 0) check(await client.from('evidence').insert(evidenceRows), 'insert evidence');

  const seeded = check(
    await client.from('pledge_events').select('pledge_id').eq('kind', 'seed').in('pledge_id', ids),
    'select seed events',
  );
  const hasSeed = new Set((seeded ?? []).map((r) => r.pledge_id));
  const eventRows = dataset.pledges
    .filter((p) => !hasSeed.has(`${prefix}${p.id}`))
    .map((p) => ({
      pledge_id: `${prefix}${p.id}`,
      kind: 'seed',
      to_status: p.status,
      reason: p.status_reason,
      // 여러 행 insert 는 빠진 열을 기본값이 아닌 null 로 넣으므로 날짜를 항상 채운다.
      event_date: p.status_decided_at ?? now.slice(0, 10),
    }));
  if (eventRows.length > 0) check(await client.from('pledge_events').insert(eventRows), 'insert seed events');

  return {
    officialId,
    pledges: await countRows(client, 'pledges', 'official_id', [officialId]),
    evidence: await countRows(client, 'evidence', 'pledge_id', ids),
    events: await countRows(client, 'pledge_events', 'pledge_id', ids),
  };
}

// 당선자 행을 지우면 공약·근거·후보·이의 제기·이력이 cascade 로 함께 지워진다.
export async function dropOfficial(client: Db, officialId: string): Promise<void> {
  check(await client.from('officials').delete().eq('id', officialId), 'delete official');
}
