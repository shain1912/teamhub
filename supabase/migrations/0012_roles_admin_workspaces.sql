-- 0012: 3-롤 정립(관리자/팀원/외부인) + 워크스페이스 생성 관리자 전용 + 자가 권한상승 차단
-- 롤: admin(관리자) | member(팀원) | guest(외부인)

begin;

-- 1) 관리자 지정: seongho.cho 만 admin, 나머지 비게스트는 member 보장
update public.profiles set role = 'admin'  where email = 'seongho.cho@kodekorea.kr';
update public.profiles set role = 'member'
  where coalesce(role,'') not in ('guest','admin')
    and email <> 'seongho.cho@kodekorea.kr';

-- 2) 관리자 판별 헬퍼
create or replace function public.auth_is_admin() returns boolean
  language sql stable security definer set search_path=public as $fn$
  select coalesce((select role from public.profiles where id = auth.uid()), '') = 'admin';
$fn$;

-- 3) 워크스페이스 생성은 관리자만
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert to authenticated with check (
  public.auth_is_admin() and created_by = auth.uid()
);

-- 4) 자가 권한상승 차단 — 일반 사용자는 자기 role/client_id/expires_at 변경 불가.
--    관리자이거나 서버(service_key, auth.uid()=null)면 허용.
create or replace function public.protect_profile_privileges() returns trigger
  language plpgsql security definer set search_path=public as $fn$
begin
  if auth.uid() is not null and not public.auth_is_admin() then
    new.role       := old.role;
    new.client_id  := old.client_id;
    new.expires_at := old.expires_at;
  end if;
  return new;
end $fn$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges before update on public.profiles
  for each row execute function public.protect_profile_privileges();

commit;
