import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageSquare, Ticket, Clock, Megaphone, Bell, type LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Notification, NotificationType } from '../lib/types'

const ICON: Record<NotificationType, LucideIcon> = {
  mention: MessageSquare,
  assignment: Ticket,
  follow_up: Clock,
  system: Megaphone,
}

const LABEL: Record<NotificationType, string> = {
  mention: '멘션',
  assignment: '배정',
  follow_up: '팔로업',
  system: '시스템',
}

export default function Notifications() {
  const me = useAuth((s) => s.profile)
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!me?.id) {
      setItems([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', me.id)
      .order('created_at', { ascending: false })
    setItems((data as Notification[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    if (!me?.id) return
    const ch = supabase
      .channel('notifications-page-' + me.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + me.id },
        load,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  async function markAllRead() {
    if (!me?.id) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', me.id).eq('is_read', false)
    setItems((cur) => cur.map((n) => ({ ...n, is_read: true })))
  }

  async function openItem(n: Notification) {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
    }
    if (n.link) navigate(n.link)
  }

  const unreadCount = items.filter((n) => !n.is_read).length

  return (
    <div className="h-full overflow-y-auto bg-canvas p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">
          알림
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 font-mono text-xs font-semibold text-white">{unreadCount}</span>
          )}
        </h1>
        <button
          onClick={markAllRead}
          disabled={unreadCount === 0}
          className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          모두 읽음
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-ash">불러오는 중…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-ash">알림이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              className={`flex w-full items-start gap-3 rounded-xl border border-hairline bg-card p-4 text-left transition hover:border-brand ${
                n.is_read ? 'opacity-60' : 'border-brand/40 bg-brand/5'
              }`}
            >
              <span className="mt-0.5 text-mute">
                {(() => { const I = ICON[n.type] ?? Bell; return <I size={20} /> })()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-bone px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-mute">
                    {LABEL[n.type] ?? n.type}
                  </span>
                  <span className="truncate font-medium text-ink">{n.title}</span>
                  {!n.is_read && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />}
                </div>
                {n.body && <p className="mt-1 whitespace-pre-wrap text-sm text-charcoal">{n.body}</p>}
                <div className="mt-1 font-mono text-xs text-ash">{new Date(n.created_at).toLocaleString()}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
