import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/core/database.types.ts';
import { loadDataset } from '../../src/db/admin.ts';
import { admin, createReviewer, insertCandidate, readDataset, sbEnv, seedCopy, seedSample } from './helpers/db.ts';

const SAMPLE = 'tests/fixtures/dataset.sample.json';

function anon() {
  const { url, anonKey } = sbEnv();
  return createClient<Database>(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

test('anon PATCH pledges 는 0행을 바꾼다', async () => {
  await seedSample();
  const { url, anonKey } = sbEnv();
  const res = await fetch(`${url}/rest/v1/pledges?id=eq.sample-oo-si-p001`, {
    method: 'PATCH',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ status: 'fulfilled' }),
  });
  expect(res.ok).toBe(true);
  expect(await res.json()).toEqual([]);
  const row = await admin().from('pledges').select('status').eq('id', 'sample-oo-si-p001').single();
  expect(row.data?.status).toBe('not_started');
});

test('anon 은 근거 후보를 읽지 못한다 (빈 배열)', async () => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  try {
    await insertCandidate({
      pledge_id: `${copy.prefix}sample-oo-si-p001`,
      title: '후보',
      url: 'https://example.org/c',
    });
    const res = await anon().from('evidence_candidates').select('*');
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  } finally {
    await copy.cleanup();
  }
});

test('anon 이의 제기: open 은 접수되고 accepted 는 거부된다', async () => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  const pledgeId = `${copy.prefix}sample-oo-si-p001`;
  try {
    const ok = await anon().from('objections').insert({ pledge_id: pledgeId, body: '회의록에 다른 기록이 있습니다' });
    expect(ok.error).toBeNull();
    const bad = await anon()
      .from('objections')
      .insert({ pledge_id: pledgeId, body: '회의록에 다른 기록이 있습니다', state: 'accepted' });
    expect(bad.error?.code).toBe('42501');
    const rows = await admin().from('objections').select('state').eq('pledge_id', pledgeId);
    expect(rows.data).toEqual([{ state: 'open' }]);
  } finally {
    await copy.cleanup();
  }
});

test('로더를 두 번 돌려도 행 수가 같다', async () => {
  const dataset = await readDataset(SAMPLE);
  const copy = await seedCopy(dataset);
  try {
    const first = await loadDataset(admin(), dataset, { idPrefix: copy.prefix });
    const second = await loadDataset(admin(), dataset, { idPrefix: copy.prefix });
    expect(first).toEqual(second);
    expect(second).toMatchObject({ officialId: copy.officialId, pledges: 12, evidence: 8, events: 12 });
  } finally {
    await copy.cleanup();
  }
});

test('review_candidate 상태 변경에 이유가 없으면 reason_required', async () => {
  const copy = await seedCopy(await readDataset(SAMPLE));
  const reviewer = await createReviewer();
  const pledgeId = `${copy.prefix}sample-oo-si-p001`;
  try {
    const candidateId = await insertCandidate({
      pledge_id: pledgeId,
      title: '환승주차장 예산 반영',
      url: 'https://example.org/press/parking',
      source: 'press-rss',
      matched_keywords: ['환승주차장'],
    });
    const client = anon();
    const login = await client.auth.signInWithPassword({ email: reviewer.email, password: reviewer.password });
    expect(login.error).toBeNull();
    const res = await client.rpc('review_candidate', {
      p_candidate_id: candidateId,
      p_decision: 'adopt',
      p_new_status: 'in_progress',
      p_reason: '',
    });
    expect(res.error?.message).toBe('reason_required');
    const pledge = await admin().from('pledges').select('status').eq('id', pledgeId).single();
    expect(pledge.data?.status).toBe('not_started');
    const ev = await admin().from('evidence').select('id').eq('pledge_id', pledgeId);
    expect(ev.data).toEqual([]);
  } finally {
    await reviewer.cleanup();
    await copy.cleanup();
  }
});
