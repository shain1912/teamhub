-- TeamHub: Storage 버킷 + 보안 하드닝 (0001 이후 적용분)

-- files 버킷 (비공개)
insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do nothing;

-- 인증 사용자에게 files 버킷 read/write 허용
do $$ begin
  create policy "files_authenticated_read" on storage.objects
    for select to authenticated using (bucket_id = 'files');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "files_authenticated_insert" on storage.objects
    for insert to authenticated with check (bucket_id = 'files');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "files_authenticated_update" on storage.objects
    for update to authenticated using (bucket_id = 'files');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "files_authenticated_delete" on storage.objects
    for delete to authenticated using (bucket_id = 'files');
exception when duplicate_object then null; end $$;

-- 함수 search_path 고정 (linter 0011)
alter function public.touch_updated_at() set search_path = '';
alter function public.handle_new_user() set search_path = public, pg_temp;

-- 가입 트리거 함수의 REST rpc 노출 제거 (linter 0028/0029)
revoke execute on function public.handle_new_user() from anon, authenticated;
