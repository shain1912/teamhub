import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Send, Plus, ArrowLeft, X, MessageCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { getOrCreateDmChannel } from '../lib/dm'
import type { Message, Profile } from '../lib/types'

interface DmSummary {
  channelId: string
  other: Profile | null
  lastBody: string | null
  lastAt: string | null
  unread: number
}

function initials(p?: Profile | null): string {
  const s = p?.full_name || p?.email || '?'
  return s.slice(0, 2).toUpperCase()
}

export default function DirectMessages() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const me = useAuth((s) => s.profile)
  const [list, setList] = useState<DmSummary[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [picker, setPicker] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [body, setBody] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  // 게스트는 DM 사용 불가 (RLS로도 막히지만 UX상 홈으로)
  useEffect(() => {
    if (me && me.role === 'guest') navigate('/channels', { replace: true })
  }, [me, navigate])

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of profiles) m.set(p.id, p)
    return m
  }, [profiles])

  // 전체 프로필 (이름/아바타 + 새 DM 피커)
  useEffect(() => {
    supabase.from('profiles').select('*').then(({ data }) => setProfiles((data as Profile[]) ?? []))
  }, [])

  // DM 목록 로드
  async function loadList() {
    if (!me?.id) return
    // 1) 내가 속한 DM 채널
    const { data: mine } = await supabase
      .from('channel_members')
      .select('channel_id, channels!inner(id, is_dm)')
      .eq('user_id', me.id)
    const ids = (mine ?? []).filter((r: any) => r.channels?.is_dm).map((r: any) => r.channel_id as string)
    if (!ids.length) {
      setList([])
      return
    }
    // 2) 상대 멤버, 3) 읽음, 4) 메시지 — 병렬
    const [{ data: members }, { data: reads }, { data: msgs }] = await Promise.all([
      supabase.from('channel_members').select('channel_id, user_id').in('channel_id', ids),
      supabase.from('channel_reads').select('channel_id, last_read_at').eq('user_id', me.id).in('channel_id', ids),
      supabase.from('messages').select('channel_id, body, created_at, user_id').in('channel_id', ids).order('created_at'),
    ])
    const otherOf = new Map<string, string>()
    for (const m of members ?? []) if (m.user_id !== me.id) otherOf.set(m.channel_id, m.user_id)
    const readAt = new Map<string, string>()
    for (const r of reads ?? []) readAt.set(r.channel_id, r.last_read_at)
    const last = new Map<string, { body: string; at: string }>()
    const unread = new Map<string, number>()
    for (const m of msgs ?? []) {
      last.set(m.channel_id, { body: m.body, at: m.created_at })
      const lr = readAt.get(m.channel_id)
      if (m.user_id !== me.id && (!lr || m.created_at > lr)) unread.set(m.channel_id, (unread.get(m.channel_id) ?? 0) + 1)
    }
    const summaries: DmSummary[] = ids.map((cid) => ({
      channelId: cid,
      other: otherOf.has(cid) ? profileMap.get(otherOf.get(cid)!) ?? null : null,
      lastBody: last.get(cid)?.body ?? null,
      lastAt: last.get(cid)?.at ?? null,
      unread: unread.get(cid) ?? 0,
    }))
    summaries.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
    setList(summaries)
  }

  useEffect(() => {
    loadList()
    if (!me?.id) return
    // 내 모든 DM 메시지 변동 → 목록 갱신
    const ch = supabase
      .channel('dm-list-' + me.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, loadList)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id, profiles])

  // 선택 대화 로드 + 실시간 + 읽음
  async function loadMessages() {
    if (!channelId) return
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(*)')
      .eq('channel_id', channelId)
      .order('created_at')
    setMessages((data as Message[]) ?? [])
  }
  async function markRead() {
    if (!channelId || !me?.id) return
    await supabase
      .from('channel_reads')
      .upsert({ channel_id: channelId, user_id: me.id, last_read_at: new Date().toISOString() }, { onConflict: 'channel_id,user_id' })
    loadList()
  }

  useEffect(() => {
    if (!channelId) {
      setMessages([])
      return
    }
    loadMessages()
    markRead()
    const ch = supabase
      .channel('dm-' + channelId)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        () => {
          loadMessages()
          markRead()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text || !channelId || !me?.id) return
    setBody('')
    const { error } = await supabase.from('messages').insert({ channel_id: channelId, user_id: me.id, body: text })
    if (error) {
      setBody(text) // 실패 시 입력 복원
      alert('전송 실패: ' + error.message)
      return
    }
    loadMessages()
  }

  async function startDm(otherId: string) {
    if (!me?.id) return
    try {
      const cid = await getOrCreateDmChannel(me.id, otherId)
      setPicker(false)
      navigate(`/dm/${cid}`)
    } catch (e: any) {
      alert('DM 시작 실패: ' + (e?.message ?? e))
    }
  }

  const active = list.find((d) => d.channelId === channelId)
  const others = profiles.filter((p) => p.id !== me?.id && p.role !== 'guest')

  return (
    <div className="flex h-full">
      {/* 좌측: DM 목록 (모바일에선 대화 선택 시 숨김) */}
      <div className={`${channelId ? 'hidden lg:flex' : 'flex'} w-full shrink-0 flex-col border-r border-hairline bg-card lg:w-72`}>
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-bold text-ink">다이렉트 메시지</h2>
          <button onClick={() => setPicker(true)} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
            <Plus size={14} /> 새 DM
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && <p className="px-4 py-8 text-center text-sm text-ash">아직 대화가 없습니다.<br />‘새 DM’으로 시작하세요.</p>}
          {list.map((d) => (
            <button
              key={d.channelId}
              onClick={() => navigate(`/dm/${d.channelId}`)}
              className={`flex w-full items-center gap-3 border-b border-hairline px-3 py-2.5 text-left hover:bg-canvas ${
                d.channelId === channelId ? 'bg-brand/5' : ''
              }`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                {initials(d.other)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-ink">{d.other?.full_name ?? d.other?.email ?? '(알수없음)'}</span>
                  {d.unread > 0 && (
                    <span className="ml-auto grid h-4 min-w-[1rem] shrink-0 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                      {d.unread > 99 ? '99+' : d.unread}
                    </span>
                  )}
                </span>
                {d.lastBody && <span className="block truncate text-xs text-mute">{d.lastBody}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 우측: 대화 */}
      <div className={`${channelId ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
        {!channelId ? (
          <div className="grid h-full place-items-center text-center text-sm text-ash">
            <div>
              <MessageCircle size={32} className="mx-auto mb-2 text-stone" />
              왼쪽에서 대화를 선택하거나 새 DM을 시작하세요.
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-hairline bg-card px-4 py-3">
              <button onClick={() => navigate('/dm')} className="text-mute hover:text-ink lg:hidden" aria-label="뒤로">
                <ArrowLeft size={18} />
              </button>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                {initials(active?.other)}
              </span>
              <span className="font-semibold text-ink">{active?.other?.full_name ?? active?.other?.email ?? '대화'}</span>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {messages.map((m) => {
                const mine = m.user_id === me?.id
                const author = m.user_id ? profileMap.get(m.user_id) : null
                return (
                  <div key={m.id} className={mine ? 'text-right' : ''}>
                    {!mine && <div className="mb-0.5 text-[11px] text-ash">{author?.full_name ?? author?.email ?? '익명'}</div>}
                    <div className={`inline-block max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-brand text-white' : 'bg-bone text-ink'}`}>
                      {m.body}
                    </div>
                    <div className="mt-0.5 text-[10px] text-ash">{new Date(m.created_at).toLocaleTimeString()}</div>
                  </div>
                )
              })}
              {messages.length === 0 && <p className="text-center text-sm text-ash">첫 메시지를 보내보세요.</p>}
              <div ref={endRef} />
            </div>

            <form onSubmit={send} className="flex items-center gap-2 border-t border-hairline bg-card p-3">
              <input
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="메시지 입력…"
                className="min-w-0 flex-1 rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                disabled={!body.trim()}
                aria-label="보내기"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-white transition hover:bg-brand-dark disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </form>
          </>
        )}
      </div>

      {/* 새 DM 피커 */}
      {picker && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setPicker(false)}>
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-hairline bg-card shadow-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <h3 className="text-sm font-bold text-ink">새 다이렉트 메시지</h3>
              <button onClick={() => setPicker(false)} className="text-ash hover:text-ink"><X size={16} /></button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {others.map((p) => (
                <button key={p.id} onClick={() => startDm(p.id)} className="flex w-full items-center gap-3 border-b border-hairline px-4 py-2.5 text-left hover:bg-canvas">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">{initials(p)}</span>
                  <span className="truncate text-sm font-medium text-ink">{p.full_name ?? p.email}</span>
                </button>
              ))}
              {others.length === 0 && <p className="px-4 py-6 text-center text-sm text-ash">다른 팀원이 없습니다.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
