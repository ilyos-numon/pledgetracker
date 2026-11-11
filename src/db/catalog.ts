import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogFile } from '../core/catalog.ts';
import type { Database } from '../core/database.types.ts';

type Db = SupabaseClient<Database>;

// 당선자 목록을 upsert 한다. 파일에 없는 행은 지우지 않는다. 두 번 돌려도 행 수가 같다.
export async function loadCatalog(
  client: Db,
  file: CatalogFile,
): Promise<{ upserted: number; metro: number; local: number }> {
  const now = new Date().toISOString();
  const rows = file.entries.map((e) => ({ ...e, updated_at: now }));
  const res = await client.from('official_catalog').upsert(rows, { onConflict: 'id' }).select('id');
  if (res.error) throw new Error(`upsert official_catalog: ${res.error.message}`);
  return {
    upserted: res.data.length,
    metro: file.entries.filter((e) => e.level === 'metro').length,
    local: file.entries.filter((e) => e.level === 'local').length,
  };
}

export async function dropCatalogEntries(client: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await client.from('official_catalog').delete().in('id', ids);
  if (res.error) throw new Error(`delete official_catalog: ${res.error.message}`);
}
