import { supabase } from './supabase'
import type { NotificationType } from './types'

// 알림 생성 옵션. user_id 는 알림을 받을 대상 사용자.
export interface CreateNotificationOpts {
  user_id: string
  type: NotificationType
  title: string
  body?: string | null
  link?: string | null
  entity_type?: string | null
  entity_id?: string | null
}

// 알림 1건을 notifications 테이블에 삽입한다.
// 다른 기능 모듈(메시지 멘션, 티켓 배정 등)에서 import 해서 사용한다.
export async function createNotification(opts: CreateNotificationOpts): Promise<void> {
  const { error } = await supabase.from('notifications').insert({
    user_id: opts.user_id,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? null,
    link: opts.link ?? null,
    entity_type: opts.entity_type ?? null,
    entity_id: opts.entity_id ?? null,
    is_read: false,
  })
  if (error) {
    // 알림 실패가 본 작업을 막지 않도록 콘솔 경고만 남긴다.
    console.warn('[TeamKode] createNotification 실패:', error.message)
  }
}

// 본문에서 @멘션 토큰을 추출한다. 예: "@alice 확인해줘 @bob" -> ['alice', 'bob']
// 한글·영문·숫자·밑줄·점·하이픈을 멘션 문자로 허용한다. 중복은 제거한다.
export function extractMentions(text: string): string[] {
  if (!text) return []
  const re = /(^|[^\w가-힣])@([A-Za-z0-9가-힣._-]+)/g
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const name = m[2]
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}
