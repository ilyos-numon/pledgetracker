// 근거 후보 키워드 매칭. n8n "Match Pledges" Code 노드에 그대로 들어가므로 import 없이, 지울 수 있는 타입만 쓴다.

export interface FeedItem {
  title: string;
  link: string;
  pubDate?: string;
  contentSnippet?: string;
  source: string;
}
export interface PledgeKeywords {
  id: string;
  keywords: string[];
}
export interface CandidateRow {
  pledge_id: string;
  title: string;
  url: string;
  published_at: string | null;
  source: string;
  matched_keywords: string[];
  score: number;
}

function normalizeText(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

// 서울 기준 날짜(YYYY-MM-DD). 읽을 수 없으면 null.
function seoulDate(s: string | undefined): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 공약 키워드가 기사 제목·요약에 minHits 개 이상 나오면 (공약, 기사) 한 쌍을 후보로 낸다. */
export function matchItems(
  items: FeedItem[],
  pledges: PledgeKeywords[],
  opts: { minHits?: number } = {},
): CandidateRow[] {
  const minHits = opts.minHits ?? 1;
  const seen = new Set<string>();
  const rows: CandidateRow[] = [];
  for (const it of items) {
    const url = (it.link ?? '').trim();
    if (!/^https?:\/\//i.test(url)) continue;
    const hay = normalizeText(`${it.title ?? ''} ${it.contentSnippet ?? ''}`);
    for (const p of pledges) {
      const keywords = (p.keywords ?? []).filter((k) => normalizeText(k) !== '');
      if (keywords.length === 0) continue;
      const matched = keywords.filter((k) => hay.includes(normalizeText(k)));
      if (matched.length === 0 || matched.length < minHits) continue;
      const key = `${p.id}\u0000${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        pledge_id: p.id,
        title: (it.title ?? '').trim(),
        url,
        published_at: seoulDate(it.pubDate),
        source: it.source,
        matched_keywords: matched,
        score: Math.round((matched.length / keywords.length) * 100) / 100,
      });
    }
  }
  return rows.sort((a, b) =>
    a.pledge_id !== b.pledge_id ? (a.pledge_id < b.pledge_id ? -1 : 1) : a.url < b.url ? -1 : a.url > b.url ? 1 : 0,
  );
}
