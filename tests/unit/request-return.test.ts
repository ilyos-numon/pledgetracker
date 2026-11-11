import { describe, expect, it } from 'vitest';
import {
  buildReturnPath,
  loginHref,
  parseReturnParams,
  signupHref,
  stripRequestParams,
} from '../../web/src/lib/requestReturn.ts';

function parsePath(path: string) {
  const [pathname, search = ''] = path.split('?');
  return { pathname, params: new URLSearchParams(search) };
}

describe('buildReturnPath · parseReturnParams', () => {
  it('catalog 요청이 왕복한다', () => {
    const path = buildReturnPath('가상', { kind: 'catalog', id: 'sample-xx-gun' });
    expect(path).toBe(
      `/search?${new URLSearchParams([
        ['q', '가상'],
        ['request', 'sample-xx-gun'],
      ]).toString()}`,
    );
    const { pathname, params } = parsePath(path);
    expect(pathname).toBe('/search');
    expect(parseReturnParams(params)).toEqual({ query: '가상', request: { kind: 'catalog', id: 'sample-xx-gun' } });
  });

  it('free 요청이 공백 포함 값으로 왕복한다', () => {
    const req = { kind: 'free', name: '홍 길동', region: '가상시 가상구', office: '구청장' } as const;
    const path = buildReturnPath(' 가상 ', req);
    const { params } = parsePath(path);
    expect([...params.keys()]).toEqual(['q', 'request', 'name', 'region', 'office']);
    expect(parseReturnParams(params)).toEqual({ query: '가상', request: req });
  });

  it('free 값은 trim 해서 넣는다', () => {
    const path = buildReturnPath('', { kind: 'free', name: ' 가 ', region: ' 나 ', office: ' 다 ' });
    const { params } = parsePath(path);
    expect(params.get('name')).toBe('가');
    expect(params.get('region')).toBe('나');
    expect(params.get('office')).toBe('다');
  });

  it('q 가 비어 있으면 생략한다', () => {
    const path = buildReturnPath('   ', { kind: 'catalog', id: 'abc' });
    expect(path).toBe('/search?request=abc');
    expect(parseReturnParams(parsePath(path).params)).toEqual({ query: '', request: { kind: 'catalog', id: 'abc' } });
  });
});

describe('parseReturnParams 거부', () => {
  it('잘못된 id 는 null', () => {
    expect(parseReturnParams(new URLSearchParams({ request: 'Bad Id' })).request).toBeNull();
    expect(parseReturnParams(new URLSearchParams({ request: 'ab' })).request).toBeNull();
  });

  it('request 가 없으면 null', () => {
    expect(parseReturnParams(new URLSearchParams({ q: '가상' }))).toEqual({ query: '가상', request: null });
  });

  it('free 필드 하나가 비었거나 41자면 null', () => {
    const base = { request: 'free', name: '가', region: '나', office: '다' };
    expect(parseReturnParams(new URLSearchParams({ ...base, region: '  ' })).request).toBeNull();
    expect(parseReturnParams(new URLSearchParams({ request: 'free', name: '가', office: '다' })).request).toBeNull();
    expect(parseReturnParams(new URLSearchParams({ ...base, office: '가'.repeat(41) })).request).toBeNull();
    expect(parseReturnParams(new URLSearchParams({ ...base, office: '가'.repeat(40) })).request).toEqual({
      kind: 'free',
      name: '가',
      region: '나',
      office: '가'.repeat(40),
    });
  });

  it('q 가 41자면 빈 문자열', () => {
    expect(parseReturnParams(new URLSearchParams({ q: '가'.repeat(41) })).query).toBe('');
    expect(parseReturnParams(new URLSearchParams({ q: '가'.repeat(40) })).query).toBe('가'.repeat(40));
  });
});

describe('stripRequestParams', () => {
  it('q 는 남기고 request·name·region·office 를 뺀다', () => {
    const input = new URLSearchParams({ q: '가상', request: 'free', name: '가', region: '나', office: '다', x: '1' });
    const out = stripRequestParams(input);
    expect(out.get('q')).toBe('가상');
    expect(out.get('x')).toBe('1');
    expect(out.has('request')).toBe(false);
    expect(out.has('name')).toBe(false);
    expect(out.has('region')).toBe(false);
    expect(out.has('office')).toBe(false);
    expect(input.get('request')).toBe('free');
    expect(out).not.toBe(input);
  });
});

describe('loginHref · signupHref', () => {
  it('next 를 인코딩한다', () => {
    const next = '/search?q=가상&request=x';
    expect(loginHref(next)).toBe(`/login?next=${encodeURIComponent(next)}`);
    expect(signupHref(next)).toBe(`/signup?next=${encodeURIComponent(next)}`);
    expect(loginHref(next).startsWith('/login?next=%2Fsearch%3Fq%3D')).toBe(true);
    expect(signupHref(next).startsWith('/signup?next=%2Fsearch%3Fq%3D')).toBe(true);
  });
});
