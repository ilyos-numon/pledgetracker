import { describe, expect, it } from 'vitest';
import {
  type CatalogEntry,
  EXPECTED_METRO_COUNT,
  LOCAL_ID_RE,
  METRO_REGIONS,
  metroId,
  validateCatalog,
} from '../../src/core/catalog.ts';

const TERM = { term_start: '2026-07-01', term_end: '2030-06-30' };

function sampleEntry(over: Partial<CatalogEntry> & Record<string, unknown> = {}) {
  return {
    id: 'sample-oo-si',
    person_name: '가상 당선자',
    region_name: 'OO시',
    office: '시장',
    level: 'local',
    ...TERM,
    source_url: 'https://example.org/catalog/sample-oo-si',
    is_sample: true,
    ...over,
  };
}

function sampleFile(entries: unknown[]) {
  return {
    schema_version: 1,
    kind: 'sample',
    election_date: '2026-06-03',
    retrieved_at: '2026-11-09',
    sources: [{ url: 'https://example.org/catalog', title: '가상 목록', retrieved_at: '2026-11-09' }],
    entries,
  };
}

function metroEntries() {
  return METRO_REGIONS.map((m) => ({
    id: metroId(m),
    person_name: `${m.region_name} ${m.office} 당선자`,
    region_name: m.region_name,
    office: m.office,
    level: 'metro',
    ...TERM,
    source_url: `https://example.org/real/${metroId(m)}`,
    is_sample: false,
  }));
}

function localEntry(over: Record<string, unknown> = {}) {
  return {
    id: 'daegu-suseong-district-2026',
    person_name: '수성구 구청장 당선자',
    region_name: '대구광역시 수성구',
    office: '구청장',
    level: 'local',
    ...TERM,
    source_url: 'https://example.org/real/daegu-suseong-district-2026',
    is_sample: false,
    ...over,
  };
}

function realFile(entries: unknown[]) {
  return { ...sampleFile(entries), kind: 'real' };
}

function errorsOf(raw: unknown): string[] {
  const r = validateCatalog(raw);
  if (r.ok) throw new Error('검증이 통과하면 안 된다');
  return r.errors;
}

describe('METRO_REGIONS', () => {
  it('16개이고 id 가 시장 mayor, 도지사 governor 로 끝난다', () => {
    expect(METRO_REGIONS.length).toBe(EXPECTED_METRO_COUNT);
    expect(metroId(METRO_REGIONS[2])).toBe('daegu-mayor-2026');
    expect(metroId(METRO_REGIONS[8])).toBe('gyeonggi-governor-2026');
  });

  it('기초 id 예시가 LOCAL_ID_RE 에 맞는다', () => {
    expect(LOCAL_ID_RE.test('daegu-suseong-district-2026')).toBe(true);
    expect(LOCAL_ID_RE.test('gyeonggi-suwon-mayor-2026')).toBe(true);
    expect(LOCAL_ID_RE.test('daegu-mayor-2026')).toBe(false);
  });
});

describe('validateCatalog — sample', () => {
  it('샘플형 파일 3개 항목은 통과한다', () => {
    const r = validateCatalog(
      sampleFile([
        sampleEntry(),
        sampleEntry({ id: 'sample-xx-gun', person_name: '가상 군수', region_name: 'XX군', office: '군수' }),
        sampleEntry({
          id: 'sample-yy-do',
          person_name: '가상 도지사',
          region_name: 'YY도',
          office: '도지사',
          level: 'metro',
        }),
      ]),
    );
    expect(r.ok).toBe(true);
  });

  it('entry 에 party 키가 있으면 거부하고 키 이름을 알린다', () => {
    const errors = errorsOf(sampleFile([sampleEntry({ party: '무소속' })]));
    expect(errors.join('\n')).toContain('party');
  });

  it('id 중복을 거부한다', () => {
    const errors = errorsOf(sampleFile([sampleEntry(), sampleEntry()]));
    expect(errors.join('\n')).toContain('sample-oo-si');
  });

  it('metro 에 군수를 쓰면 거부한다', () => {
    const errors = errorsOf(sampleFile([sampleEntry({ id: 'sample-yy-do', office: '군수', level: 'metro' })]));
    expect(errors.join('\n')).toContain('sample-yy-do');
  });

  it('region_name 에 금지어가 있으면 거부한다', () => {
    const errors = errorsOf(sampleFile([sampleEntry({ region_name: 'OO시 여당' })]));
    expect(errors.join('\n')).toContain('region_name');
  });

  it('term_start 가 term_end 보다 늦으면 거부한다', () => {
    const errors = errorsOf(sampleFile([sampleEntry({ term_start: '2030-07-01', term_end: '2026-06-30' })]));
    expect(errors.join('\n')).toContain('term_start');
  });

  it('sample 파일에 is_sample false 나 sample- 아닌 id 가 있으면 거부한다', () => {
    const errors = errorsOf(sampleFile([sampleEntry({ id: 'oo-si', is_sample: false })]));
    expect(errors.join('\n')).toContain('oo-si');
  });
});

describe('validateCatalog — real', () => {
  it('광역 16개 + 기초 1개는 통과한다', () => {
    const r = validateCatalog(realFile([...metroEntries(), localEntry()]));
    expect(r.ok).toBe(true);
  });

  it('광역이 15개면 빠진 id 를 알린다', () => {
    const entries = metroEntries().filter((e) => e.id !== 'jeju-governor-2026');
    const errors = errorsOf(realFile(entries));
    expect(errors.join('\n')).toContain('jeju-governor-2026');
  });

  it('METRO_REGIONS 에 없는 광역 id 를 거부한다', () => {
    const extra = { ...metroEntries()[0], id: 'mars-mayor-2026' };
    const errors = errorsOf(realFile([...metroEntries(), extra]));
    expect(errors.join('\n')).toContain('mars-mayor-2026');
  });

  it('기초 id 접두가 region_name 의 광역과 다르면 거부한다', () => {
    const errors = errorsOf(realFile([...metroEntries(), localEntry({ id: 'busan-suseong-district-2026' })]));
    expect(errors.join('\n')).toContain('busan-suseong-district-2026');
  });

  it('기초 id 끝 직위 슬러그가 office 와 다르면 거부한다', () => {
    const errors = errorsOf(realFile([...metroEntries(), localEntry({ id: 'daegu-suseong-mayor-2026' })]));
    expect(errors.join('\n')).toContain('daegu-suseong-mayor-2026');
  });

  it('real 파일에 is_sample true 가 있으면 거부한다', () => {
    const errors = errorsOf(realFile([...metroEntries(), localEntry({ is_sample: true })]));
    expect(errors.join('\n')).toContain('daegu-suseong-district-2026');
  });
});
