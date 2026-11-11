import type { CatalogSearchRow } from '../../../src/core/catalog.ts';

export type SearchFilter = 'all' | 'tracked' | 'metro' | 'local';

export const SEARCH_FILTERS: readonly { value: SearchFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'tracked', label: '추적 중' },
  { value: 'metro', label: '광역' },
  { value: 'local', label: '기초' },
];

// 추적 중을 앞에 둔다. 각 그룹 안에서는 서버 순서를 유지하고 입력은 바꾸지 않는다.
export function sortTrackedFirst(rows: readonly CatalogSearchRow[]): CatalogSearchRow[] {
  return [...rows.filter((r) => r.tracked), ...rows.filter((r) => !r.tracked)];
}

export function filterResults(rows: readonly CatalogSearchRow[], filter: SearchFilter): CatalogSearchRow[] {
  switch (filter) {
    case 'tracked':
      return rows.filter((r) => r.tracked);
    case 'metro':
      return rows.filter((r) => r.level === 'metro');
    case 'local':
      return rows.filter((r) => r.level === 'local');
    default:
      return [...rows];
  }
}

export function resultCountText(visible: number, total: number): string {
  return visible === total ? `결과 ${visible}명` : `결과 ${visible}명 (전체 ${total}명)`;
}
