-- 0013: 삭제 복구(휴지통)
-- 모든 삭제 행을 트리거로 deleted_records 에 자동 보관 → 관리자가 복원.
-- UI/MCP/연쇄삭제(cascade) 어떤 경로로 지워져도 트리거가 잡으므로 "다 날려도 복구" 가능.

begin;

-- 1) 아카이브 테이블
create table if not exists public.deleted_records (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid not null,
  data        jsonb not null,
  deleted_by  uuid references public.profiles(id) on delete set null,
  deleted_at  timestamptz not null default now()
);
create index if not exists deleted_records_at_idx on public.deleted_records (deleted_at desc);
alter table public.deleted_records enable row level security;

-- 관리자만 열람 (insert/restore 는 definer 함수가 처리)
drop policy if exists deleted_records_select on public.deleted_records;
create policy deleted_records_select on public.deleted_records for select to authenticated
  using (public.auth_is_admin());

-- 2) 삭제행 아카이브 트리거 함수 (security definer = RLS 우회로 보관)
create or replace function public.archive_deleted_row() returns trigger
  language plpgsql security definer set search_path=public as $fn$
begin
  insert into public.deleted_records(table_name, record_id, data, deleted_by)
  values (tg_table_name, (old).id, to_jsonb(old), auth.uid());
  return old;
end $fn$;

-- 3) id 가 있는 주요 데이터 테이블에 AFTER DELETE 트리거 부착
do $t$
declare tbl text;
begin
  foreach tbl in array array[
    'workspaces','channels','messages','files','announcements',
    'tickets','ticket_comments','projects','gantt_tasks','sprints',
    'checklists','checklist_items','reactions'
  ] loop
    execute format('drop trigger if exists trg_archive_del on public.%I', tbl);
    execute format(
      'create trigger trg_archive_del after delete on public.%I for each row execute function public.archive_deleted_row()',
      tbl
    );
  end loop;
end $t$;

-- 4) 복원 함수 (관리자 전용). jsonb → 원본 테이블로 재삽입 후 아카이브에서 제거.
create or replace function public.restore_deleted_record(rec_id uuid) returns jsonb
  language plpgsql security definer set search_path=public as $fn$
declare r public.deleted_records;
begin
  if not public.auth_is_admin() then
    raise exception '관리자만 복구할 수 있습니다';
  end if;
  select * into r from public.deleted_records where id = rec_id;
  if not found then
    raise exception '복구 대상을 찾을 수 없습니다';
  end if;
  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
    r.table_name, r.table_name
  ) using r.data;
  delete from public.deleted_records where id = rec_id;
  return r.data;
end $fn$;
grant execute on function public.restore_deleted_record(uuid) to authenticated;

-- 5) 오래된 아카이브 정리(선택, 관리자). 기본 90일.
create or replace function public.purge_deleted_records(older_than_days int default 90) returns int
  language plpgsql security definer set search_path=public as $fn$
declare n int;
begin
  if not public.auth_is_admin() then
    raise exception '관리자만 실행할 수 있습니다';
  end if;
  delete from public.deleted_records
   where deleted_at < now() - make_interval(days => older_than_days);
  get diagnostics n = row_count;
  return n;
end $fn$;
grant execute on function public.purge_deleted_records(int) to authenticated;

commit;
