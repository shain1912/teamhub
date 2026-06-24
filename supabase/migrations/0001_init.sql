-- TeamHub 초기 스키마
-- Supabase(Postgres). 대시보드 SQL Editor 또는 `supabase db push` 로 적용.

-- =========================================================
-- 1. profiles  (auth.users 1:1)
-- =========================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text not null default 'member',   -- member | admin
  created_at  timestamptz not null default now()
);

-- 신규 가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================
-- 2. 메시징
-- =========================================================
create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_private  boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.channel_members (
  channel_id  uuid references public.channels(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete cascade,
  role        text not null default 'member',
  joined_at   timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,
  body        text not null,
  parent_id   uuid references public.messages(id) on delete cascade,  -- 스레드
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index if not exists messages_channel_idx on public.messages(channel_id, created_at);

-- =========================================================
-- 3. 파일 (Storage 'files' 버킷 경로 보관)
-- =========================================================
create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  channel_id   uuid references public.channels(id) on delete cascade,
  message_id   uuid references public.messages(id) on delete set null,
  uploader_id  uuid references public.profiles(id) on delete set null,
  name         text not null,
  storage_path text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);
create index if not exists files_channel_idx on public.files(channel_id, created_at);

-- =========================================================
-- 4. 공지
-- =========================================================
create table if not exists public.announcements (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  author_id    uuid references public.profiles(id) on delete set null,
  priority     text not null default 'normal',   -- normal | high | urgent
  pinned       boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.announcement_reads (
  announcement_id uuid references public.announcements(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- =========================================================
-- 5. 티켓
-- =========================================================
create table if not exists public.tickets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  status      text not null default 'open',     -- open | in_progress | done | closed
  priority    text not null default 'medium',   -- low | medium | high | urgent
  reporter_id uuid references public.profiles(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete set null,
  channel_id  uuid references public.channels(id) on delete set null,
  due_date    date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists tickets_status_idx on public.tickets(status, priority);

create table if not exists public.ticket_comments (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists tickets_touch on public.tickets;
create trigger tickets_touch before update on public.tickets
  for each row execute function public.touch_updated_at();

-- =========================================================
-- 6. 프로젝트 / 간트
-- =========================================================
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  owner_id    uuid references public.profiles(id) on delete set null,
  start_date  date,
  end_date    date,
  created_at  timestamptz not null default now()
);

create table if not exists public.gantt_tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  start_date  date not null,
  end_date    date not null,
  progress    int not null default 0,           -- 0..100
  status      text not null default 'todo',      -- todo | doing | done
  assignee_id uuid references public.profiles(id) on delete set null,
  sort_order  int not null default 0
);
create index if not exists gantt_tasks_project_idx on public.gantt_tasks(project_id, sort_order);

create table if not exists public.gantt_dependencies (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references public.gantt_tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.gantt_tasks(id) on delete cascade,
  unique (task_id, depends_on_task_id)
);

-- =========================================================
-- 7. 체크리스트 + 팔로업
-- =========================================================
create table if not exists public.checklists (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  project_id uuid references public.projects(id) on delete cascade,
  ticket_id  uuid references public.tickets(id) on delete cascade,
  owner_id   uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  content      text not null,
  is_done      boolean not null default false,
  assignee_id  uuid references public.profiles(id) on delete set null,
  due_date     date,
  follow_up_at timestamptz,                       -- 팔로업 알림 예정 시각
  completed_at timestamptz,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists checklist_items_list_idx on public.checklist_items(checklist_id, sort_order);

-- =========================================================
-- 8. Realtime 발행 (메시지/공지)
-- =========================================================
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.announcements;

-- =========================================================
-- 9. RLS — 로그인 사용자 접근 (MVP: 인증된 사용자 전체 허용, 추후 채널 멤버십으로 강화)
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','channels','channel_members','messages','files',
    'announcements','announcement_reads','tickets','ticket_comments',
    'projects','gantt_tasks','gantt_dependencies','checklists','checklist_items'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy %1$s_read on public.%1$I for select to authenticated using (true);
    $f$, t);
    execute format($f$
      create policy %1$s_write on public.%1$I for all to authenticated using (true) with check (true);
    $f$, t);
  end loop;
exception when duplicate_object then null;
end $$;

-- Storage 'files' 버킷은 대시보드에서 생성하고, 인증 사용자 read/write 정책을 추가한다.
