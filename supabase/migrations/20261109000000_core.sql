-- 공약추적기 핵심 스키마: 테이블 7개, RLS, 검수 RPC 2개. 정당 컬럼은 두지 않는다.

create type public.pledge_status as enum ('not_started', 'in_progress', 'fulfilled', 'modified', 'abandoned');

create table public.officials (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  region_name text not null,
  office text not null,
  person_name text not null,
  term_start date not null,
  term_end date not null,
  election_date date not null,
  source_url text not null,
  source_kind text not null check (source_kind in ('nec', 'municipality', 'sample')),
  is_sample boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.pledges (
  id text primary key,
  official_id text not null references public.officials (id) on delete cascade,
  seq int not null,
  title text not null,
  summary text not null,
  category text not null check (category in ('교통', '교육', '복지', '환경', '경제', '행정', '문화', '안전', '도시', '기타')),
  keywords text[] not null default '{}',
  source_url text not null,
  source_locator text,
  status public.pledge_status not null default 'not_started',
  status_decided_at date,
  status_reason text not null default '근거 없음',
  updated_at timestamptz not null default now(),
  unique (official_id, seq)
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  pledge_id text not null references public.pledges (id) on delete cascade,
  kind text not null check (kind in ('press_release', 'council_minutes', 'budget', 'official_page', 'news', 'objection', 'other')),
  title text not null,
  url text not null check (url ~ '^https?://'),
  published_at date,
  locator text,
  note text,
  checked_at date,
  added_by text not null check (added_by in ('seed', 'reviewer', 'objection')),
  created_at timestamptz not null default now()
);

create table public.evidence_candidates (
  id uuid primary key default gen_random_uuid(),
  pledge_id text not null references public.pledges (id) on delete cascade,
  title text not null,
  url text not null check (url ~ '^https?://'),
  published_at date,
  source text not null,
  matched_keywords text[] not null default '{}',
  score real not null default 0,
  llm_note text,
  state text not null default 'pending' check (state in ('pending', 'adopted', 'rejected')),
  decided_at timestamptz,
  decided_by uuid,
  created_at timestamptz not null default now(),
  unique (pledge_id, url)
);

create table public.objections (
  id uuid primary key default gen_random_uuid(),
  pledge_id text not null references public.pledges (id) on delete cascade,
  body text not null check (char_length(body) between 10 and 2000),
  evidence_url text check (evidence_url is null or evidence_url ~ '^https?://'),
  state text not null default 'open' check (state in ('open', 'accepted', 'rejected')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.pledge_events (
  id bigint generated always as identity primary key,
  pledge_id text not null references public.pledges (id) on delete cascade,
  kind text not null check (kind in ('seed', 'status_change', 'evidence_added', 'objection_resolved')),
  from_status public.pledge_status,
  to_status public.pledge_status,
  reason text not null default '',
  evidence_id uuid references public.evidence (id) on delete set null,
  objection_id uuid references public.objections (id) on delete set null,
  event_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.reviewers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index pledges_official_idx on public.pledges (official_id);
create index evidence_pledge_idx on public.evidence (pledge_id);
create index candidates_pledge_idx on public.evidence_candidates (pledge_id);
create index objections_pledge_idx on public.objections (pledge_id);
create index events_pledge_idx on public.pledge_events (pledge_id);

-- 테이블 권한: 이 CLI 버전은 새 테이블에 API 역할 권한을 자동으로 주지 않는다.
-- 권한은 넓게 주고 실제 허용 범위는 아래 RLS 정책이 정한다 (정책 없는 동작은 0행 또는 거부).
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- RLS ------------------------------------------------------------------------

alter table public.officials enable row level security;
alter table public.pledges enable row level security;
alter table public.evidence enable row level security;
alter table public.evidence_candidates enable row level security;
alter table public.objections enable row level security;
alter table public.pledge_events enable row level security;
alter table public.reviewers enable row level security;

create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.reviewers r where r.user_id = auth.uid());
$$;

create policy public_read on public.officials for select to anon, authenticated using (true);
create policy public_read on public.pledges for select to anon, authenticated using (true);
create policy public_read on public.evidence for select to anon, authenticated using (true);
create policy public_read on public.pledge_events for select to anon, authenticated using (true);

create policy anon_insert on public.objections for insert to anon, authenticated
  with check (state = 'open' and resolution_note is null and resolved_at is null);

create policy reviewer_read on public.objections for select to authenticated using (public.is_reviewer());
create policy reviewer_read on public.evidence_candidates for select to authenticated using (public.is_reviewer());

create policy self_read on public.reviewers for select to authenticated using (user_id = auth.uid());

-- RPC ------------------------------------------------------------------------

create or replace function public.review_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_new_status public.pledge_status default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cand public.evidence_candidates%rowtype;
  v_pledge public.pledges%rowtype;
  v_evidence_id uuid;
  v_kind text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_change boolean;
begin
  if not public.is_reviewer() then
    raise exception 'not_reviewer';
  end if;
  if p_decision is null or p_decision not in ('adopt', 'reject') then
    raise exception 'bad_decision';
  end if;

  select * into v_cand from public.evidence_candidates where id = p_candidate_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_cand.state <> 'pending' then
    raise exception 'already_decided';
  end if;

  select * into v_pledge from public.pledges where id = v_cand.pledge_id for update;

  if p_decision = 'reject' then
    update public.evidence_candidates
      set state = 'rejected', decided_at = now(), decided_by = auth.uid()
      where id = v_cand.id;
    return jsonb_build_object('ok', true, 'evidence_id', null, 'status', v_pledge.status);
  end if;

  v_change := p_new_status is not null and p_new_status <> v_pledge.status;
  if v_change then
    if v_reason is null then
      raise exception 'reason_required';
    end if;
    if not (
      (v_pledge.status = 'not_started' and p_new_status in ('in_progress', 'abandoned'))
      or (v_pledge.status = 'in_progress' and p_new_status in ('fulfilled', 'modified', 'abandoned'))
    ) then
      raise exception 'invalid_transition';
    end if;
  end if;

  v_kind := case
    when v_cand.source like 'press%' then 'press_release'
    when v_cand.source like 'council%' then 'council_minutes'
    when v_cand.source like 'budget%' then 'budget'
    else 'news'
  end;

  insert into public.evidence (pledge_id, kind, title, url, published_at, note, checked_at, added_by)
    values (v_pledge.id, v_kind, v_cand.title, v_cand.url, v_cand.published_at, v_cand.llm_note, current_date, 'reviewer')
    returning id into v_evidence_id;

  insert into public.pledge_events (pledge_id, kind, reason, evidence_id)
    values (v_pledge.id, 'evidence_added', v_cand.title, v_evidence_id);

  if v_change then
    update public.pledges
      set status = p_new_status, status_decided_at = current_date, status_reason = v_reason, updated_at = now()
      where id = v_pledge.id;
    insert into public.pledge_events (pledge_id, kind, from_status, to_status, reason, evidence_id)
      values (v_pledge.id, 'status_change', v_pledge.status, p_new_status, v_reason, v_evidence_id);
    v_pledge.status := p_new_status;
  end if;

  update public.evidence_candidates
    set state = 'adopted', decided_at = now(), decided_by = auth.uid()
    where id = v_cand.id;

  return jsonb_build_object('ok', true, 'evidence_id', v_evidence_id, 'status', v_pledge.status);
end;
$$;

create or replace function public.resolve_objection(
  p_objection_id uuid,
  p_decision text,
  p_note text,
  p_new_status public.pledge_status default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_obj public.objections%rowtype;
  v_pledge public.pledges%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
  v_evidence_id uuid;
  v_from public.pledge_status;
  v_to public.pledge_status;
begin
  if not public.is_reviewer() then
    raise exception 'not_reviewer';
  end if;
  if p_decision is null or p_decision not in ('accepted', 'rejected') then
    raise exception 'bad_decision';
  end if;
  if char_length(v_note) < 2 then
    raise exception 'note_required';
  end if;

  select * into v_obj from public.objections where id = p_objection_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  if v_obj.state <> 'open' then
    raise exception 'already_decided';
  end if;

  select * into v_pledge from public.pledges where id = v_obj.pledge_id for update;

  if p_decision = 'accepted' then
    if v_obj.evidence_url is not null then
      insert into public.evidence (pledge_id, kind, title, url, note, added_by)
        values (v_pledge.id, 'objection', '이의 제기 첨부', v_obj.evidence_url, v_note, 'objection')
        returning id into v_evidence_id;
    end if;
    if p_new_status is not null and p_new_status <> v_pledge.status then
      v_from := v_pledge.status;
      v_to := p_new_status;
      update public.pledges
        set status = p_new_status, status_decided_at = current_date, status_reason = v_note, updated_at = now()
        where id = v_pledge.id;
      v_pledge.status := p_new_status;
    end if;
  end if;

  update public.objections
    set state = p_decision, resolution_note = v_note, resolved_at = now()
    where id = v_obj.id;

  insert into public.pledge_events (pledge_id, kind, from_status, to_status, reason, evidence_id, objection_id)
    values (v_pledge.id, 'objection_resolved', v_from, v_to, v_note, v_evidence_id, v_obj.id);

  return jsonb_build_object('ok', true, 'status', v_pledge.status);
end;
$$;

revoke execute on function public.is_reviewer() from public;
grant execute on function public.is_reviewer() to anon, authenticated, service_role;

revoke execute on function public.review_candidate(uuid, text, public.pledge_status, text) from anon, public;
revoke execute on function public.resolve_objection(uuid, text, text, public.pledge_status) from anon, public;
grant execute on function public.review_candidate(uuid, text, public.pledge_status, text) to authenticated;
grant execute on function public.resolve_objection(uuid, text, text, public.pledge_status) to authenticated;
