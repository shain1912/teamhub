-- 0009: DM 채널 중복 생성 방지 + 0008 정리 (리뷰 반영)
-- M1: 두 사람 사이 DM 채널이 정확히 1개가 되도록 유니크 제약.
--     dm_key = 정렬된 두 user_id ("uuidA:uuidB"). 부분 유니크(is_dm 한정).
-- M2/L1: 0008에서 추가한 미사용 컬럼·중복 인덱스 제거.

alter table public.channels add column if not exists dm_key text;

-- 기존 DM(멤버 2명) 백필
update public.channels c
set dm_key = sub.k
from (
  select channel_id, string_agg(user_id::text, ':' order by user_id) as k
  from public.channel_members
  group by channel_id
  having count(*) = 2
) sub
where c.id = sub.channel_id and c.is_dm and c.dm_key is null;

-- 부분 유니크: 같은 쌍의 DM 채널 2개 불가 (제약은 RLS 우회 → 동시삽입도 차단)
create unique index if not exists channels_dm_key_uidx
  on public.channels (dm_key) where is_dm and dm_key is not null;

-- 0008 정리
alter table public.channel_members drop column if exists last_read_at;
drop index if exists public.messages_channel_created_idx;
