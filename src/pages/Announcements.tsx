import { useEffect, useState } from 'react'
import { Megaphone, Pin, Plus, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Announcement, Priority } from '../lib/types'

// 우선순위별 비주얼 — 컬러 타일 + 배지 + 아이콘 (Indigo Synthesis)
const META: Record<Priority, { label: string; tile: string; badge: string; Icon: typeof Megaphone }> = {
  normal: { label: '일반', tile: 'bg-bone text-mute', badge: 'bg-bone text-charcoal', Icon: Megaphone },
  high: { label: '중요', tile: 'bg-info-soft text-info', badge: 'bg-info-soft text-info-ink', Icon: AlertTriangle },
  urgent: { label: '긴급', tile: 'bg-danger-soft text-danger', badge: 'bg-danger-soft text-danger-ink', Icon: AlertTriangle },
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

  async function remove(a: Announcement) {
    if (!confirm(`공지 "${a.title}" 를 삭제할까요?`)) return
    const { error } = await supabase.from('announcements').delete().eq('id', a.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    load()
  }

  const pinned = items.filter((a) => a.pinned)
  const recent = items.filter((a) => !a.pinned)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {/* 인디고 히어로 */}
        <div className="relative overflow-hidden rounded-xl bg-brand p-6 text-white shadow-raised sm:p-7">
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">Updates</span>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">전사 공지</h1>
          <p className="mt-1.5 max-w-md text-sm text-white/70">
            최신 운영 변경과 팀 마일스톤을 한곳에서 확인하세요.
          </p>
          <button
            onClick={() => setOpen((v) => !v)}
            className="absolute right-5 top-5 flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
          >
            <Plus size={16} /> 새 공지
          </button>
        </div>

        {/* 작성 폼 */}
        {open && (
          <form onSubmit={create} className="mt-5 space-y-3 rounded-xl border border-hairline bg-card p-4 shadow-raised">
            <input
              required
              placeholder="제목"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <textarea
              required
              placeholder="내용"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="h-24 w-full rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <div className="flex items-center gap-4 text-sm">
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                className="rounded-lg border border-hairline px-2 py-1.5"
              >
                <option value="normal">일반</option>
                <option value="high">중요</option>
                <option value="urgent">긴급</option>
              </select>
              <label className="flex items-center gap-1.5 text-mute">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
                상단 고정
              </label>
              <button className="ml-auto rounded-lg bg-brand px-4 py-1.5 font-semibold text-white transition hover:bg-brand-dark">게시</button>
            </div>
          </form>
        )}

        {/* 고정 공지 */}
        {pinned.length > 0 && (
          <>
            <h2 className="mt-7 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink">
              <Pin size={15} className="text-brand" /> 고정 공지
            </h2>
            <div className="mt-3 space-y-3">
              {pinned.map((a) => (
                <Card key={a.id} a={a} onTogglePin={togglePin} onRemove={remove} />
              ))}
            </div>
          </>
        )}

        {/* 최근 공지 */}
        <h2 className="mt-7 text-sm font-bold uppercase tracking-wider text-ink">최근 공지</h2>
        <div className="mt-3 space-y-3">
          {recent.map((a) => (
            <Card key={a.id} a={a} onTogglePin={togglePin} onRemove={remove} />
          ))}
          {items.length === 0 && (
            <p className="rounded-xl border border-dashed border-hairline py-10 text-center text-sm text-ash">
              아직 공지가 없습니다.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function Card({
  a,
  onTogglePin,
  onRemove,
}: {
  a: Announcement
  onTogglePin: (a: Announcement) => void
  onRemove: (a: Announcement) => void
}) {
  const m = META[a.priority] ?? META.normal
  return (
    <div className="flex gap-3 rounded-xl border border-hairline bg-card p-4 shadow-raised transition hover:border-brand/30">
      <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${m.tile}`}>
        <m.Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${m.badge}`}>{m.label}</span>
          {a.pinned && <Pin size={12} className="text-brand" />}
          <h3 className="truncate font-semibold text-ink">{a.title}</h3>
          <span className="ml-auto shrink-0 text-xs text-ash">{new Date(a.published_at).toLocaleDateString()}</span>
        </div>
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-mute">{a.body}</p>
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button onClick={() => onTogglePin(a)} className="font-medium text-mute transition hover:text-brand">
            {a.pinned ? '고정 해제' : '고정'}
          </button>
          <button onClick={() => onRemove(a)} className="flex items-center gap-1 text-ash transition hover:text-danger" title="공지 삭제">
            <X size={13} /> 삭제
          </button>
        </div>
      </div>
    </div>
  )
}
