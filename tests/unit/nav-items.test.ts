import { describe, expect, it } from 'vitest';
import { activeNavKey, buildNavItems } from '../../web/src/components/nav/navItems.ts';

describe('buildNavItems', () => {
  it('주 메뉴 3개를 고정 순서·경로·testId 로 만든다', () => {
    expect(buildNavItems()).toEqual([
      { key: 'search', label: '정치인 찾기', to: '/search', testId: 'nav-search' },
      { key: 'tour', label: '둘러보기', to: '/tour', testId: 'nav-tour' },
      { key: 'criteria', label: '판정 기준', to: '/criteria', testId: 'nav-criteria' },
    ]);
  });

  it('정치인 대시보드(/o/*) 로 가는 메뉴는 없다', () => {
    for (const item of buildNavItems()) {
      expect(item.to.startsWith('/o')).toBe(false);
    }
  });
});

describe('activeNavKey', () => {
  it('정치인 대시보드 경로와 그 하위는 search', () => {
    expect(activeNavKey('/o')).toBe('search');
    expect(activeNavKey('/o/sample-oo-si')).toBe('search');
    expect(activeNavKey('/o/sample-oo-si/p/x')).toBe('search');
  });

  it('메뉴 경로를 해당 키로 바꾼다', () => {
    expect(activeNavKey('/search')).toBe('search');
    expect(activeNavKey('/search/more')).toBe('search');
    expect(activeNavKey('/tour')).toBe('tour');
    expect(activeNavKey('/criteria')).toBe('criteria');
  });

  it('메뉴에 없는 경로는 null', () => {
    expect(activeNavKey('/')).toBeNull();
    expect(activeNavKey('/review')).toBeNull();
    expect(activeNavKey('/login')).toBeNull();
    expect(activeNavKey('/signup')).toBeNull();
    expect(activeNavKey('/other')).toBeNull();
    expect(activeNavKey('/searching')).toBeNull();
    expect(activeNavKey('/oo')).toBeNull();
  });
});
