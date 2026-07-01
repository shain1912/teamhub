-- 0015: 워크스페이스 초대 — 공유 링크(다인) / 이메일 1인용 초대 + 수락 함수
-- 관리자 또는 해당 워크스페이스 소유자(created_by)가 초대를 발급.
-- 수락은 accept_workspace_invite(SECURITY DEFINER)로 처리 → 일반 유저가
-- workspace_members에 직접 insert 못 하는 기존 정책(0011)을 함수로 안전하게 우회.

begin;

-- 1) 초대 테이블
create table if not exists public.workspace_invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  token        text not null unique,                 -- 링크/코드에 쓰는 랜덤 문자열
  email        text,                                 -- null=공유링크(누구나, max_uses까지) / 값=1인용(그 이메일만)
  role         text not null default 'member' check (role in ('member','guest')),
  created_by   uuid references public.profiles(id),
  max_uses     int,                                  -- null=무제한(공유링크) / 1=1인용
  used_count   int not null default 0,
  expires_at   timestamptz,
  revoked      boolean not null default false,
  created_at   timestamptz default now()
);
create index if not exists workspace_invites_token_idx     on public.workspace_invites(token);
create index if not exists workspace_invites_workspace_idx on public.workspace_invites(workspace_id);

alter table public.workspace_invites enable row level security;

-- 2) RLS — 관리자 또는 해당 워크스페이스 소유자만 관리(생성/조회/취소).
--    초대 대상(피초대자)은 이 테이블을 직접 볼 수 없고 accept 함수로만 수락한다.
drop policy if exists wsi_select on public.workspace_invites;
create policy wsi_select on public.workspace_invites for select to authenticated using (
  public.auth_is_admin()
  or exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
);
drop policy if exists wsi_insert on public.workspace_invites;
create policy wsi_insert on public.workspace_invites for insert to authenticated with check (
  created_by = auth.uid()
  and (
    public.auth_is_admin()
    or exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
  )
);
drop policy if exists wsi_update on public.workspace_invites;
create policy wsi_update on public.workspace_invites for update to authenticated
  using (
    public.auth_is_admin()
    or exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
  )
  with check (
    public.auth_is_admin()
    or exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
  );
drop policy if exists wsi_delete on public.workspace_invites;
create policy wsi_delete on public.workspace_invites for delete to authenticated using (
  public.auth_is_admin()
  or exists (select 1 from public.workspaces w where w.id = workspace_id and w.created_by = auth.uid())
);

-- 3) 프로필 권한 보호 트리거(0012)에 함수 전용 우회 GUC 추가.
--    accept_workspace_invite가 신규 유저의 global role을 반영할 때만 켠다.
--    (일반 유저의 자가 role 변경은 여전히 차단 — GUC는 SECURITY DEFINER 함수 안에서만 set)
create or replace function public.protect_profile_privileges() returns trigger
  language plpgsql security definer set search_path=public as $fn$
begin
  if auth.uid() is not null
     and not public.auth_is_admin()
     and current_setting('app.allow_invite_role', true) is distinct from 'on' then
    new.role       := old.role;
    new.client_id  := old.client_id;
    new.expires_at := old.expires_at;
  end if;
  return new;
end $fn$;

-- 4) 초대 수락 — SECURITY DEFINER. 유효성 검사 후 멤버십 추가.
create or replace function public.accept_workspace_invite(p_token text) returns uuid
  language plpgsql security definer set search_path=public as $fn$
declare
  inv      public.workspace_invites%rowtype;
  my_email text;
begin
  select * into inv from public.workspace_invites where token = p_token;
  if not found then
    raise exception '유효하지 않거나 만료된 초대입니다.';
  end if;

  select lower(email) into my_email from auth.users where id = auth.uid();

  if inv.revoked
     or (inv.expires_at is not null and inv.expires_at <= now())
     or (inv.max_uses is not null and inv.used_count >= inv.max_uses)
     or (inv.email is not null and lower(inv.email) <> coalesce(my_email, '')) then
    raise exception '유효하지 않거나 만료된 초대입니다.';
  end if;

  -- 멤버십 추가(멱등)
  insert into public.workspace_members (workspace_id, user_id, role)
  values (inv.workspace_id, auth.uid(), 'member')
  on conflict do nothing;

  -- global role: 첫 워크스페이스 참여이고 관리자가 아닐 때만 초대 role 반영(admin 강등 방지)
  if not exists (
        select 1 from public.workspace_members
        where user_id = auth.uid() and workspace_id <> inv.workspace_id
      )
     and coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin' then
    perform set_config('app.allow_invite_role', 'on', true);
    update public.profiles set role = inv.role where id = auth.uid();
    perform set_config('app.allow_invite_role', 'off', true);
  end if;

  -- 사용 카운트 증가(1인용 이메일 초대는 즉시 소진 처리)
  update public.workspace_invites
     set used_count = used_count + 1,
         revoked    = case when email is not null then true else revoked end
   where id = inv.id;

  return inv.workspace_id;
end $fn$;

grant execute on function public.accept_workspace_invite(text) to authenticated;

commit;
