-- 0008: DM/채널 읽음 처리
-- DM은 기존 인프라(is_dm 채널 + channel_members 2명 + messages)를 재사용한다.
-- 별도 테이블 없이, 읽음 위치만 channel_members 에 컬럼으로 추가한다.
-- 안읽음 = 해당 채널 메시지 중 last_read_at 이후 & 작성자가 본인이 아닌 것.

alter table public.channel_members
  add column if not exists last_read_at timestamptz;

-- 메시지 조회 가속(채널별 최신순) — 이미 있으면 무시
create index if not exists messages_channel_created_idx
  on public.messages (channel_id, created_at desc);
