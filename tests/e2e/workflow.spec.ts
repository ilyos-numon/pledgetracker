import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { admin, readDataset, seedCopy } from './helpers/db.ts';
import { startFeedServer } from './helpers/feed-server.ts';

// n8n 근거 수집 E2E: 모의 RSS(8863) → docker n8n CLI 로 워크플로 2회 실행 → 후보 1건 → fixture LLM 메모.
const SAMPLE = 'tests/fixtures/dataset.sample.json';
const FEED_FILE = 'tests/e2e/fixtures/feed.xml';
const FEED_URL = 'http://host.docker.internal:8863/feed.xml';
const WORKFLOW_ID = 'pledgeEvidence001';
const MATCH_URL = 'https://example.org/oo-si/news/1001';

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  // 피드 서버가 같은 프로세스에 있으므로 이벤트 루프를 막지 않는 spawn 을 쓴다.
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => {
      stdout += c;
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });
    child.once('error', reject);
    child.once('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function runN8n(args: string[], env: Record<string, string>) {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  return run('docker', ['compose', 'run', '--rm', '-T', ...envArgs, 'n8n', ...args]);
}

test.describe.configure({ timeout: 180_000 });

test('워크플로를 두 번 돌려도 후보는 1건(pending), 공약 상태는 그대로, 메모는 fixture 로 붙는다', async () => {
  const dataset = await readDataset(SAMPLE);
  const copy = await seedCopy(dataset);
  const feed = await startFeedServer({ file: FEED_FILE, port: 8863 });
  const db = admin();
  try {
    const before = await db.from('pledges').select('id, status').eq('official_id', copy.officialId).order('id');
    expect(before.error).toBeNull();
    const pledgeIds = (before.data ?? []).map((p) => p.id);
    expect(pledgeIds).toHaveLength(dataset.pledges.length);
    const evidenceBefore = await db
      .from('evidence')
      .select('id', { count: 'exact', head: true })
      .in('pledge_id', pledgeIds);

    const n8nEnv = {
      SUPABASE_URL_FOR_N8N: process.env.SUPABASE_URL_FOR_N8N ?? 'http://host.docker.internal:58321',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      PLEDGE_OFFICIAL_ID: copy.officialId,
      EVIDENCE_FEED_URLS: FEED_URL,
    };
    const imp = await runN8n(['import:workflow', '--input=/home/node/workflows/evidence-collect.json'], n8nEnv);
    expect(imp.status, `import failed:\n${imp.stderr}\n${imp.stdout}`).toBe(0);
    for (let i = 0; i < 2; i++) {
      const r = await runN8n(['execute', `--id=${WORKFLOW_ID}`], n8nEnv);
      expect(r.status, `execute #${i + 1} failed:\n${r.stderr}\n${r.stdout}`).toBe(0);
    }
    expect(feed.hits.filter((h) => h === '/feed.xml')).toHaveLength(2);

    const cands = await db
      .from('evidence_candidates')
      .select('id, pledge_id, title, url, state, matched_keywords, score, published_at, llm_note')
      .in('pledge_id', pledgeIds);
    expect(cands.error).toBeNull();
    expect(cands.data).toHaveLength(1);
    const c = cands.data?.[0];
    expect(c).toMatchObject({
      pledge_id: `${copy.prefix}sample-oo-si-p001`,
      title: 'OO역 환승주차장 실시설계 용역 발주',
      url: MATCH_URL,
      state: 'pending',
      matched_keywords: ['환승주차장', 'OO역'],
      score: 1,
      published_at: '2026-11-02',
      llm_note: null,
    });

    const after = await db.from('pledges').select('id, status').eq('official_id', copy.officialId).order('id');
    expect(after.data).toEqual(before.data);
    const evidenceAfter = await db
      .from('evidence')
      .select('id', { count: 'exact', head: true })
      .in('pledge_id', pledgeIds);
    expect(evidenceAfter.count).toBe(evidenceBefore.count);

    // fixture 모드 LLM: 닿을 수 없는 주소와 빈 키로 네트워크를 쓰지 않음을 보장한다.
    const s = await run(
      process.execPath,
      ['--no-warnings=ExperimentalWarning', 'scripts/suggest-candidates.ts', '--limit', '5'],
      { ...process.env, LLM_MODE: 'fixture', LLM_BASE_URL: 'http://localhost:9', LLM_API_KEY: '' },
    );
    expect(s.status, `suggest failed:\n${s.stderr}\n${s.stdout}`).toBe(0);
    const noted = await db
      .from('evidence_candidates')
      .select('llm_note, state')
      .eq('id', c?.id ?? '')
      .single();
    expect(noted.error).toBeNull();
    expect(noted.data?.state).toBe('pending');
    expect(noted.data?.llm_note ?? '').toMatch(/^관련 (가능|낮음): /);
    const after2 = await db.from('pledges').select('id, status').eq('official_id', copy.officialId).order('id');
    expect(after2.data).toEqual(before.data);
  } finally {
    await feed.close();
    await copy.cleanup();
  }
});
