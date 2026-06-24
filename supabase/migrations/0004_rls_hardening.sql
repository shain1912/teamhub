-- RLS 강화 v2 — 소유자/멤버십 스코프
-- 비즈니스 공유 객체(tickets/projects/sprints/gantt/checklists/announcements/audit_log/
-- ticket_comments/channel_members)는 사내 협업 특성상 authenticated 전체 접근 유지.
-- 민감/개인 데이터만 스코프를 좁힌다.

create or replace function public.is_channel_member(cid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists(
    select 1 from public.channel_members m
    where m.channel_id = cid and m.user_id = auth.uid()
  );
$$;

-- profiles: 조회 전체(이름 표시), 수정은 본인만
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_write on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- channels: 공개 채널은 전원, 비공개는 멤버/생성자만
drop policy if exists channels_read on public.channels;
drop policy if exists channels_write on public.channels;
create policy channels_select on public.channels for select to authenticated
  using (not is_private or created_by = auth.uid() or public.is_channel_member(id));
create policy channels_insert on public.channels for insert to authenticated with check (true);
create policy channels_update on public.channels for update to authenticated using (created_by = auth.uid());
create policy channels_delete on public.channels for delete to authenticated using (created_by = auth.uid());

-- messages: 볼 수 있는 채널만, 작성자 본인 쓰기
drop policy if exists messages_read on public.messages;
drop policy if exists messages_write on public.messages;
create policy messages_select on public.messages for select to authenticated using (
  exists(select 1 from public.channels c where c.id = channel_id
    and (not c.is_private or c.created_by = auth.uid() or public.is_channel_member(c.id)))
);
create policy messages_insert on public.messages for insert to authenticated with check (
  user_id = auth.uid() and exists(select 1 from public.channels c where c.id = channel_id
    and (not c.is_private or c.created_by = auth.uid() or public.is_channel_member(c.id)))
);
create policy messages_update on public.messages for update to authenticated using (user_id = auth.uid());
create policy messages_delete on public.messages for delete to authenticated using (user_id = auth.uid());

-- files: 채널 가시성 + 업로더 본인 쓰기
drop policy if exists files_read on public.files;
drop policy if exists files_write on public.files;
create policy files_select on public.files for select to authenticated using (
  channel_id is null or exists(select 1 from public.channels c where c.id = channel_id
    and (not c.is_private or c.created_by = auth.uid() or public.is_channel_member(c.id)))
);
create policy files_insert on public.files for insert to authenticated with check (uploader_id = auth.uid());
create policy files_update on public.files for update to authenticated using (uploader_id = auth.uid());
create policy files_delete on public.files for delete to authenticated using (uploader_id = auth.uid());

-- notifications: 본인 것만 (인서트는 멘션/배정 위해 허용)
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_write on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated with check (true);
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- channel_reads / announcement_reads: 본인 것만
drop policy if exists channel_reads_read on public.channel_reads;
drop policy if exists channel_reads_write on public.channel_reads;
create policy channel_reads_all on public.channel_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists announcement_reads_read on public.announcement_reads;
drop policy if exists announcement_reads_write on public.announcement_reads;
create policy announcement_reads_all on public.announcement_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reactions: 조회 전체, 쓰기 본인
drop policy if exists reactions_read on public.reactions;
drop policy if exists reactions_write on public.reactions;
create policy reactions_select on public.reactions for select to authenticated using (true);
create policy reactions_insert on public.reactions for insert to authenticated with check (user_id = auth.uid());
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = auth.uid());
