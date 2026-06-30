-- 0011: 워크스페이스(팀) — 최상위 격리 레이어
-- 새 팀을 새 워크스페이스로 분리. 추가형: 기존 데이터는 "기본 워크스페이스"로 백필,
-- 기존 내부 멤버 전원 자동 가입 → 라이브 앱 동작 불변. 게스트는 기존 client_id 경로 유지(영향 0).

begin;

-- 1) 테이블
create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.workspaces enable row level security;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'member',   -- owner | admin | member
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
alter table public.workspace_members enable row level security;
create index if not exists workspace_members_user_idx on public.workspace_members(user_id);

-- 2) 최상위 엔티티에 workspace_id (하위는 채널/프로젝트 통해 상속)
alter table public.channels      add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.projects      add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.announcements add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.tickets       add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;

-- 3) 내 워크스페이스 집합 (security definer = RLS 우회로 재귀 방지)
create or replace function public.auth_workspace_ids() returns setof uuid
  language sql stable security definer set search_path=public as $fn$
  select workspace_id from public.workspace_members where user_id = auth.uid();
$fn$;

-- 4) 백필: 기본 워크스페이스 + 멤버십 + 기존 데이터 귀속
do $bf$
declare ws uuid;
begin
  select id into ws from public.workspaces order by created_at asc limit 1;
  if ws is null then
    insert into public.workspaces (name) values ('기본 워크스페이스') returning id into ws;
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
    select ws, p.id, case when coalesce(p.role,'') = 'admin' then 'admin' else 'member' end
    from public.profiles p
    where coalesce(p.role,'') <> 'guest'
    on conflict do nothing;
  update public.channels      set workspace_id = ws where workspace_id is null;
  update public.projects      set workspace_id = ws where workspace_id is null;
  update public.announcements set workspace_id = ws where workspace_id is null;
  update public.tickets       set workspace_id = ws where workspace_id is null;
end $bf$;

-- 5) 신규 가입자 → 기본(가장 오래된) 워크스페이스 자동 가입 (현 단일팀 동작 유지)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare ws uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  select id into ws from public.workspaces order by created_at asc limit 1;
  if ws is not null then
    insert into public.workspace_members (workspace_id, user_id)
    values (ws, new.id) on conflict do nothing;
  end if;
  return new;
end; $$;

-- 6) RLS — workspaces / workspace_members
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces for select to authenticated using (
  id in (select public.auth_workspace_ids()) or created_by = auth.uid()
);
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert to authenticated with check (
  not public.auth_is_guest() and created_by = auth.uid()
);
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (created_by = auth.uid());

drop policy if exists wsm_select on public.workspace_members;
create policy wsm_select on public.workspace_members for select to authenticated using (
  user_id = auth.uid() or workspace_id in (select public.auth_workspace_ids())
);
drop policy if exists wsm_insert on public.workspace_members;
create policy wsm_insert on public.workspace_members for insert to authenticated with check (
  exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
);
drop policy if exists wsm_delete on public.workspace_members;
create policy wsm_delete on public.workspace_members for delete to authenticated using (
  user_id = auth.uid()
  or exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
);

-- 7) 워크스페이스 게이트 (restrictive = 기존 정책에 AND). 게스트는 client_id 경로라 우회.
do $g$
declare t text;
begin
  foreach t in array array['channels','projects','announcements','tickets'] loop
    execute format('drop policy if exists %1$s_workspace on public.%1$I', t);
    execute format($p$
      create policy %1$s_workspace on public.%1$I as restrictive for all to authenticated
        using (workspace_id is null or public.auth_is_guest() or workspace_id in (select public.auth_workspace_ids()))
        with check (workspace_id is null or public.auth_is_guest() or workspace_id in (select public.auth_workspace_ids()));
    $p$, t);
  end loop;
end $g$;

commit;
