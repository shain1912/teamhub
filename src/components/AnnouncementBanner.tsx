import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Announcement } from '../lib/types'

const STYLE: Record<string, string> = {
  normal: 'bg-brand text-white',
  high: 'bg-amber-500 text-white',
  urgent: 'bg-red-600 text-white',
}

// 상단 고정 공지 배너 — "눈에 띄게" 요구사항. 핀 고정 + 미만료 공지를 우선순위로 노출.
export default function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  async function load() {
    const nowIso = new Date().toISOString()
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('pinned', true)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('priority', { ascending: false })
      .order('published_at', { ascending: false })
    setItems((data as Announcement[]) ?? [])
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('announcement-banner')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, load)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  const visible = items.filter((a) => !dismissed.has(a.id))
  if (visible.length === 0) return null
  const a = visible[0]

  return (
    <div className={`flex items-center gap-3 px-6 py-2 text-sm ${STYLE[a.priority] ?? STYLE.normal}`}>
      <span className="rounded bg-white/20 px-1.5 py-0.5 text-xs font-bold uppercase">{a.priority}</span>
      <Link to="/announcements" className="flex-1 truncate font-medium hover:underline">
        {a.title}
      </Link>
      {visible.length > 1 && <span className="text-xs opacity-80">+{visible.length - 1}</span>}
      <button
        onClick={() => setDismissed((s) => new Set(s).add(a.id))}
        className="rounded px-1.5 text-white/80 hover:bg-white/20"
        aria-label="닫기"
      >
        ✕
      </button>
    </div>
  )
}
