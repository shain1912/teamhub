import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Announcement, Priority } from '../lib/types'

const BADGE: Record<Priority, string> = {
  normal: 'bg-slate-200 text-slate-700',
  high: 'bg-amber-100 text-amber-800',
  urgent: 'bg-red-100 text-red-700',
}

export default function Announcements() {
  const profile = useAuth((s) => s.profile)
  const [items, setItems] = useState<Announcement[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', priority: 'normal' as Priority, pinned: true })

  async function load() {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false })
    setItems((data as Announcement[]) ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('announcements').insert({ ...form, author_id: profile?.id })
    setForm({ title: '', body: '', priority: 'normal', pinned: true })
    setOpen(false)
    load()
  }

  async function togglePin(a: Announcement) {
    await supabase.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id)
    load()
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">공지</h1>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
          + 새 공지
        </button>
      </div>

      {open && (
        <form onSubmit={create} className="mb-6 space-y-3 rounded-xl border bg-white p-4">
          <input
            required
            placeholder="제목"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
          <textarea
            required
            placeholder="내용"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="h-24 w-full rounded-lg border px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-4 text-sm">
            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
              className="rounded-lg border px-2 py-1"
            >
              <option value="normal">일반</option>
              <option value="high">중요</option>
              <option value="urgent">긴급</option>
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
              상단 고정
            </label>
            <button className="ml-auto rounded-lg bg-brand px-4 py-1.5 font-semibold text-white">게시</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {items.map((a) => (
          <div key={a.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2">
              {a.pinned && <span title="고정됨">📌</span>}
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE[a.priority]}`}>{a.priority}</span>
              <h2 className="font-semibold">{a.title}</h2>
              <button onClick={() => togglePin(a)} className="ml-auto text-xs text-slate-400 hover:text-brand">
                {a.pinned ? '고정 해제' : '고정'}
              </button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
            <div className="mt-2 text-xs text-slate-400">{new Date(a.published_at).toLocaleString()}</div>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-slate-400">아직 공지가 없습니다.</p>}
      </div>
    </div>
  )
}
