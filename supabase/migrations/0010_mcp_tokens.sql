-- 0010: MCP 사용자별 개인 액세스 토큰(PAT)
-- 프론트가 토큰 생성→SHA-256 해시만 저장(원문 미저장), MCP 서버는 해시로 검증.
-- 게스트는 발급 불가. 본인 토큰만 조회/폐기.

create table if not exists public.mcp_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked      boolean not null default false
);
create index if not exists mcp_tokens_hash_idx on public.mcp_tokens (token_hash);

alter table public.mcp_tokens enable row level security;

drop policy if exists mcp_tokens_select on public.mcp_tokens;
create policy mcp_tokens_select on public.mcp_tokens for select to authenticated
  using (user_id = auth.uid());

drop policy if exists mcp_tokens_insert on public.mcp_tokens;
create policy mcp_tokens_insert on public.mcp_tokens for insert to authenticated
  with check (
    user_id = auth.uid()
    and coalesce((select role from public.profiles where id = auth.uid()), '') <> 'guest'
  );

drop policy if exists mcp_tokens_delete on public.mcp_tokens;
create policy mcp_tokens_delete on public.mcp_tokens for delete to authenticated
  using (user_id = auth.uid());
