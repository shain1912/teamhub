begin;

-- 1) 게스트 만료 컬럼
alter table public.profiles add column if not exists expires_at timestamptz;

-- 2) 헬퍼 (security definer = RLS 우회, 재귀 없음)
create or replace function public.auth_is_guest() returns boolean
  language sql stable security definer set search_path=public as $fn$
  select coalesce((select role = 'guest' from public.profiles where id = auth.uid()), false);
$fn$;

create or replace function public.auth_active() returns boolean
  language sql stable security definer set search_path=public as $fn$
  select coalesce((select (expires_at is null or expires_at > now()) from public.profiles where id = auth.uid()), false);
$fn$;

create or replace function public.shares_channel_with(other uuid) returns boolean
  language sql stable security definer set search_path=public as $fn$
  select exists(
    select 1 from public.channel_members m1
    join public.channel_members m2 on m1.channel_id = m2.channel_id
    where m1.user_id = auth.uid() and m2.user_id = other
  );
$fn$;

-- 3) 티켓: 게스트는 자기 채널 한정 (발행+조회+본인것 수정, 삭제는 내부만)
drop policy if exists tickets_read on public.tickets;
drop policy if exists tickets_write on public.tickets;
create policy tickets_select on public.tickets for select using (
  (not public.auth_is_guest())
  or (channel_id is not null and public.auth_active() and public.is_channel_member(channel_id))
);
create policy tickets_insert on public.tickets for insert with check (
  (not public.auth_is_guest())
  or (channel_id is not null and public.auth_active() and public.is_channel_member(channel_id) and reporter_id = auth.uid())
);
create policy tickets_update on public.tickets for update using (
  (not public.auth_is_guest())
  or (public.auth_active() and reporter_id = auth.uid() and channel_id is not null and public.is_channel_member(channel_id))
) with check (
  (not public.auth_is_guest())
  or (public.auth_active() and reporter_id = auth.uid() and channel_id is not null and public.is_channel_member(channel_id))
);
create policy tickets_delete on public.tickets for delete using (not public.auth_is_guest());

-- 4) 채널: 게스트는 멤버 채널만 (public 채널 노출 차단)
drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select using (
  (not public.auth_is_guest() and ((not is_private) or created_by = auth.uid()))
  or (public.auth_active() and public.is_channel_member(id))
);
drop policy if exists channels_insert on public.channels;
create policy channels_insert on public.channels for insert with check (not public.auth_is_guest());

-- 5) 메시지: 채널 가시성에 게스트 인지 적용
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select using (
  exists (select 1 from public.channels c where c.id = messages.channel_id and (
    (not public.auth_is_guest() and ((not c.is_private) or c.created_by = auth.uid()))
    or (public.auth_active() and public.is_channel_member(c.id))
  ))
);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  user_id = auth.uid() and exists (select 1 from public.channels c where c.id = messages.channel_id and (
    (not public.auth_is_guest() and ((not c.is_private) or c.created_by = auth.uid()))
    or (public.auth_active() and public.is_channel_member(c.id))
  ))
);

-- 6) 파일: 채널 가시성에 게스트 인지 + 채널없는 파일은 내부만
drop policy if exists files_select on public.files;
create policy files_select on public.files for select using (
  (files.channel_id is null and not public.auth_is_guest())
  or exists (select 1 from public.channels c where c.id = files.channel_id and (
    (not public.auth_is_guest() and ((not c.is_private) or c.created_by = auth.uid()))
    or (public.auth_active() and public.is_channel_member(c.id))
  ))
);
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert with check (
  uploader_id = auth.uid() and (
    (not public.auth_is_guest())
    or (channel_id is not null and public.auth_active() and public.is_channel_member(channel_id))
  )
);

-- 7) 채널 멤버십: 게스트는 본인/공유채널만 읽기, 쓰기는 내부만
drop policy if exists channel_members_read on public.channel_members;
create policy channel_members_read on public.channel_members for select using (
  (not public.auth_is_guest()) or user_id = auth.uid() or public.is_channel_member(channel_id)
);
drop policy if exists channel_members_write on public.channel_members;
create policy channel_members_write on public.channel_members for all
  using (not public.auth_is_guest()) with check (not public.auth_is_guest());

-- 8) 게스트 전면 차단 테이블 (restrictive = 기존 정책과 AND, 기존 정책 보존)
do $blk$
declare t text;
begin
  foreach t in array array[
    'projects','sprints','gantt_tasks','gantt_dependencies','checklists','checklist_items',
    'announcements','announcement_reads','audit_log','channel_reads','reactions','notifications'
  ] loop
    execute format('drop policy if exists guest_block on public.%I', t);
    execute format('create policy guest_block on public.%I as restrictive for all using (not public.auth_is_guest()) with check (not public.auth_is_guest())', t);
  end loop;
end $blk$;

-- 9) profiles: 게스트는 본인 + 같은 채널 멤버만 조회 (restrictive)
drop policy if exists profiles_guest_scope on public.profiles;
create policy profiles_guest_scope on public.profiles as restrictive for select using (
  (not public.auth_is_guest()) or id = auth.uid() or public.shares_channel_with(profiles.id)
);

commit;
