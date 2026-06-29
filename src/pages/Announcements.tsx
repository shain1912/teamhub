import { useEffect, useState } from 'react'
import { Megaphone, Pin, Plus, X, AlertTriangle, ArrowRight, Clock, History, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Announcement, Priority } from '../lib/types'

// 우선순위별 비주얼 — 컬러 타일 + 배지 + 아이콘 (Indigo Synthesis)
const META: Record<Priority, { label: string; tile: string; badge: string; dot: string; Icon: typeof Megaphone }> = {
  normal: { label: '일반', tile: 'bg-bone text-mute', badge: 'bg-bone text-charcoal', dot: 'bg-mute', Icon: Megaphone },
  high: { label: '중요', tile: 'bg-info-soft text-info', badge: 'bg-info-soft text-info-ink', dot: 'bg-info', Icon: AlertTriangle },
  urgent: { label: '긴급', tile: 'bg-danger-soft text-danger', badge: 'bg-danger-soft text-danger-ink', dot: 'bg-danger', Icon: AlertTriangle },
}

const WEIGHT: Record<Priority, number> = { urgent: 3, high: 2, normal: 1 }

export default function Announcements() {
  const profile = useAuth((s) => s.profile)
  const [items, setItems] = useState<Announcement[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', priority: 'normal' as Priority, pinned: true })
  // 표시 전용 상태 (클라 정렬·필터)
  const [tab, setTab] = useState<'latest' | 'popular'>('latest')
  const [filter, setFilter] = useState<Priority | 'all'>('all')

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

  // ── 표시용 파생값 ──
  const featured = items.find((a) => a.pinned) ?? items.find((a) => a.priority === 'urgent') ?? items[0] ?? null

  const counts = {
    urgent: items.filter((a) => a.priority === 'urgent').length,
    high: items.filter((a) => a.priority === 'high').length,
    normal: items.filter((a) => a.priority === 'normal').length,
  }

  const cats: { key: Priority | 'all'; label: string; dot: string; count: number }[] = [
    { key: 'all', label: '전체', dot: 'bg-brand', count: items.length },
    { key: 'urgent', label: '긴급', dot: 'bg-danger', count: counts.urgent },
    { key: 'high', label: '중요', dot: 'bg-info', count: counts.high },
    { key: 'normal', label: '일반', dot: 'bg-mute', count: counts.normal },
  ]

  const listed = items
    .filter((a) => a.id !== featured?.id)
    .filter((a) => filter === 'all' || a.priority === filter)
    .slice()
    .sort((a, b) => {
      if (tab === 'popular') {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (WEIGHT[a.priority] !== WEIGHT[b.priority]) return WEIGHT[b.priority] - WEIGHT[a.priority]
      }
      return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    })

  function scrollToList() {
    document.getElementById('recent-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-4 sm:p-6">
        {/* 페이지 헤더 */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-ink">전사 공지</h1>
            <p className="mt-0.5 text-sm text-mute">최신 운영 변경과 팀 마일스톤을 한곳에서 확인하세요.</p>
          </div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-raised transition hover:bg-brand-dark"
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

        {/* 2열 레이아웃 */}
        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          {/* ── 메인 ── */}
          <div className="min-w-0 flex-1 space-y-6">
            {/* Featured 히어로 */}
            {featured && (
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-overlay sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5" />
                <div className="pointer-events-none absolute -bottom-20 right-10 h-48 w-48 rounded-full bg-white/5" />
                <div className="relative">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
                    <Megaphone size={13} /> 주요 공지
                  </span>
                  <h2 className="mt-4 max-w-2xl text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                    {featured.title}
                  </h2>
                  <p className="mt-3 max-w-xl whitespace-pre-wrap text-sm leading-relaxed text-white/75 line-clamp-2">
                    {featured.body}
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <button
                      onClick={scrollToList}
                      className="flex items-center gap-2 rounded-lg bg-mint px-4 py-2.5 text-sm font-bold text-white shadow-raised transition hover:bg-mint-ink"
                    >
                      전문 보기 <ArrowRight size={16} />
                    </button>
                    <span className="flex items-center gap-1.5 text-sm text-white/70">
                      <Clock size={14} /> {new Date(featured.published_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 최근 공지 헤더 + 토글 */}
            <div id="recent-list" className="flex items-center justify-between gap-3 scroll-mt-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-ink">
                <History size={18} className="text-brand" /> 최근 공지
              </h2>
              <div className="flex items-center gap-1 rounded-full border border-hairline bg-card p-1 text-sm shadow-raised">
                {(['latest', 'popular'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-full px-3 py-1 font-semibold transition ${
                      tab === t ? 'bg-brand text-white' : 'text-mute hover:text-ink'
                    }`}
                  >
                    {t === 'latest' ? 'Latest' : 'Popular'}
                  </button>
                ))}
              </div>
            </div>

            {/* 리스트 */}
            <div className="space-y-3">
              {listed.map((a) => (
                <Card key={a.id} a={a} onTogglePin={togglePin} onRemove={remove} />
              ))}
              {listed.length === 0 && (
                <p className="rounded-xl border border-dashed border-hairline py-10 text-center text-sm text-ash">
                  {items.length === 0 ? '아직 공지가 없습니다.' : '해당 조건의 공지가 없습니다.'}
                </p>
              )}
            </div>
          </div>

          {/* ── 우측 레일 ── */}
          <aside className="shrink-0 space-y-4 lg:w-72">
            {/* 공지 카테고리 */}
            <div className="rounded-xl border border-hairline bg-card p-4 shadow-raised">
              <h3 className="text-xs font-bold uppercase tracking-wider text-mute">공지 카테고리</h3>
              <div className="mt-3 space-y-1">
                {cats.map((c) => {
                  const active = filter === c.key
                  return (
                    <button
                      key={c.key}
                      onClick={() => setFilter(c.key)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                        active ? 'bg-brand text-white' : 'text-body hover:bg-bone'
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.dot} ${active ? 'ring-2 ring-white/40' : ''}`} />
                      <span className="font-medium">{c.label}</span>
                      <span
                        className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                          active ? 'bg-white/20 text-white' : 'bg-bone text-mute'
                        }`}
                      >
                        {c.count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 팀 하이라이트 */}
            <div className="rounded-xl border border-hairline bg-card p-4 shadow-raised">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-mint-soft text-mint-ink">
                  <Sparkles size={16} />
                </span>
                <h3 className="text-sm font-bold text-ink">팀 하이라이트</h3>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-mute">
                현재 <span className="font-semibold text-ink">{items.length}</span>개의 공지가 등록되어 있어요.
                {counts.urgent > 0 ? (
                  <>
                    {' '}그중 <span className="font-semibold text-danger-ink">{counts.urgent}</span>건은 긴급 공지이니 먼저 확인해 주세요.
                  </>
                ) : (
                  <> 새로운 소식이 올라오면 이곳에서 가장 먼저 확인할 수 있어요.</>
                )}
              </p>
            </div>
          </aside>
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
