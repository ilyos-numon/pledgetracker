import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { type CatalogFile, validateCatalog } from '../../../src/core/catalog.ts';
import { loadCatalog } from '../../../src/db/catalog.ts';
import { admin } from './db.ts';

export const SAMPLE_CATALOG_PATH = 'tests/fixtures/catalog.sample.json';

function rand(n: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join('');
}

export async function readCatalog(path: string): Promise<CatalogFile> {
  const result = validateCatalog(JSON.parse(await readFile(path, 'utf8')));
  if (!result.ok) throw new Error(`${path}: ${result.errors.join('; ')}`);
  return result.data;
}

// 샘플 3행을 (다시) 넣는다. tracked 를 위해 호출자는 helpers/db.ts seedSample() 도 부른다.
export async function seedCatalogSample(): Promise<CatalogFile> {
  const file = await readCatalog(SAMPLE_CATALOG_PATH);
  await loadCatalog(admin(), file);
  return file;
}

export function newMemberCredentials(): { email: string; password: string } {
  return { email: `e2e-m-${rand(8)}@example.org`, password: `pw-${rand(16)}` };
}

// 검수자 등록 없이 확인된 회원을 만든다.
export async function createMember(): Promise<{
  email: string;
  password: string;
  userId: string;
  cleanup(): Promise<void>;
}> {
  const { email, password } = newMemberCredentials();
  const created = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
  const userId = created.data.user.id;
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

export async function deleteUserByEmail(email: string): Promise<void> {
  const db = admin();
  const list = await db.auth.admin.listUsers({ perPage: 1000 });
  if (list.error) throw new Error(`listUsers: ${list.error.message}`);
  const user = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return;
  const res = await db.auth.admin.deleteUser(user.id);
  if (res.error) throw new Error(`deleteUser: ${res.error.message}`);
}

export async function countRows(table: 'officials' | 'official_catalog'): Promise<number> {
  const res = await admin().from(table).select('*', { count: 'exact', head: true });
  if (res.error) throw new Error(`count ${table}: ${res.error.message}`);
  return res.count ?? 0;
}
