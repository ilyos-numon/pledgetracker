import { describe, expect, it } from 'vitest';
import { type FeedItem, matchItems, type PledgeKeywords } from '../../src/core/match.ts';

const P1: PledgeKeywords = { id: 'p001', keywords: ['환승주차장', 'OO역'] };
const P2: PledgeKeywords = { id: 'p002', keywords: ['버스', '노선'] };

function item(over: Partial<FeedItem>): FeedItem {
  return { title: '', link: 'https://example.org/a', source: 'example.org', ...over };
}

describe('matchItems', () => {
  it('키워드 1개가 제목에 있으면 1행, score 는 hits/키워드 수', () => {
    const rows = matchItems([item({ title: '환승주차장 실시설계 용역 발주' })], [P1]);
    expect(rows).toEqual([
      {
        pledge_id: 'p001',
        title: '환승주차장 실시설계 용역 발주',
        url: 'https://example.org/a',
        published_at: null,
        source: 'example.org',
        matched_keywords: ['환승주차장'],
        score: 0.5,
      },
    ]);
  });

  it('요약(contentSnippet)도 보고, 대소문자·공백 차이를 무시한다', () => {
    const rows = matchItems(
      [item({ title: '소식', contentSnippet: 'oo역\n 앞   환승주차장' })],
      [{ id: 'p', keywords: ['OO역', '환승  주차장', '환승주차장'] }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].matched_keywords).toEqual(['OO역', '환승주차장']);
    expect(rows[0].score).toBe(0.67);
  });

  it('공백을 접어서 비교한다', () => {
    const rows = matchItems([item({ title: '시내  버스\t노선 개편' })], [{ id: 'p', keywords: ['시내 버스'] }]);
    expect(rows.map((r) => r.score)).toEqual([1]);
  });

  it('맞는 키워드가 없으면 0행', () => {
    expect(matchItems([item({ title: '도서관 개관 안내' })], [P1, P2])).toEqual([]);
  });

  it('minHits 보다 적게 맞으면 버린다', () => {
    const items = [
      item({ title: '환승주차장 착공' }),
      item({ title: 'OO역 환승주차장 준공', link: 'https://example.org/b' }),
    ];
    const rows = matchItems(items, [P1], { minHits: 2 });
    expect(rows.map((r) => r.url)).toEqual(['https://example.org/b']);
    expect(rows[0].score).toBe(1);
  });

  it('http(s) 가 아닌 링크는 버린다', () => {
    const items = [
      item({ title: '환승주차장', link: 'ftp://example.org/x' }),
      item({ title: '환승주차장', link: 'javascript:alert(1)' }),
      item({ title: '환승주차장', link: '' }),
      item({ title: '환승주차장', link: 'HTTP://example.org/ok' }),
    ];
    expect(matchItems(items, [P1]).map((r) => r.url)).toEqual(['HTTP://example.org/ok']);
  });

  it('(pledge_id, url) 중복을 없애고 pledge_id, url 순으로 정렬한다', () => {
    const items = [
      item({ title: '버스 노선 환승주차장', link: 'https://example.org/z' }),
      item({ title: '환승주차장', link: 'https://example.org/b' }),
      item({ title: '환승주차장 다시', link: 'https://example.org/b' }),
      item({ title: '버스', link: 'https://example.org/a' }),
    ];
    const rows = matchItems(items, [P2, P1]);
    expect(rows.map((r) => [r.pledge_id, r.url])).toEqual([
      ['p001', 'https://example.org/b'],
      ['p001', 'https://example.org/z'],
      ['p002', 'https://example.org/a'],
      ['p002', 'https://example.org/z'],
    ]);
    expect(rows[0].title).toBe('환승주차장');
  });

  it('pubDate 를 서울 기준 날짜로, 읽을 수 없으면 null', () => {
    const rows = matchItems(
      [
        item({ title: '환승주차장', link: 'https://example.org/1', pubDate: 'Mon, 02 Nov 2026 00:30:00 +0900' }),
        item({ title: '환승주차장', link: 'https://example.org/2', pubDate: 'not a date' }),
      ],
      [P1],
    );
    expect(rows.map((r) => r.published_at)).toEqual(['2026-11-02', null]);
  });

  it('키워드가 비어 있는 공약은 건너뛴다', () => {
    expect(matchItems([item({ title: '환승주차장' })], [{ id: 'p', keywords: [] }])).toEqual([]);
  });
});
