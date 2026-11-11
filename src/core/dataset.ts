import { z } from 'zod';
import { CATEGORIES, type Evidence } from './types.ts';

// 평가 어휘·정당명. summary, status_reason 에 쓰지 않는다 (title 은 원문 인용이라 제외).
export const FORBIDDEN_WORDS: readonly string[] = [
  '훌륭',
  '잘한',
  '못한',
  '성공적',
  '실패작',
  '최악',
  '칭찬',
  '비판',
  '무능',
  '유능',
  '치적',
  '업적',
  '더불어민주당',
  '국민의힘',
  '조국혁신당',
  '개혁신당',
  '진보당',
  '정의당',
  '여당',
  '야당',
  '좌파',
  '우파',
];

const HttpUrl = z.string().regex(/^https?:\/\/\S+$/, 'http 또는 https 주소여야 합니다');
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 합니다');

export const OfficialSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,60}$/),
  region_name: z.string().min(1),
  office: z.string().min(1),
  person_name: z.string().min(1),
  term_start: IsoDate,
  term_end: IsoDate,
  election_date: IsoDate,
  source_url: HttpUrl,
  source_kind: z.enum(['nec', 'municipality', 'sample']),
  is_sample: z.boolean(),
});

export const EvidenceSchema: z.ZodType<Omit<Evidence, 'id' | 'pledge_id' | 'added_by'>> = z.object({
  kind: z.enum(['press_release', 'council_minutes', 'budget', 'official_page', 'news', 'objection', 'other']),
  title: z.string().min(1),
  url: HttpUrl,
  published_at: IsoDate.nullable(),
  locator: z.string().nullable(),
  note: z.string().nullable(),
  checked_at: IsoDate.nullable(),
});

export const PledgeInDatasetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+-p\d{3}$/),
  seq: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  category: z.enum(CATEGORIES),
  keywords: z.array(z.string().min(1)).min(1).max(8),
  source_url: HttpUrl,
  source_locator: z.string().nullable(),
  status: z.enum(['not_started', 'in_progress', 'fulfilled', 'modified', 'abandoned']),
  status_decided_at: IsoDate.nullable(),
  status_reason: z.string().min(1),
  evidence: z.array(EvidenceSchema),
});

export const SourceSchema = z.object({
  url: HttpUrl,
  title: z.string(),
  retrieved_at: z.string(),
  format: z.enum(['pdf', 'hwp', 'hwpx', 'html']),
  sha256: z.string().nullable(),
});

export const PledgeDatasetSchema = z
  .object({
    schema_version: z.literal(1),
    official: OfficialSchema,
    sources: z.array(SourceSchema).min(1),
    pledges: z.array(PledgeInDatasetSchema).min(1),
  })
  .superRefine((ds, ctx) => {
    const seen = new Set<string>();
    ds.pledges.forEach((p, i) => {
      if (seen.has(p.id)) {
        ctx.addIssue({ code: 'custom', path: ['pledges', i, 'id'], message: `${p.id}: 공약 id 가 중복됩니다` });
      }
      seen.add(p.id);
      if (!p.id.startsWith(`${ds.official.id}-p`)) {
        ctx.addIssue({
          code: 'custom',
          path: ['pledges', i, 'id'],
          message: `${p.id}: 공약 id 는 ${ds.official.id}-p 로 시작해야 합니다`,
        });
      }
      if (p.status !== 'not_started' && p.evidence.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['pledges', i, 'evidence'],
          message: `${p.id}: 미착수가 아닌 상태에는 근거가 1건 이상 있어야 합니다`,
        });
      }
      for (const field of ['summary', 'status_reason'] as const) {
        const hit = FORBIDDEN_WORDS.find((w) => p[field].includes(w));
        if (hit) {
          ctx.addIssue({
            code: 'custom',
            path: ['pledges', i, field],
            message: `${p.id}: 금지어 "${hit}" 가 있습니다`,
          });
        }
      }
    });
  });

export type PledgeDataset = z.infer<typeof PledgeDatasetSchema>;

export function validateDataset(raw: unknown): { ok: true; data: PledgeDataset } | { ok: false; errors: string[] } {
  const result = PledgeDatasetSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`),
  };
}
