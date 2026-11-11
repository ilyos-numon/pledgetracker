import { existsSync } from 'node:fs';

// 모든 spec 은 LLM_MODE=fixture 를 전제로 한다 (네트워크 LLM 호출 없음).
export default async function globalSetup() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  process.env.LLM_MODE = 'fixture';

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
  if (!url) throw new Error('Supabase not running: run supabase start');

  let ok = false;
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } });
    ok = res.status < 500;
  } catch {
    ok = false;
  }
  if (!ok) throw new Error('Supabase not running: run supabase start');
}
