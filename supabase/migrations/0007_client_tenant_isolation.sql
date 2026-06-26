begin;

-- 1) 클라이언트(테넌트) 테이블 + client_id 키 (정책보다 컬럼/함수 먼저)
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.clients enable row level security;

alter table public.projects add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.channels add column if not exists client_id uuid references public.clients(id) on delete set null;
alter table public.profiles add column if not exists client_id uuid references public.clients(id) on delete set null;

-- 2) 현재 사용자의 client_id (security definer = RLS 우회). 컬럼 추가 후 정의.
create or replace function public.auth_client_id() returns uuid
  language sql stable security definer set search_path=public as $fn$
  select client_id from public.profiles where id = auth.uid();
$fn$;

-- clients 정책 (함수 정의 후)
drop policy if exists clients_read on public.clients;
drop policy if exists clients_write on public.clients;
create policy clients_read on public.clients for select using (
  (not public.auth_is_guest()) or (public.auth_active() and id = public.auth_client_id())
);
create policy clients_write on public.clients for all
  using (not public.auth_is_guest()) with check (not public.auth_is_guest());

-- 3) 클라 단위로 게스트 가시성 재작성 — 내부 동작 불변, 게스트는 client_id 일치만

-- 채널: 게스트는 자기 클라 채널 (멤버십 무관)
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select using (
  (not public.auth_is_guest() and ((not is_private) or created_by = auth.uid() or public.is_channel_member(id)))
  or (public.auth_active() and client_id is not null and client_id = public.auth_client_id())
);

-- 메시지
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  exists (select 1 from public.channels c where c.id = messages.channel_id and (
    (not public.auth_is_guest() and ((not c.is_private) or c.created_by = auth.uid() or public.is_channel_member(c.id)))
    or (public.auth_active() and c.client_id is not null and c.client_id = public.auth_client_id())
  ))
);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  user_id = auth.uid() and exists (select 1 from public.channels c where c.id = messages.channel_id and (
    (not public.auth_is_guest() and ((not c.is_private) or c.created_by = auth.uid() or public.is_channel_member(c.id)))
    or (public.auth_active() and c.client_id is not null and c.client_id = public.auth_client_id())
  ))
);

-- 파일
drop policy if exists files_select on public.files;
create policy files_select on public.files for select using (
  (files.channel_id is null and not public.auth_is_guest())
  or exists (select 1 from public.channels c where c.id = files.channel_id and (
    (not public.auth_is_guest() and ((not c.is_private) or c.created_by = auth.uid() or public.is_channel_member(c.id)))
    or (public.auth_active() and c.client_id is not null and c.client_id = public.auth_client_id())
  ))
);
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert with check (
  uploader_id = auth.uid() and (
    (not public.auth_is_guest())
    or (channel_id is not null and public.auth_active() and exists (
      select 1 from public.channels c where c.id = files.channel_id and c.client_id = public.auth_client_id()))
  )
);

-- 티켓: 게스트는 자기 클라 채널의 티켓만 (발행/조회/본인것 수정)
drop policy if exists tickets_select on public.tickets;
drop policy if exists tickets_insert on public.tickets;
drop policy if exists tickets_update on public.tickets;
drop policy if exists tickets_delete on public.tickets;
create policy tickets_select on public.tickets for select using (
  (not public.auth_is_guest())
  or (channel_id is not null and public.auth_active() and exists (
    select 1 from public.channels c where c.id = tickets.channel_id and c.client_id = public.auth_client_id()))
);
create policy tickets_insert on public.tickets for insert with check (
  (not public.auth_is_guest())
  or (channel_id is not null and public.auth_active() and reporter_id = auth.uid() and exists (
    select 1 from public.channels c where c.id = tickets.channel_id and c.client_id = public.auth_client_id()))
);
create policy tickets_update on public.tickets for update using (
  (not public.auth_is_guest())
  or (public.auth_active() and reporter_id = auth.uid() and channel_id is not null and exists (
    select 1 from public.channels c where c.id = tickets.channel_id and c.client_id = public.auth_client_id()))
) with check (
  (not public.auth_is_guest())
  or (public.auth_active() and reporter_id = auth.uid() and channel_id is not null and exists (
    select 1 from public.channels c where c.id = tickets.channel_id and c.client_id = public.auth_client_id()))
);
create policy tickets_delete on public.tickets for delete using (not public.auth_is_guest());

-- 4) projects / sprints / gantt / checklists: 정책 전부 제거 후 표준 재생성
--    (게스트 차단 restrictive(guest_block) 포함 모두 드롭 → 내부 full + 게스트 클라 read-only)
do $reset$
declare r record; t text;
begin
  foreach t in array array['projects','sprints','gantt_tasks','gantt_dependencies','checklists','checklist_items'] loop
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
  end loop;
end $reset$;

-- 프로젝트
create policy projects_select on public.projects for select using (
  (not public.auth_is_guest()) or (public.auth_active() and client_id is not null and client_id = public.auth_client_id())
);
create policy projects_write on public.projects for all
  using (not public.auth_is_guest()) with check (not public.auth_is_guest());

-- 스프린트 (project_id 경유)
create policy sprints_select on public.sprints for select using (
  (not public.auth_is_guest()) or (public.auth_active() and exists (
    select 1 from public.projects p where p.id = sprints.project_id and p.client_id = public.auth_client_id()))
);
create policy sprints_write on public.sprints for all
  using (not public.auth_is_guest()) with check (not public.auth_is_guest());

-- 간트 작업 (project_id 경유)
create policy gantt_tasks_select on public.gantt_tasks for select using (
  (not public.auth_is_guest()) or (public.auth_active() and exists (
    select 1 from public.projects p where p.id = gantt_tasks.project_id and p.client_id = public.auth_client_id()))
);
create policy gantt_tasks_write on public.gantt_tasks for all
  using (not public.auth_is_guest()) with check (not public.auth_is_guest());

-- 간트 의존 (task_id → gantt_tasks → project)
create policy gantt_dependencies_select on public.gantt_dependencies for select using (
  (not public.auth_is_guest()) or (public.auth_active() and exists (
    select 1 from public.gantt_tasks gt join public.projects p on p.id = gt.project_id
    where gt.id = gantt_dependencies.task_id and p.client_id = public.auth_client_id()))
);
create policy gantt_dependencies_write on public.gantt_dependencies for all
  using (not public.auth_is_guest()) with check (not public.auth_is_guest());

-- 체크리스트 (project_id 경유; 프로젝트 미연결 체크리스트는 게스트 비노출)
create policy checklists_select on public.checklists for select using (
  (not public.auth_is_guest()) or (public.auth_active() and project_id is not null and exists (
    select 1 from public.projects p where p.id = checklists.project_id and p.client_id = public.auth_client_id()))
);
create policy checklists_write on public.checklists for all
  using (not public.auth_is_guest()) with check (not public.auth_is_guest());

-- 체크리스트 항목 (checklist → project)
create policy checklist_items_select on public.checklist_items for select using (
  (not public.auth_is_guest()) or (public.auth_active() and exists (
    select 1 from public.checklists cl join public.projects p on p.id = cl.project_id
    where cl.id = checklist_items.checklist_id and p.client_id = public.auth_client_id()))
);
create policy checklist_items_write on public.checklist_items for all
  using (not public.auth_is_guest()) with check (not public.auth_is_guest());

-- 5) profiles: 게스트는 본인 + 내부 스태프 + 같은 클라 게스트만 (타 클라 게스트 차단)
drop policy if exists profiles_guest_scope on public.profiles;
create policy profiles_guest_scope on public.profiles as restrictive for select using (
  (not public.auth_is_guest())
  or id = auth.uid()
  or coalesce(role,'') <> 'guest'
  or client_id = public.auth_client_id()
);

commit;
