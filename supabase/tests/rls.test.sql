-- RLS 정책과 검수 RPC 를 역할별로 확인한다. 트랜잭션 안에서 실행하고 되돌린다.
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- 픽스처 (postgres 권한) ----------------------------------------------------
insert into auth.users (id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'reviewer@example.org'),
  ('00000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'visitor@example.org');
insert into public.reviewers (user_id) values ('00000000-0000-4000-8000-000000000001');

insert into public.officials (id, region_name, office, person_name, term_start, term_end, election_date, source_url, source_kind, is_sample)
values ('pgtap-oo-si', 'OO시', '시장', '가상 당선자', '2026-07-01', '2030-06-30', '2026-06-03', 'https://example.org/p.pdf', 'sample', true);

insert into public.pledges (id, official_id, seq, title, summary, category, keywords, source_url, status)
values
  ('pgtap-oo-si-p001', 'pgtap-oo-si', 1, '공약 하나', '요약', '교통', '{주차장}', 'https://example.org/p.pdf', 'not_started'),
  ('pgtap-oo-si-p002', 'pgtap-oo-si', 2, '공약 둘', '요약', '교육', '{학교}', 'https://example.org/p.pdf', 'fulfilled');

insert into public.evidence (pledge_id, kind, title, url, added_by)
values ('pgtap-oo-si-p002', 'press_release', '보도자료', 'https://example.org/e', 'seed');
insert into public.pledge_events (pledge_id, kind, to_status, reason)
values ('pgtap-oo-si-p001', 'seed', 'not_started', '근거 없음');

insert into public.evidence_candidates (id, pledge_id, title, url, source)
values
  ('00000000-0000-4000-8000-0000000000c1', 'pgtap-oo-si-p001', '예산 반영 보도', 'https://example.org/c1', 'press-rss'),
  ('00000000-0000-4000-8000-0000000000c2', 'pgtap-oo-si-p001', '다른 기사', 'https://example.org/c2', 'news-rss'),
  ('00000000-0000-4000-8000-0000000000c3', 'pgtap-oo-si-p002', '완료 기사', 'https://example.org/c3', 'council-rss');

insert into public.objections (id, pledge_id, body, evidence_url)
values
  ('00000000-0000-4000-8000-0000000000a1', 'pgtap-oo-si-p001', '회의록에 철회 기록이 있습니다', 'https://example.org/minutes'),
  ('00000000-0000-4000-8000-0000000000a2', 'pgtap-oo-si-p002', '다른 의견을 적어 둡니다', null);

-- 구조 ----------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
      and c.relname in ('officials', 'pledges', 'evidence', 'evidence_candidates', 'objections', 'pledge_events', 'reviewers')),
  7, '7개 테이블 모두 RLS 활성');

-- anon ------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is((select count(*)::int from public.officials where id = 'pgtap-oo-si'), 1, 'anon officials 읽기');
select is((select count(*)::int from public.pledges where official_id = 'pgtap-oo-si'), 2, 'anon pledges 읽기');
select is((select count(*)::int from public.evidence where pledge_id like 'pgtap-%'), 1, 'anon evidence 읽기');
select is((select count(*)::int from public.pledge_events where pledge_id like 'pgtap-%'), 1, 'anon pledge_events 읽기');
select is((select count(*)::int from public.evidence_candidates), 0, 'anon evidence_candidates 안 보임');
select is((select count(*)::int from public.objections), 0, 'anon objections 안 보임');
select is((select count(*)::int from public.reviewers), 0, 'anon reviewers 안 보임');

with u as (update public.pledges set status = 'fulfilled' where id = 'pgtap-oo-si-p001' returning 1)
select is((select count(*)::int from u), 0, 'anon pledges update 0행');
with d as (delete from public.evidence where pledge_id like 'pgtap-%' returning 1)
select is((select count(*)::int from d), 0, 'anon evidence delete 0행');

select throws_ok(
  $$insert into public.officials (id, region_name, office, person_name, term_start, term_end, election_date, source_url, source_kind)
    values ('anon-x', 'X', '시장', 'X', '2026-07-01', '2030-06-30', '2026-06-03', 'https://example.org', 'sample')$$,
  '42501', null, 'anon officials insert 거부');
select throws_ok(
  $$insert into public.evidence_candidates (pledge_id, title, url, source) values ('pgtap-oo-si-p001', 't', 'https://example.org/x', 'news')$$,
  '42501', null, 'anon evidence_candidates insert 거부');
select throws_ok(
  $$insert into public.pledge_events (pledge_id, kind) values ('pgtap-oo-si-p001', 'status_change')$$,
  '42501', null, 'anon pledge_events insert 거부');

select lives_ok(
  $$insert into public.objections (pledge_id, body) values ('pgtap-oo-si-p001', '열 글자가 넘는 이의 제기 본문')$$,
  'anon objections open insert 성공');
select throws_ok(
  $$insert into public.objections (pledge_id, body, state) values ('pgtap-oo-si-p001', '열 글자가 넘는 이의 제기 본문', 'accepted')$$,
  '42501', null, 'anon objections accepted insert 거부');
select throws_ok(
  $$select public.review_candidate('00000000-0000-4000-8000-0000000000c1', 'reject')$$,
  '42501', null, 'anon review_candidate 실행 권한 없음');

-- 로그인했지만 검수자가 아닌 사용자 ------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(public.is_reviewer(), false, '비검수자 is_reviewer false');
select is((select count(*)::int from public.evidence_candidates), 0, '비검수자 evidence_candidates 안 보임');
select throws_ok(
  $$select public.review_candidate('00000000-0000-4000-8000-0000000000c1', 'reject')$$,
  'P0001', 'not_reviewer', '비검수자 review_candidate → not_reviewer');
select throws_ok(
  $$select public.resolve_objection('00000000-0000-4000-8000-0000000000a1', 'rejected', '확인함')$$,
  'P0001', 'not_reviewer', '비검수자 resolve_objection → not_reviewer');

-- 검수자 --------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(public.is_reviewer(), true, '검수자 is_reviewer true');
select is((select count(*)::int from public.evidence_candidates where pledge_id like 'pgtap-%'), 3, '검수자 후보 읽기');
select is((select count(*)::int from public.objections where pledge_id like 'pgtap-%'), 3, '검수자 이의 제기 읽기');

select throws_ok(
  $$select public.review_candidate('00000000-0000-4000-8000-0000000000c1', 'adopt', 'in_progress', '  ')$$,
  'P0001', 'reason_required', 'review_candidate 이유 없음 → reason_required');
select throws_ok(
  $$select public.review_candidate('00000000-0000-4000-8000-0000000000c1', 'adopt', 'fulfilled', '바로 완료')$$,
  'P0001', 'invalid_transition', 'review_candidate 미착수→이행 → invalid_transition');
select throws_ok(
  $$select public.review_candidate('00000000-0000-4000-8000-0000000000c1', 'maybe')$$,
  'P0001', 'bad_decision', 'review_candidate 잘못된 결정 → bad_decision');
select throws_ok(
  $$select public.review_candidate('00000000-0000-4000-8000-0000000000ff', 'reject')$$,
  'P0001', 'not_found', 'review_candidate 없는 후보 → not_found');

select is(
  public.review_candidate('00000000-0000-4000-8000-0000000000c1', 'adopt', 'in_progress', '예산 반영') ->> 'status',
  'in_progress', 'review_candidate 채택 + 상태 변경 성공');
select throws_ok(
  $$select public.review_candidate('00000000-0000-4000-8000-0000000000c1', 'reject')$$,
  'P0001', 'already_decided', 'review_candidate 재처리 → already_decided');

select is(
  (select count(*)::int from public.evidence where pledge_id = 'pgtap-oo-si-p001' and added_by = 'reviewer' and kind = 'press_release'),
  1, '채택 시 근거 1건 추가 (press → press_release)');
select is(
  (select count(*)::int from public.pledge_events
    where pledge_id = 'pgtap-oo-si-p001' and kind = 'status_change'
      and from_status = 'not_started' and to_status = 'in_progress' and reason = '예산 반영'),
  1, '채택 시 status_change 이력 1건');

select is(
  public.review_candidate('00000000-0000-4000-8000-0000000000c2', 'reject') ->> 'ok',
  'true', 'review_candidate 기각 성공');
select is(
  (select state from public.evidence_candidates where id = '00000000-0000-4000-8000-0000000000c2'),
  'rejected', '기각된 후보 state = rejected');

select throws_ok(
  $$select public.resolve_objection('00000000-0000-4000-8000-0000000000a1', 'accepted', ' ')$$,
  'P0001', 'note_required', 'resolve_objection 메모 없음 → note_required');
select throws_ok(
  $$select public.resolve_objection('00000000-0000-4000-8000-0000000000a1', 'maybe', '확인함')$$,
  'P0001', 'bad_decision', 'resolve_objection 잘못된 결정 → bad_decision');
select throws_ok(
  $$select public.resolve_objection('00000000-0000-4000-8000-0000000000ff', 'rejected', '확인함')$$,
  'P0001', 'not_found', 'resolve_objection 없는 이의 제기 → not_found');

select is(
  public.resolve_objection('00000000-0000-4000-8000-0000000000a1', 'accepted', '회의록 확인', 'abandoned') ->> 'status',
  'abandoned', 'resolve_objection 수용 + 상태 정정 성공');
select is(
  (select count(*)::int from public.evidence where pledge_id = 'pgtap-oo-si-p001' and added_by = 'objection'),
  1, '수용 시 첨부 URL 이 근거로 추가');
select is(
  (select count(*)::int from public.pledge_events
    where pledge_id = 'pgtap-oo-si-p001' and kind = 'objection_resolved'
      and from_status = 'in_progress' and to_status = 'abandoned' and reason = '회의록 확인'),
  1, '수용 시 objection_resolved 이력에 전후 상태 기록');
select throws_ok(
  $$select public.resolve_objection('00000000-0000-4000-8000-0000000000a1', 'rejected', '다시 처리')$$,
  'P0001', 'already_decided', 'resolve_objection 재처리 → already_decided');

reset role;
select * from finish();
rollback;
