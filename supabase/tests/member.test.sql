-- 당선자 목록 권한과 search_catalog 검색 규칙을 확인한다. 트랜잭션 안에서 실행하고 되돌린다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(20);

-- 픽스처 (postgres 권한) ----------------------------------------------------
insert into auth.users (id, aud, role, email)
values ('00000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'member@example.org');

insert into public.officials (id, region_name, office, person_name, term_start, term_end, election_date, source_url, source_kind, is_sample)
values ('pgtap-tracked', 'OO시', '시장', '가상 당선자', '2026-07-01', '2030-06-30', '2026-06-03', 'https://example.org/p.pdf', 'sample', true);

insert into public.pledges (id, official_id, seq, title, summary, category, keywords, source_url, status)
values ('pgtap-tracked-p001', 'pgtap-tracked', 1, '공약 하나', '요약', '교통', '{주차장}', 'https://example.org/p.pdf', 'not_started');

insert into public.evidence_candidates (id, pledge_id, title, url, source)
values ('00000000-0000-4000-8000-0000000000d1', 'pgtap-tracked-p001', '예산 반영 보도', 'https://example.org/d1', 'press-rss');

insert into public.official_catalog (id, person_name, region_name, office, level, term_start, term_end, source_url, is_sample)
values
  ('pgtap-tracked', '가상 당선자', 'OO시', '시장', 'local', '2026-07-01', '2030-06-30', 'https://example.org/catalog/pgtap-tracked', true),
  ('pgtap-free', '가상 군수', 'OO군', '군수', 'local', '2026-07-01', '2030-06-30', 'https://example.org/catalog/pgtap-free', true),
  ('pgtap-metro', '가상 도지사', 'OO도', '도지사', 'metro', '2026-07-01', '2030-06-30', 'https://example.org/catalog/pgtap-metro', true);

-- 구조 ----------------------------------------------------------------------
select has_table('public', 'official_catalog', 'official_catalog 테이블 존재');
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'official_catalog'),
  'official_catalog RLS 활성');
select policies_are('public', 'official_catalog', array['public_read'], 'official_catalog 정책 public_read 만');

-- anon ------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.official_catalog where id like 'pgtap-%'),
  3, 'anon official_catalog 읽기');
select results_eq(
  $$select id from public.search_catalog('가상') where id like 'pgtap-%'$$,
  $$values ('pgtap-metro'::text), ('pgtap-free'::text), ('pgtap-tracked'::text)$$,
  'anon search_catalog 검색');
select throws_ok(
  $$insert into public.official_catalog (id, person_name, region_name, office, level, term_start, term_end, source_url)
    values ('anon-x', 'X', 'X시', '시장', 'local', '2026-07-01', '2030-06-30', 'https://example.org')$$,
  '42501', null, 'anon official_catalog insert 거부');
select throws_ok(
  $$update public.official_catalog set person_name = 'x' where id = 'pgtap-free'$$,
  '42501', null, 'anon official_catalog update 거부');
select throws_ok(
  $$delete from public.official_catalog where id = 'pgtap-free'$$,
  '42501', null, 'anon official_catalog delete 거부');

-- 회원 (reviewers 에 없는 authenticated) --------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';

select throws_ok(
  $$insert into public.official_catalog (id, person_name, region_name, office, level, term_start, term_end, source_url)
    values ('member-x', 'X', 'X시', '시장', 'local', '2026-07-01', '2030-06-30', 'https://example.org')$$,
  '42501', null, '회원 official_catalog insert 거부');

select is(
  (select count(*)::int from public.official_catalog where id like 'pgtap-%'),
  3, '회원 official_catalog 읽기');

select is(
  (select tracked from public.search_catalog('OO시') where id = 'pgtap-tracked'),
  true, '추적 중 행 tracked true');
select is(
  (select pledge_count from public.search_catalog('OO시') where id = 'pgtap-tracked'),
  1, '추적 중 행 pledge_count 1');
select is(
  (select tracked from public.search_catalog('군수') where id = 'pgtap-free'),
  false, '미추적 행 tracked false');
select is(
  (select pledge_count from public.search_catalog('군수') where id = 'pgtap-free'),
  0, '미추적 행 pledge_count 0');

select results_eq(
  $$select id from public.search_catalog('  가상   OO군 ') where id like 'pgtap-%'$$,
  $$values ('pgtap-free'::text)$$,
  '두 토큰 AND 와 공백 정리');

select results_eq(
  $$select id from public.search_catalog('가상') where id like 'pgtap-%'$$,
  $$values ('pgtap-metro'::text), ('pgtap-free'::text), ('pgtap-tracked'::text)$$,
  'metro 가 먼저, 이어 region_name 순');

select throws_ok(
  $$select * from public.search_catalog('   ')$$,
  'P0001', 'query_required', '빈 검색어 query_required');
select throws_ok(
  $$select * from public.search_catalog(repeat('가', 41))$$,
  'P0001', 'query_too_long', '41자 query_too_long');

select is(
  (select count(*)::int from public.evidence_candidates),
  0, '회원 evidence_candidates 0행');
select throws_ok(
  $$select public.review_candidate('00000000-0000-4000-8000-0000000000d1', 'reject')$$,
  'P0001', 'not_reviewer', '회원 review_candidate not_reviewer');

reset role;
select * from finish();
rollback;
