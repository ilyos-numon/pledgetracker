export type NavKey = 'search' | 'tour' | 'criteria';

export interface NavItem {
  key: NavKey;
  label: string;
  to: string;
  testId: string;
}

// 순서 고정: 정치인 찾기, 둘러보기, 판정 기준
export function buildNavItems(): NavItem[] {
  return [
    { key: 'search', label: '정치인 찾기', to: '/search', testId: 'nav-search' },
    { key: 'tour', label: '둘러보기', to: '/tour', testId: 'nav-tour' },
    { key: 'criteria', label: '판정 기준', to: '/criteria', testId: 'nav-criteria' },
  ];
}

function matches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

// 정치인 대시보드(/o/*)는 '정치인 찾기'에서 들어가므로 search 로 표시한다.
export function activeNavKey(pathname: string): NavKey | null {
  if (matches(pathname, '/o')) return 'search';
  if (matches(pathname, '/search')) return 'search';
  if (matches(pathname, '/tour')) return 'tour';
  if (matches(pathname, '/criteria')) return 'criteria';
  return null;
}
