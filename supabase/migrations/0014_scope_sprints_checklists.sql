-- 0014: 스프린트·체크리스트를 워크스페이스로 스코프 (티켓과 동일 패턴)
-- 프로젝트가 있으면 그 워크스페이스를 따르고, 없으면 기본 워크스페이스로 백필.

begin;

alter table public.sprints    add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.checklists add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

do $bf$
declare ws uuid;
begin
  select id into ws from public.workspaces order by created_at asc limit 1;
  update public.sprints s
     set workspace_id = coalesce((select p.workspace_id from public.projects p where p.id = s.project_id), ws)
   where s.workspace_id is null;
  update public.checklists c
     set workspace_id = coalesce((select p.workspace_id from public.projects p where p.id = c.project_id), ws)
   where c.workspace_id is null;
end $bf$;

do $g$
declare t text;
begin
  foreach t in array array['sprints','checklists'] loop
    execute format('drop policy if exists %1$s_workspace on public.%1$I', t);
    execute format($p$
      create policy %1$s_workspace on public.%1$I as restrictive for all to authenticated
        using (workspace_id is null or public.auth_is_guest() or workspace_id in (select public.auth_workspace_ids()))
        with check (workspace_id is null or public.auth_is_guest() or workspace_id in (select public.auth_workspace_ids()));
    $p$, t);
  end loop;
end $g$;

commit;
