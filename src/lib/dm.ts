import { supabase } from './supabase'

// DM은 별도 테이블 없이 기존 인프라를 재사용한다:
//   - 채널 1개 (is_dm=true, is_private=true, dm_key="uuidA:uuidB") + channel_members 2명
//   - 메시지는 messages 테이블, 읽음은 channel_reads 테이블 (Channels 와 동일)
// dm_key(정렬된 두 user_id) + 부분 유니크 인덱스로 두 사람 사이 DM 채널이 정확히 1개로 수렴한다.
// 반환: channel_id

function dmKeyOf(a: string, b: string): string {
  return [a, b].sort().join(':')
}

export async function getOrCreateDmChannel(meId: string, otherId: string): Promise<string> {
  if (meId === otherId) throw new Error('자기 자신과는 DM할 수 없습니다.')
  const dmKey = dmKeyOf(meId, otherId)

  // 1) 기존 DM (dm_key로 결정적 조회 — 내가 멤버면 RLS로 보임)
  const { data: existing } = await supabase
    .from('channels')
    .select('id')
    .eq('is_dm', true)
    .eq('dm_key', dmKey)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  // 2) 없으면 생성 (유니크 인덱스가 동시 생성/중복을 차단)
  const { data: ch, error } = await supabase
    .from('channels')
    .insert({ name: 'DM', is_dm: true, is_private: true, dm_key: dmKey, created_by: meId })
    .select('id')
    .single()

  if (error || !ch) {
    // 유니크 위반(레이스) → 상대가 막 만든 채널을 재조회
    const { data: again } = await supabase
      .from('channels')
      .select('id')
      .eq('is_dm', true)
      .eq('dm_key', dmKey)
      .maybeSingle()
    if (again?.id) return again.id as string
    throw error ?? new Error('DM 채널 생성 실패')
  }

  const channelId = (ch as { id: string }).id
  const { error: mErr } = await supabase.from('channel_members').insert([
    { channel_id: channelId, user_id: meId },
    { channel_id: channelId, user_id: otherId },
  ])
  if (mErr) throw mErr

  return channelId
}
