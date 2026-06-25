import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Notification, NotificationType } from '../lib/types'

const ICON: Record<NotificationType, string> = {
  mention: '💬',
  assignment: '🎫',
  follow_up: '⏰',
  system: '📣',
}

export default function NotificationBell() {
  const me = useAuth((s) => s.profile)
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  async function load() {
    if (!me?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })
      .limit(20)
    const list = (data as Notification[]) ?? []
    setItems(list)
    setUnread(list.filter((n) => !n.is_read).length)
  }

  useEffect(() => {
    if (!me?.id) {
      setItems([])
      setUnread(0)
      return
    }
    load()
    const ch = supabase
      .channel('notification-bell-' + me.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + me.id },
        load,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // me.id 변경 시 재구독
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  // 바깥 클릭 시 드롭다운 닫기
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  async function openItem(n: Notification) {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      setUnread((u) => Math.max(0, u - 1))
    }
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  // me 가 없으면 종 아이콘만 노출
  if (!me?.id) {
    return (
      <span className="text-xl text-ash" aria-label="알림" title="알림">
        🔔
      </span>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full px-1.5 py-1 text-xl hover:bg-bone"
        aria-label="알림"
        title="알림"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-brand px-1 font-mono text-[10px] font-bold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-hairline bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="text-sm font-semibold text-ink">알림</span>
            <button
              onClick={() => {
                setOpen(false)
                navigate('/notifications')
              }}
              className="text-xs text-brand hover:text-brand-dark"
            >
              전체 보기
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-ash">알림이 없습니다.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`flex w-full items-start gap-2 border-b border-hairline px-3 py-2 text-left last:border-b-0 hover:bg-canvas ${
                  n.is_read ? 'opacity-60' : 'bg-brand/5'
                }`}
              >
                <span className="mt-0.5 text-base">{ICON[n.type] ?? '🔔'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-mute">{n.body}</span>}
                  <span className="block font-mono text-[10px] text-ash">{new Date(n.created_at).toLocaleString()}</span>
                </span>
                {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
