import { z } from 'zod';
import { FORBIDDEN_WORDS } from './dataset.ts';

export const OFFICES = ['시장', '도지사', '군수', '구청장'] as const;
export type CatalogOffice = (typeof OFFICES)[number];

// 행정표준코드 순, 16개
export const METRO_REGIONS = [
  { slug: 'seoul', region_name: '서울특별시', office: '시장' },
  { slug: 'busan', region_name: '부산광역시', office: '시장' },
  { slug: 'daegu', region_name: '대구광역시', office: '시장' },
  { slug: 'incheon', region_name: '인천광역시', office: '시장' },
  { slug: 'jeonnam-gwangju', region_name: '전남광주통합특별시', office: '시장' },
  { slug: 'daejeon', region_name: '대전광역시', office: '시장' },
  { slug: 'ulsan', region_name: '울산광역시', office: '시장' },
  { slug: 'sejong', region_name: '세종특별자치시', office: '시장' },
  { slug: 'gyeonggi', region_name: '경기도', office: '도지사' },
  { slug: 'gangwon', region_name: '강원특별자치도', office: '도지사' },
  { slug: 'chungbuk', region_name: '충청북도', office: '도지사' },
  { slug: 'chungnam', region_name: '충청남도', office: '도지사' },
  { slug: 'jeonbuk', region_name: '전북특별자치도', office: '도지사' },
  { slug: 'gyeongbuk', region_name: '경상북도', office: '도지사' },
  { slug: 'gyeongnam', region_name: '경상남도', office: '도지사' },
  { slug: 'jeju', region_name: '제주특별자치도', office: '도지사' },
] as const;

export const EXPECTED_METRO_COUNT = 16;

export function metroId(m: (typeof METRO_REGIONS)[number]): string {
  return m.office === '시장' ? `${m.slug}-mayor-2026` : `${m.slug}-governor-2026`;
}

export const LOCAL_OFFICE_SLUG = { 시장: 'mayor', 군수: 'county', 구청장: 'district' } as const;

// 기초 id: `${metroSlug}-${로마자 지역명}-${LOCAL_OFFICE_SLUG[office]}-2026`
export const LOCAL_ID_RE = /^[a-z]+-[a-z0-9]+(?:-[a-z0-9]+)*-(mayor|county|district)-2026$/;

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CatalogEntrySchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]{3,60}$/),
  person_name: z.string().min(1).max(30),
  region_name: z.string().min(1).max(40),
  office: z.enum(OFFICES),
  level: z.enum(['metro', 'local']),
  term_start: ymd,
  term_end: ymd,
  source_url: z
    .string()
    .url()
    .regex(/^https?:\/\//),
  is_sample: z.boolean(),
});

const METRO_OFFICES: readonly string[] = ['시장', '도지사'];
const LOCAL_OFFICES: readonly string[] = ['시장', '군수', '구청장'];

export const CatalogFileSchema = z
  .strictObject({
    schema_version: z.literal(1),
    kind: z.enum(['real', 'sample']),
    election_date: z.literal('2026-06-03'),
    retrieved_at: ymd,
    sources: z.array(z.strictObject({ url: z.string().url(), title: z.string().min(1), retrieved_at: ymd })).min(1),
    entries: z.array(CatalogEntrySchema).min(1),
  })
  .superRefine((file, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });

    const seen = new Set<string>();
    file.entries.forEach((e, i) => {
      // 1. id 중복
      if (seen.has(e.id)) issue(['entries', i, 'id'], `${e.id}: id 가 중복됩니다`);
      seen.add(e.id);
      // 2. 임기 순서
      if (e.term_start > e.term_end)
        issue(['entries', i, 'term_start'], `${e.id}: term_start 가 term_end 보다 늦습니다`);
      // 3. level 별 직위
      const allowed = e.level === 'metro' ? METRO_OFFICES : LOCAL_OFFICES;
      if (!allowed.includes(e.office)) {
        issue(['entries', i, 'office'], `${e.id}: level ${e.level} 에는 office ${e.office} 를 쓸 수 없습니다`);
      }
      // 4. 금지어
      for (const field of ['region_name', 'office'] as const) {
        const hit = FORBIDDEN_WORDS.find((w) => e[field].includes(w));
        if (hit) issue(['entries', i, field], `${e.id}: ${field} 에 금지어 "${hit}" 가 있습니다`);
      }
    });

    if (file.kind === 'sample') {
      // 5. 샘플 파일
      file.entries.forEach((e, i) => {
        if (!e.is_sample) issue(['entries', i, 'is_sample'], `${e.id}: sample 파일의 is_sample 은 true 여야 합니다`);
        if (!/^sample-[a-z0-9-]+$/.test(e.id))
          issue(['entries', i, 'id'], `${e.id}: sample id 는 sample- 로 시작해야 합니다`);
      });
      return;
    }

    // 6. 실데이터 파일
    const expected = new Map(METRO_REGIONS.map((m) => [metroId(m), m]));
    const metroIds = new Set<string>();
    file.entries.forEach((e, i) => {
      if (e.is_sample) issue(['entries', i, 'is_sample'], `${e.id}: real 파일의 is_sample 은 false 여야 합니다`);
      if (e.level === 'metro') {
        metroIds.add(e.id);
        const m = expected.get(e.id);
        if (!m) {
          issue(['entries', i, 'id'], `${e.id}: METRO_REGIONS 에 없는 광역 id 입니다`);
        } else if (m.region_name !== e.region_name || m.office !== e.office) {
          issue(['entries', i], `${e.id}: region_name·office 가 ${m.region_name} ${m.office} 와 다릅니다`);
        }
        return;
      }
      if (!LOCAL_ID_RE.test(e.id)) {
        issue(['entries', i, 'id'], `${e.id}: 기초 id 형식이 아닙니다`);
        return;
      }
      const metro = METRO_REGIONS.find((r) => e.id.startsWith(`${r.slug}-`));
      if (!metro) {
        issue(['entries', i, 'id'], `${e.id}: id 가 광역 slug 로 시작하지 않습니다`);
      } else if (!e.region_name.startsWith(`${metro.region_name} `)) {
        issue(['entries', i, 'region_name'], `${e.id}: region_name 이 "${metro.region_name} " 로 시작하지 않습니다`);
      }
      const slug = LOCAL_OFFICE_SLUG[e.office as keyof typeof LOCAL_OFFICE_SLUG];
      if (slug && !e.id.endsWith(`-${slug}-2026`)) {
        issue(['entries', i, 'id'], `${e.id}: id 끝 직위 슬러그가 ${slug} 가 아닙니다`);
      }
    });
    for (const id of expected.keys()) {
      if (!metroIds.has(id)) issue(['entries'], `${id}: 광역 항목이 빠졌습니다`);
    }
  });

export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type CatalogFile = z.infer<typeof CatalogFileSchema>;
export interface CatalogSearchRow extends CatalogEntry {
  tracked: boolean;
  pledge_count: number;
}

export function validateCatalog(raw: unknown): { ok: true; data: CatalogFile } | { ok: false; errors: string[] } {
  const result = CatalogFileSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const keys = 'keys' in issue && Array.isArray(issue.keys) ? ` (${issue.keys.join(', ')})` : '';
      return `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}${keys}`;
    }),
  };
}
