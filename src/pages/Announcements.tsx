import { useEffect, useMemo, useState } from 'react'
import {
  Megaphone,
  ShieldAlert,
  Pin,
  Plus,
  Search,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  List,
  Trash2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useWorkspace } from '../store/workspace'
import type { Announcement, Priority } from '../lib/types'

// 우선순위별 비주얼 — Stitch faithful: 좌측 액센트 바 + 아웃라인 칩 + 흐린 큰 아이콘
const META: Record<
  Priority,
  { label: string; accent: string; chip: string; day: string; Icon: typeof Megaphone }
> = {
  urgent: {
    label: '긴급',
    accent: 'bg-danger',
    chip: 'border-danger/40 bg-danger-soft text-danger-ink',
    day: 'text-danger',
    Icon: ShieldAlert,
  },
  high: {
    label: '중요',
    accent: 'bg-info',
    chip: 'border-info/40 bg-info-soft text-info-ink',
    day: 'text-info',
    Icon: Megaphone,
  },
  normal: {
    label: '일반',
    accent: 'bg-mint',
    chip: 'border-mint/40 bg-mint-soft text-mint-ink',
    day: 'text-brand',
    Icon: Megaphone,
  },
}

const WEIGHT: Record<Priority, number> = { urgent: 3, high: 2, normal: 1 }
const PAGE_SIZE = 6

type AuthorInfo = { name: string; avatar: string | null }

function fmtDay(d: string) {
  return new Date(d).getDate().toString().padStart(2, '0')
}
function fmtMonth(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
}

// 페이지네이션 번호 배열(말줄임 포함)
function pageList(total: number, cur: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const start = Math.max(2, cur - 1)
  const end = Math.min(total - 1, cur + 1)
  if (start > 2) out.push('…')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push('…')
  out.push(total)
  return out
}

export default function Announcements() {
  const profile = useAuth((s) => s.profile)
  const [items, setItems] = useState<Announcement[]>([])
  const [authors, setAuthors] = useState<Record<string, AuthorInfo>>({})
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', priority: 'normal' as Priority, pinned: true })
  // 표시 전용 상태 (클라 필터/검색/페이징/펼치기)
  const [filter, setFilter] = useState<Priority | 'all'>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const wsId = useWorkspace((s) => s.currentId)

  async function load() {
    let q = supabase
      .from('announcements')
      .select('*')
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false })
    if (wsId) q = q.eq('workspace_id', wsId)
    const { data } = await q
    const list = (data as Announcement[]) ?? []
    setItems(list)
    // 작성자 표시명/아바타 로드
    const ids = Array.from(new Set(list.map((a) => a.author_id).filter(Boolean))) as string[]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids)
      const map: Record<string, AuthorInfo> = {}
      ;(profs ?? []).forEach((p: any) => {
        map[p.id] = { name: p.full_name || '익명', avatar: p.avatar_url ?? null }
      })
      setAuthors(map)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  // 필터/검색이 바뀌면 1페이지로
  useEffect(() => {
    setPage(1)
  }, [filter, query])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('announcements').insert({ ...form, author_id: profile?.id, workspace_id: wsId })
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

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function authorOf(a: Announcement): AuthorInfo {
    return (a.author_id && authors[a.author_id]) || { name: '시스템', avatar: null }
  }

  // ── 파생값: featured(고정/긴급 상위 2) + 나머지 최근 ──
  const sorted = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        if (WEIGHT[a.priority] !== WEIGHT[b.priority]) return WEIGHT[b.priority] - WEIGHT[a.priority]
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      }),
    [items],
  )

  const featured = useMemo(
    () => sorted.filter((a) => a.pinned || a.priority === 'urgent').slice(0, 2),
    [sorted],
  )
  const featuredIds = useMemo(() => new Set(featured.map((a) => a.id)), [featured])

  const recent = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((a) => !featuredIds.has(a.id))
      .filter((a) => filter === 'all' || a.priority === filter)
      .filter((a) => !q || a.title.toLowerCase().includes(q) || (a.body ?? '').toLowerCase().includes(q))
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
  }, [items, featuredIds, filter, query])

  const totalPages = Math.max(1, Math.ceil(recent.length / PAGE_SIZE))
  const curPage = Math.min(page, totalPages)
  const paged = recent.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE)

  const pills: { key: Priority | 'all'; label: string }[] = [
    { key: 'all', label: 'ALL' },
    { key: 'urgent', label: '긴급' },
    { key: 'high', label: '중요' },
    { key: 'normal', label: '일반' },
  ]

  return (
    <div
      className="h-full overflow-y-auto bg-canvas"
      style={{
        backgroundImage:
          'radial-gradient(at 0% 0%, rgb(var(--brand) / 0.05) 0px, transparent 50%), radial-gradient(at 100% 0%, rgb(var(--mint) / 0.05) 0px, transparent 50%)',
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10">
        {/* ── 헤더 ── */}
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-3">
              <span className="h-1 w-12 rounded-full bg-brand" />
              <span className="font-mono text-sm font-bold tracking-tight text-brand">LIVE_FEED</span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">전사 공지</h1>
            <p className="mt-2 max-w-xl text-sm text-mute">
              실시간 사내 커뮤니케이션, 핵심 운영 변경과 팀 마일스톤을 한곳에서 확인하세요.
            </p>
          </div>
          <div className="flex shrink-0 gap-3">
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="공지 검색..."
                className="w-full rounded-lg border border-hairline bg-card py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition focus:border-brand sm:w-64"
              />
            </div>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-raised transition hover:bg-brand-dark"
            >
              <Plus size={16} /> 새 공지
            </button>
          </div>
        </div>

        {/* ── 작성 폼 ── */}
        {open && (
          <form onSubmit={create} className="mt-6 space-y-3 rounded-xl border border-hairline bg-card p-4 shadow-raised">
            <input
              required
              placeholder="제목"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <textarea
              required
              placeholder="내용"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="h-24 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-ink outline-none focus:border-brand"
            />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
                className="rounded-lg border border-hairline bg-canvas px-2 py-1.5 text-ink"
              >
                <option value="normal">일반</option>
                <option value="high">중요</option>
                <option value="urgent">긴급</option>
              </select>
              <label className="flex items-center gap-1.5 text-mute">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
                상단 고정
              </label>
              <button className="ml-auto rounded-lg bg-brand px-4 py-1.5 font-semibold text-white transition hover:bg-brand-dark">
                게시
              </button>
            </div>
          </form>
        )}

        {/* ── 주요 공지 (PRIORITY) ── */}
        {featured.length > 0 && (
          <section className="mt-12">
            <div className="mb-6 flex items-center gap-3">
              <Pin size={18} className="text-brand" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-ink">주요 공지 / PRIORITY</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {featured.map((a) => {
                const m = META[a.priority] ?? META.normal
                const author = authorOf(a)
                const isOpen = expanded.has(a.id)
                return (
                  <article
                    key={a.id}
                    className="group relative flex min-h-[16rem] flex-col justify-between overflow-hidden rounded-xl border border-hairline bg-card p-8 shadow-raised transition hover:-translate-y-0.5 hover:shadow-overlay"
                  >
                    <span className={`absolute inset-y-0 left-0 w-1 ${m.accent}`} />
                    <m.Icon
                      size={88}
                      strokeWidth={1.5}
                      className="pointer-events-none absolute -right-1 -top-1 text-ink/5 transition-opacity group-hover:text-ink/10"
                    />
                    {/* 호버 액션 */}
                    <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => togglePin(a)}
                        title={a.pinned ? '고정 해제' : '고정'}
                        className={`grid h-7 w-7 place-items-center rounded-md border border-hairline bg-card text-mute transition hover:text-brand ${
                          a.pinned ? 'text-brand' : ''
                        }`}
                      >
                        <Pin size={13} />
                      </button>
                      <button
                        onClick={() => remove(a)}
                        title="삭제"
                        className="grid h-7 w-7 place-items-center rounded-md border border-hairline bg-card text-mute transition hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="relative pl-2">
                      <span
                        className={`mb-4 inline-block rounded-md border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${m.chip}`}
                      >
                        {m.label}
                      </span>
                      <h3 className="font-display text-2xl font-bold leading-tight text-ink">{a.title}</h3>
                      <p
                        className={`mt-3 whitespace-pre-wrap text-sm leading-relaxed text-mute ${isOpen ? '' : 'line-clamp-2'}`}
                      >
                        {a.body}
                      </p>
                    </div>

                    <div className="relative mt-6 flex items-center justify-between pl-2">
                      <div className="flex items-center gap-2">
                        <Avatar info={author} />
                        <span className="font-mono text-[10px] uppercase tracking-wide text-mute">{author.name}</span>
                      </div>
                      <button
                        onClick={() => toggleExpand(a.id)}
                        className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-brand transition hover:gap-2"
                      >
                        {isOpen ? '접기' : '전문 보기'}
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 최근 공지 (RECENT BROADCASTS) ── */}
        <section className="mt-16">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <List size={18} className="text-mute" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-ink">
                최근 공지 / RECENT BROADCASTS
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {pills.map((p) => {
                const active = filter === p.key
                return (
                  <button
                    key={p.key}
                    onClick={() => setFilter(p.key)}
                    className={`rounded-lg border px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition ${
                      active
                        ? 'border-brand bg-brand text-white'
                        : 'border-hairline text-mute hover:border-brand/40 hover:text-brand'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-4">
            {paged.map((a) => {
              const m = META[a.priority] ?? META.normal
              const author = authorOf(a)
              return (
                <div
                  key={a.id}
                  className="group flex items-center gap-6 rounded-xl border border-l-2 border-hairline border-l-transparent bg-card p-5 shadow-raised transition hover:-translate-y-0.5 hover:border-l-brand"
                >
                  {/* 날짜 */}
                  <div className="w-12 shrink-0 text-center">
                    <p className={`font-mono text-2xl font-bold leading-none ${m.day}`}>{fmtDay(a.published_at)}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-mute">{fmtMonth(a.published_at)}</p>
                  </div>
                  {/* 본문 */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-3">
                      <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest ${m.chip}`}>
                        {m.label}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-wide text-mute">작성: {author.name}</span>
                      {a.pinned && <Pin size={11} className="text-brand" />}
                    </div>
                    <h4 className="truncate font-display text-lg font-semibold text-ink">{a.title}</h4>
                  </div>
                  {/* 우측 메타 + 액션 */}
                  <div className="hidden shrink-0 items-center gap-6 lg:flex">
                    <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-mute">
                      <span className={`h-2 w-2 rounded-full ${m.accent}`} />
                      {m.label}
                    </span>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() => togglePin(a)}
                        title={a.pinned ? '고정 해제' : '고정'}
                        className={`grid h-7 w-7 place-items-center rounded-md text-mute transition hover:text-brand ${
                          a.pinned ? 'text-brand' : ''
                        }`}
                      >
                        <Pin size={14} />
                      </button>
                      <button
                        onClick={() => remove(a)}
                        title="삭제"
                        className="grid h-7 w-7 place-items-center rounded-md text-mute transition hover:text-danger"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}

            {recent.length === 0 && (
              <p className="rounded-xl border border-dashed border-hairline py-12 text-center text-sm text-ash">
                {items.length === 0 ? '아직 공지가 없습니다.' : '해당 조건의 공지가 없습니다.'}
              </p>
            )}
          </div>

          {/* ── 페이지네이션 ── */}
          {totalPages > 1 && (
            <div className="mt-12 flex items-center justify-center gap-6">
              <button
                disabled={curPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="grid h-9 w-9 place-items-center rounded-lg border border-hairline text-mute transition hover:bg-brand/10 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex gap-2">
                {pageList(totalPages, curPage).map((n, i) =>
                  n === '…' ? (
                    <span key={`e${i}`} className="grid h-8 w-8 place-items-center text-mute">
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`grid h-8 w-8 place-items-center rounded-lg font-mono text-xs transition ${
                        n === curPage
                          ? 'bg-brand text-white'
                          : 'border border-hairline text-body hover:bg-brand/10 hover:text-brand'
                      }`}
                    >
                      {n}
                    </button>
                  ),
                )}
              </div>
              <button
                disabled={curPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="grid h-9 w-9 place-items-center rounded-lg border border-hairline text-mute transition hover:bg-brand/10 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Avatar({ info }: { info: AuthorInfo }) {
  if (info.avatar) {
    return <img src={info.avatar} alt={info.name} className="h-6 w-6 rounded-full object-cover" />
  }
  return (
    <span className="grid h-6 w-6 place-items-center rounded-full bg-bone font-mono text-[10px] font-bold text-mute">
      {info.name.slice(0, 1)}
    </span>
  )
}
