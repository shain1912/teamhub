-- 0016: 초대 리뷰 후속 수정 (0015 증분)
-- M1+M2: 가입 시 기본 워크스페이스 자동 편입 제거 → 소속은 오직 초대 accept/관리자 수동 추가로만.
-- M3: accept 경쟁조건(for update 잠금) + 미로그인 가드.

begin;

-- M1+M2) handle_new_user: 프로필 생성만 유지, 워크스페이스 자동 편입 블록 제거.
-- (0011 정의에서 workspace_members auto-insert 만 들어냄. 나머지·트리거 바인딩은 불변.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

-- M3 + L1) accept_workspace_invite: for update 잠금 + 미로그인 가드. 나머지는 0015 그대로.
create or replace function public.accept_workspace_invite(p_token text) returns uuid
  language plpgsql security definer set search_path=public as $fn$
declare
  inv      public.workspace_invites%rowtype;
  my_email text;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select * into inv from public.workspace_invites where token = p_token for update;
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
