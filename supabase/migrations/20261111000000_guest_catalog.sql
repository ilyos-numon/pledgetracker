-- 당선자 목록을 비회원도 읽고 검색한다. 쓰기는 여전히 service_role 만.
grant select on public.official_catalog to anon;
drop policy member_read on public.official_catalog;
create policy public_read on public.official_catalog for select to anon, authenticated using (true);
grant execute on function public.search_catalog(text) to anon;
