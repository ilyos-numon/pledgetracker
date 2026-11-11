// 비회원이 추적 요청을 누른 뒤 로그인·가입하고 /search 로 돌아올 때 쓰는 복귀 경로 도우미. 순수 함수만 둔다.
export type PendingRequest =
  | { kind: 'catalog'; id: string }
  | { kind: 'free'; name: string; region: string; office: string };

export const RETURN_PARAM = {
  query: 'q',
  request: 'request',
  name: 'name',
  region: 'region',
  office: 'office',
} as const;
export const FREE_REQUEST_VALUE = 'free';
export const RETURN_FIELD_MAX = 40;
export const CATALOG_ID_RE = /^[a-z0-9-]{3,60}$/;

export function buildReturnPath(query: string, req: PendingRequest): string {
  const entries: [string, string][] = [];
  const q = query.trim();
  if (q.length > 0) entries.push([RETURN_PARAM.query, q]);
  if (req.kind === 'catalog') {
    entries.push([RETURN_PARAM.request, req.id]);
  } else {
    entries.push([RETURN_PARAM.request, FREE_REQUEST_VALUE]);
    entries.push([RETURN_PARAM.name, req.name.trim()]);
    entries.push([RETURN_PARAM.region, req.region.trim()]);
    entries.push([RETURN_PARAM.office, req.office.trim()]);
  }
  return `/search?${new URLSearchParams(entries).toString()}`;
}

function field(params: URLSearchParams, key: string): string | null {
  const v = (params.get(key) ?? '').trim();
  return v.length >= 1 && v.length <= RETURN_FIELD_MAX ? v : null;
}

export function parseReturnParams(params: URLSearchParams): { query: string; request: PendingRequest | null } {
  const query = field(params, RETURN_PARAM.query) ?? '';
  const raw = params.get(RETURN_PARAM.request);
  let request: PendingRequest | null = null;
  if (raw === FREE_REQUEST_VALUE) {
    const name = field(params, RETURN_PARAM.name);
    const region = field(params, RETURN_PARAM.region);
    const office = field(params, RETURN_PARAM.office);
    if (name && region && office) request = { kind: 'free', name, region, office };
  } else if (raw !== null && CATALOG_ID_RE.test(raw)) {
    request = { kind: 'catalog', id: raw };
  }
  return { query, request };
}

export function stripRequestParams(params: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(params);
  for (const key of [RETURN_PARAM.request, RETURN_PARAM.name, RETURN_PARAM.region, RETURN_PARAM.office])
    out.delete(key);
  return out;
}

export function loginHref(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

export function signupHref(next: string): string {
  return `/signup?next=${encodeURIComponent(next)}`;
}
