/**
 * AI 비서 클라이언트 — teamhub-mcp 서버의 /ai/chat 프록시를 호출한다.
 * GLM(z.ai) API 키는 서버에만 있고, 프론트는 로그인 사용자의 Supabase 토큰으로 인증한다.
 * (프론트 번들에 키가 들어가지 않음)
 */
import { supabase } from './supabase'

const PROXY =
  (import.meta.env.VITE_AI_PROXY_URL as string) || 'https://teamhub-mcp.onrender.com'

// 프록시 방식에선 클라이언트가 키를 알 필요 없음 — 항상 사용 가능으로 두고, 실패 시 메시지로 처리
export const isGlmConfigured = true

export interface GlmToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}
export interface GlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: GlmToolCall[]
  tool_call_id?: string
}

export async function glmChat(messages: GlmMessage[], tools?: unknown[]): Promise<GlmMessage> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token ?? ''
  const res = await fetch(`${PROXY}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, tools }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`AI ${res.status}: ${t.slice(0, 300)}`)
  }
  const json = await res.json()
  const msg = json?.choices?.[0]?.message
  if (!msg) throw new Error('AI 응답이 비어 있습니다.')
  return msg as GlmMessage
}
