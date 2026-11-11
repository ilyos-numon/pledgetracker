import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../../src/core/database.types.ts';
import { type PledgeDataset, validateDataset } from '../../../src/core/dataset.ts';
import { adminClient, dropOfficial, loadDataset } from '../../../src/db/admin.ts';

const SAMPLE_PATH = 'tests/fixtures/dataset.sample.json';

function rand(n: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
}

// 접속값은 scripts/sb-env.sh 가 넣은 환경변수에서 읽는다.
export function sbEnv(): { url: string; anonKey: string; serviceKey: string } {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Supabase env missing: run via scripts/sb-env.sh');
  return { url, anonKey, serviceKey };
}

export function admin(): SupabaseClient<Database> {
  const { url, serviceKey } = sbEnv();
  return adminClient({ SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceKey });
}

export async function readDataset(path: string): Promise<PledgeDataset> {
  const result = validateDataset(JSON.parse(await readFile(path, 'utf8')));
  if (!result.ok) throw new Error(`${path}: ${result.errors.join('; ')}`);
  return result.data;
}

// 읽기 전용 테스트용. 고정 id sample-oo-si 를 (다시) 넣는다.
export async function seedSample(): Promise<{ officialId: 'sample-oo-si'; dataset: PledgeDataset }> {
  const dataset = await readDataset(SAMPLE_PATH);
  await loadDataset(admin(), dataset);
  return { officialId: 'sample-oo-si', dataset };
}

// 데이터를 바꾸는 테스트용 격리 사본. 끝나면 cleanup() 으로 지운다.
export async function seedCopy(
  dataset: PledgeDataset,
): Promise<{ officialId: string; prefix: string; cleanup(): Promise<void> }> {
  const prefix = `e2e${rand(6)}-`;
  const { officialId } = await loadDataset(admin(), dataset, { idPrefix: prefix });
  return { officialId, prefix, cleanup: () => dropOfficial(admin(), officialId) };
}

export async function createReviewer(): Promise<{
  email: string;
  password: string;
  userId: string;
  cleanup(): Promise<void>;
}> {
  const db = admin();
  const email = `e2e-${rand(8)}@example.org`;
  const password = `pw-${rand(16)}`;
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const userId = created.data.user.id;
  const reg = await db.from('reviewers').insert({ user_id: userId });
  if (reg.error) throw new Error(`reviewers: ${reg.error.message}`);
  return {
    email,
    password,
    userId,
    cleanup: async () => {
      const res = await admin().auth.admin.deleteUser(userId);
      if (res.error) throw new Error(`deleteUser: ${res.error.message}`);
    },
  };
}

export async function insertCandidate(row: {
  pledge_id: string;
  title: string;
  url: string;
  source?: string;
  matched_keywords?: string[];
}): Promise<string> {
  const res = await admin()
    .from('evidence_candidates')
    .insert({ source: 'news', matched_keywords: [], ...row })
    .select('id')
    .single();
  if (res.error) throw new Error(`insertCandidate: ${res.error.message}`);
  return res.data.id;
}
