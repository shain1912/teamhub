-- TeamHub v2 기능 스키마
-- 반응, 알림, 스프린트, 읽음상태, 감사로그 + 티켓 확장(라벨/스토리포인트/스프린트/계층/유형), DM 플래그

-- 메시지 이모지 반응
create table if not exists public.reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  emoji      text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists reactions_message_idx on public.reactions(message_id);

-- 알림 센터 (멘션/배정/팔로업/시스템)
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null default 'system',   -- mention | assignment | follow_up | system
  title       text not null,
  body        text,
  link        text,                              -- 인앱 경로 (예: /tickets?id=...)
  entity_type text,
  entity_id   uuid,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, is_read, created_at desc);

-- 스프린트 (Jira)
create table if not exists public.sprints (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  project_id uuid references public.projects(id) on delete cascade,
  goal       text,
  start_date date,
  end_date   date,
  status     text not null default 'planned',    -- planned | active | completed
  created_at timestamptz not null default now()
);

-- 티켓 확장: 라벨/스토리포인트/스프린트/부모(에픽-스토리-서브태스크)/유형
alter table public.tickets add column if not exists labels           text[] not null default '{}';
alter table public.tickets add column if not exists story_points     int;
alter table public.tickets add column if not exists sprint_id        uuid references public.sprints(id) on delete set null;
alter table public.tickets add column if not exists parent_ticket_id uuid references public.tickets(id) on delete set null;
alter table public.tickets add column if not exists type             text not null default 'task';  -- epic | story | task | bug | subtask
create index if not exists tickets_sprint_idx on public.tickets(sprint_id);
create index if not exists tickets_parent_idx on public.tickets(parent_ticket_id);

-- 채널 DM 플래그 + 읽음 상태(안읽음 뱃지)
alter table public.channels add column if not exists is_dm boolean not null default false;

create table if not exists public.channel_reads (
  channel_id   uuid references public.channels(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

-- 감사 로그 (활동 추적)
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

-- Realtime
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.notifications;

-- RLS (신규 테이블 — MVP: 인증 사용자 전체 허용)
do $$
declare t text;
begin
  foreach t in array array['reactions','notifications','sprints','channel_reads','audit_log'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (true);', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
