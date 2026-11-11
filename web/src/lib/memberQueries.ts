import type { CatalogSearchRow } from '../../../src/core/catalog.ts';
import { SEARCH_ERROR_TEXT } from '../../../src/core/membership.ts';
import { supabase } from './supabase.ts';

export class SearchError extends Error {}

// search_catalog 는 raise exception '<code>' 로 실패한다 → PostgREST error.message 가 code.
export function searchErrorText(error: { message?: string } | null | undefined): string {
  const code = error?.message;
  if (code === 'query_required' || code === 'query_too_long') return SEARCH_ERROR_TEXT[code];
  return SEARCH_ERROR_TEXT.unknown;
}

export async function searchCatalog(query: string): Promise<CatalogSearchRow[]> {
  const res = await supabase.rpc('search_catalog', { p_query: query });
  if (res.error) throw new SearchError(searchErrorText(res.error));
  return res.data as CatalogSearchRow[];
}
