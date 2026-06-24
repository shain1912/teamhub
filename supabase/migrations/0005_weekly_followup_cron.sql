-- 주간 체크리스트 자동 팔로업 (pg_cron)
-- 매주 금요일 09:00 UTC(= KST 18:00) 미완료 체크리스트를 공지로 자동 게시.

create extension if not exists pg_cron;

create or replace function public.post_weekly_followup()
returns void language plpgsql security definer set search_path = public as $$
declare
  cnt int;
  lines text;
  msg text;
begin
  select count(*) into cnt from public.checklist_items where is_done = false;
  if cnt = 0 then
    msg := '모든 체크리스트 항목이 완료되었습니다. 👏';
  else
    select string_agg(line, E'\n') into lines from (
      select '• ' || c.title || ' — ' || ci.content
             || coalesce(' (담당: ' || p.full_name || ')', '') as line
      from public.checklist_items ci
      join public.checklists c on c.id = ci.checklist_id
      left join public.profiles p on p.id = ci.assignee_id
      where ci.is_done = false
      order by c.title
      limit 50
    ) s;
    msg := '이번 주 미완료 체크리스트 ' || cnt || '건:' || E'\n' || coalesce(lines, '');
  end if;
  insert into public.announcements(title, body, priority, pinned, expires_at)
  values ('🗓️ 주간 체크리스트 팔로업', msg, 'normal', true, now() + interval '7 days');
end; $$;

-- 매주 금요일 09:00 UTC (= KST 18:00). 동일 이름이면 갱신.
select cron.schedule('weekly-checklist-followup', '0 9 * * 5', $job$select public.post_weekly_followup();$job$);
