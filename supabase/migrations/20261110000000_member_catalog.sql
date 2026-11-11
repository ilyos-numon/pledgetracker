-- 당선자 목록(회원 전용 읽기)과 검색 함수. 쓰기는 service_role 만 한다.

create table public.official_catalog (
  id text primary key check (id ~ '^[a-z0-9-]{3,60}$'),
  person_name text not null,
  region_name text not null,
  office text not null check (office in ('시장', '도지사', '군수', '구청장')),
  level text not null check (level in ('metro', 'local')),
  term_start date not null,
  term_end date not null,
  check (term_start <= term_end),
  source_url text not null check (source_url ~ '^https?://'),
  is_sample boolean not null default false,
  updated_at timestamptz not null default now()
);

create index official_catalog_region_idx on public.official_catalog (region_name);

alter table public.official_catalog enable row level security;

revoke all on public.official_catalog from anon, public;
revoke insert, update, delete, truncate on public.official_catalog from authenticated;
grant select on public.official_catalog to authenticated;
grant all on public.official_catalog to service_role;

create policy member_read on public.official_catalog for select to authenticated using (true);

-- 검색 RPC -------------------------------------------------------------------

create or replace function public.search_catalog(p_query text)
returns table (
  id text,
  person_name text,
  region_name text,
  office text,
  level text,
  term_start date,
  term_end date,
  source_url text,
  is_sample boolean,
  tracked boolean,
  pledge_count int
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_q text := regexp_replace(btrim(coalesce(p_query, '')), '\s+', ' ', 'g');
begin
  if char_length(v_q) = 0 then
    raise exception 'query_required';
  end if;
  if char_length(v_q) > 40 then
    raise exception 'query_too_long';
  end if;

  return query
    select
      c.id,
      c.person_name,
      c.region_name,
      c.office,
      c.level,
      c.term_start,
      c.term_end,
      c.source_url,
      c.is_sample,
      pc.n > 0,
      pc.n
    from public.official_catalog c
    cross join lateral (
      select count(*)::int as n from public.pledges p where p.official_id = c.id
    ) pc
    where not exists (
      select 1
      from unnest(string_to_array(v_q, ' ')) as t(tok)
      where strpos(lower(c.person_name || ' ' || c.region_name || ' ' || c.office), lower(t.tok)) = 0
    )
    order by (c.level = 'metro') desc, c.region_name, c.office, c.id
    limit 50;
end;
$$;

revoke execute on function public.search_catalog(text) from anon, public;
grant execute on function public.search_catalog(text) to authenticated, service_role;
