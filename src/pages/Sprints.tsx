import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Pencil,
  Plus,
  Target,
  CalendarDays,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { parseISO, differenceInCalendarDays, isValid } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useWorkspace } from '../store/workspace'
import type { Sprint, Ticket, Project, Profile } from '../lib/types'

const STATUS_LABEL: Record<string, string> = {
  planned: '예정',
  active: '진행 중',
  completed: '완료',
}
const STATUS_BADGE: Record<string, string> = {
  planned: 'rounded-full font-mono bg-bone text-ink',
  active: 'rounded-full font-mono bg-mint-soft text-mint-ink',
  completed: 'rounded-full font-mono bg-bone text-ash',
}
const COLS: { key: Ticket['status']; label: string }[] = [
  { key: 'open', label: '열림' },
  { key: 'in_progress', label: '진행 중' },
  { key: 'done', label: '완료' },
  { key: 'closed', label: '종료' },
]

// 우선순위 정렬·표시 (urgent > high > medium > low)
const PRIORITY_RANK: Record<Ticket['priority'], number> = { urgent: 3, high: 2, medium: 1, low: 0 }
const PRIORITY_LABEL: Record<Ticket['priority'], string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
}
const PRIORITY_CHIP: Record<Ticket['priority'], string> = {
  urgent: 'bg-danger-soft text-danger-ink',
  high: 'bg-brand-soft text-brand',
  medium: 'bg-info-soft text-info-ink',
  low: 'bg-bone text-ash',
}
const PRIORITY_ACCENT: Record<Ticket['priority'], string> = {
  urgent: 'bg-danger',
  high: 'bg-brand',
  medium: 'bg-info',
  low: 'bg-mint',
}

// 티켓의 작업량 단위: story_points 가 있으면 그 값, 없으면 1
function units(t: Ticket): number {
  return t.story_points != null ? t.story_points : 1
}
function isDone(t: Ticket): boolean {
  return t.status === 'done' || t.status === 'closed'
}
function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase()
}
function isOverdue(t: Ticket, now: Date): boolean {
  if (isDone(t) || !t.due_date) return false
  const due = parseISO(t.due_date)
  return isValid(due) && differenceInCalendarDays(due, now) < 0
}

function Avatar({ profile, size = 'h-7 w-7 text-[11px]' }: { profile?: Profile | null; size?: string }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        className={`${size} shrink-0 rounded-full object-cover ring-2 ring-card`}
      />
    )
  }
  const base = profile?.full_name ?? profile?.email ?? '?'
  const initial = base.trim().charAt(0).toUpperCase() || '?'
  return (
    <div
      className={`${size} grid shrink-0 place-items-center rounded-full bg-bone font-semibold text-charcoal ring-2 ring-card`}
      title={profile?.full_name ?? '미배정'}
    >
      {initial}
    </div>
  )
}

export default function Sprints() {
  const me = useAuth((s) => s.profile)
  void me
  const [projects, setProjects] = useState<Project[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', start_date: '', end_date: '', goal: '' })
  const [form, setForm] = useState({
    name: '',
    project_id: '',
    start_date: '',
    end_date: '',
    goal: '',
    status: 'planned' as Sprint['status'],
  })

  const wsId = useWorkspace((s) => s.currentId)

  async function loadAll() {
    let pjQ = supabase.from('projects').select('*').order('created_at')
    let spQ = supabase.from('sprints').select('*').order('created_at', { ascending: false })
    let tkQ = supabase.from('tickets').select('*').order('created_at', { ascending: false })
    if (wsId) {
      pjQ = pjQ.eq('workspace_id', wsId)
      spQ = spQ.eq('workspace_id', wsId)
      tkQ = tkQ.eq('workspace_id', wsId)
    }
    const memQ = wsId
      ? supabase.from('workspace_members').select('user_id').eq('workspace_id', wsId)
      : Promise.resolve({ data: [] as { user_id: string }[] })
    const [{ data: pj }, { data: sp }, { data: tk }, mem] = await Promise.all([pjQ, spQ, tkQ, memQ])
    const memberIds = ((mem.data as { user_id: string }[]) ?? []).map((m) => m.user_id)
    const { data: pr } = memberIds.length
      ? await supabase.from('profiles').select('*').in('id', memberIds)
      : { data: [] as Profile[] }
    setProjects((pj as Project[]) ?? [])
    const sprintList = (sp as Sprint[]) ?? []
    setSprints(sprintList)
    setTickets((tk as Ticket[]) ?? [])
    setProfiles((pr as Profile[]) ?? [])
    setSelectedId((cur) => (sprintList.some((s) => s.id === cur) ? cur : sprintList[0]?.id || ''))
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  async function createSprint(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: form.name,
      project_id: form.project_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      goal: form.goal || null,
      status: form.status,
      workspace_id: wsId,
    }
    const { data } = await supabase.from('sprints').insert(payload).select().single()
    setShowForm(false)
    setForm({ name: '', project_id: '', start_date: '', end_date: '', goal: '', status: 'planned' })
    await loadAll()
    if (data) setSelectedId((data as Sprint).id)
  }

  async function setSprintStatus(s: Sprint, status: Sprint['status']) {
    await supabase.from('sprints').update({ status }).eq('id', s.id)
    loadAll()
  }

  function startEdit(s: Sprint) {
    setEditForm({
      name: s.name,
      start_date: s.start_date ?? '',
      end_date: s.end_date ?? '',
      goal: s.goal ?? '',
    })
    setEditing(true)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    const { error } = await supabase
      .from('sprints')
      .update({
        name: editForm.name,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        goal: editForm.goal || null,
      })
      .eq('id', selectedId)
    if (error) {
      alert('수정 실패: ' + error.message)
      return
    }
    setEditing(false)
    loadAll()
  }

  async function deleteSprint(s: Sprint) {
    if (!confirm(`스프린트 "${s.name}" 를 삭제할까요? (소속 티켓은 백로그로 이동)`)) return
    const { error } = await supabase.from('sprints').delete().eq('id', s.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    if (selectedId === s.id) setSelectedId('')
    loadAll()
  }

  async function moveTicket(ticketId: string, sprintId: string | null) {
    await supabase.from('tickets').update({ sprint_id: sprintId }).eq('id', ticketId)
    loadAll()
  }

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of profiles) m.set(p.id, p)
    return m
  }, [profiles])

  const selected = sprints.find((s) => s.id === selectedId) || null
  const sprintTickets = useMemo(
    () => tickets.filter((t) => t.sprint_id === selectedId),
    [tickets, selectedId],
  )
  const backlog = useMemo(() => tickets.filter((t) => !t.sprint_id), [tickets])

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* 스프린트 목록 */}
      <div className="max-h-44 w-full shrink-0 overflow-y-auto border-b border-hairline bg-card p-3 lg:max-h-none lg:w-60 lg:border-b-0 lg:border-r">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-wide text-mute">스프린트</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            <Plus size={13} /> 새 스프린트
          </button>
        </div>

        {showForm && (
          <form onSubmit={createSprint} className="mb-3 space-y-2 rounded-xl border border-hairline bg-bone p-2">
            <input
              required
              placeholder="스프린트 이름"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-hairline bg-card px-2 py-1 text-sm"
            />
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              className="w-full rounded-lg border border-hairline bg-card px-2 py-1 text-sm"
            >
              <option value="">프로젝트 없음</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="block">
              <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-wide text-mute">시작일</span>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-lg border border-hairline bg-card px-2 py-1 font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-wide text-mute">종료일</span>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-lg border border-hairline bg-card px-2 py-1 font-mono text-xs"
              />
            </label>
            <input
              placeholder="목표 (선택)"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              className="w-full rounded-lg border border-hairline bg-card px-2 py-1 text-sm"
            />
            <button className="w-full rounded-lg bg-brand py-1 text-sm font-semibold text-white hover:bg-brand-dark">
              생성
            </button>
          </form>
        )}

        {sprints.map((s) => (
          <div key={s.id} className="group relative mb-1">
            <button
              onClick={() => setSelectedId(s.id)}
              className={`block w-full rounded-lg px-2 py-1.5 pr-7 text-left text-sm ${
                s.id === selectedId ? 'bg-bone font-semibold text-brand' : 'hover:bg-bone'
              }`}
            >
              <div className="truncate">{s.name}</div>
              <span className={`mt-0.5 inline-block px-1.5 text-[10px] ${STATUS_BADGE[s.status]}`}>
                {STATUS_LABEL[s.status]}
              </span>
            </button>
            <button
              onClick={() => deleteSprint(s)}
              className="absolute right-1.5 top-1.5 hidden text-ash hover:text-danger group-hover:block"
              title="스프린트 삭제"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {sprints.length === 0 && <p className="text-xs text-ash">스프린트가 없습니다.</p>}
      </div>

      {/* 본문 */}
      <div className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
        {!selected ? (
          <p className="text-sm text-ash">왼쪽에서 스프린트를 선택하거나 새로 만드세요.</p>
        ) : (
          <>
            {/* 헤더 */}
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 text-[11px] uppercase tracking-wide ${STATUS_BADGE[selected.status]}`}
                  >
                    {STATUS_LABEL[selected.status]}
                  </span>
                  {selected.start_date && selected.end_date && (
                    <span className="inline-flex items-center gap-1 font-mono text-xs text-ash">
                      <CalendarDays size={12} />
                      {selected.start_date} ~ {selected.end_date}
                    </span>
                  )}
                </div>
                <h1 className="font-display text-3xl font-bold leading-tight text-ink">{selected.name}</h1>
                {!editing && selected.goal && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-body">
                    <Target size={15} className="shrink-0 text-brand" /> {selected.goal}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selected.status}
                  onChange={(e) => setSprintStatus(selected, e.target.value as Sprint['status'])}
                  className="rounded-lg border border-hairline bg-card px-2.5 py-1.5 text-xs font-medium"
                >
                  <option value="planned">예정</option>
                  <option value="active">진행 중</option>
                  <option value="completed">완료</option>
                </select>
                <button
                  onClick={() => (editing ? setEditing(false) : startEdit(selected))}
                  className="flex items-center gap-1.5 rounded-lg border border-hairline bg-card px-3 py-1.5 text-xs font-semibold text-charcoal hover:border-ink/30"
                >
                  {editing ? (
                    '취소'
                  ) : (
                    <>
                      <Pencil size={13} /> 수정
                    </>
                  )}
                </button>
                <button
                  onClick={() => deleteSprint(selected)}
                  className="flex items-center gap-1.5 rounded-lg border border-hairline bg-card px-3 py-1.5 text-xs font-semibold text-ash hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 size={13} /> 삭제
                </button>
                {selected.status !== 'completed' && (
                  <button
                    onClick={() => setSprintStatus(selected, 'completed')}
                    className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
                  >
                    <CheckCircle2 size={14} /> 완료 처리
                  </button>
                )}
              </div>
            </div>

            {editing && (
              <form onSubmit={saveEdit} className="mb-6 grid max-w-md gap-2 rounded-xl border border-hairline bg-card p-4 shadow-raised">
                <input
                  required
                  placeholder="스프린트 이름"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="rounded-lg border border-hairline px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="font-mono text-[11px] uppercase tracking-wide text-mute">
                    시작일
                    <input
                      type="date"
                      value={editForm.start_date}
                      onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                      className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-1.5 font-mono text-xs"
                    />
                  </label>
                  <label className="font-mono text-[11px] uppercase tracking-wide text-mute">
                    종료일
                    <input
                      type="date"
                      value={editForm.end_date}
                      onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                      className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-1.5 font-mono text-xs"
                    />
                  </label>
                </div>
                <input
                  placeholder="목표 (선택)"
                  value={editForm.goal}
                  onChange={(e) => setEditForm({ ...editForm, goal: e.target.value })}
                  className="rounded-lg border border-hairline px-3 py-2 text-sm"
                />
                <button className="justify-self-start rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
                  저장
                </button>
              </form>
            )}

            {/* 상단 그래프 그리드 */}
            <div className="mb-4 grid gap-4 lg:grid-cols-3">
              <ProgressCard tickets={sprintTickets} />
              <div className="lg:col-span-2">
                <VelocityCard sprints={sprints} tickets={tickets} />
              </div>
            </div>

            {/* 시스템 알림 */}
            <SystemAlerts tickets={sprintTickets} />

            {/* Top Priority */}
            <TopPriority tickets={sprintTickets} profileMap={profileMap} />

            {/* 스프린트 보드 */}
            <h2 className="mb-2 mt-6 font-mono text-xs uppercase tracking-wide text-mute">
              스프린트 보드 <span>({sprintTickets.length})</span>
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
              {COLS.map((c) => {
                const list = sprintTickets.filter((t) => t.status === c.key)
                return (
                  <div
                    key={c.key}
                    className="w-[70%] shrink-0 rounded-xl border border-hairline bg-bone p-2 sm:w-[44%] lg:w-auto lg:shrink"
                  >
                    <div className="px-1 py-1 font-mono text-[11px] uppercase tracking-wide text-mute">
                      {c.label} <span className="text-ash">({list.length})</span>
                    </div>
                    <div className="space-y-2">
                      {list.map((t) => (
                        <div key={t.id} className="rounded-lg border border-hairline bg-card p-2 shadow-raised">
                          <div className="text-sm font-medium text-ink">{t.title}</div>
                          <div className="mt-1.5 flex items-center gap-2 text-[10px] text-ash">
                            <span className="font-mono uppercase tracking-wide">#{shortId(t.id)}</span>
                            {t.story_points != null && (
                              <span className="rounded-full bg-bone px-1.5 font-mono font-semibold text-charcoal">
                                {t.story_points}sp
                              </span>
                            )}
                            <button onClick={() => moveTicket(t.id, null)} className="ml-auto hover:text-danger">
                              백로그로
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 백로그 */}
            <h2 className="mb-2 mt-6 font-mono text-xs uppercase tracking-wide text-mute">
              백로그 <span>({backlog.length})</span>
            </h2>
            <div className="space-y-1.5">
              {backlog.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg border border-hairline bg-card px-3 py-2 shadow-raised"
                >
                  <span className={`h-6 w-1 shrink-0 rounded-full ${PRIORITY_ACCENT[t.priority]}`} />
                  <span className="flex-1 truncate text-sm text-ink">{t.title}</span>
                  <span className="hidden font-mono text-[10px] uppercase tracking-wide text-ash sm:inline">
                    #{shortId(t.id)}
                  </span>
                  {t.story_points != null && (
                    <span className="rounded-full bg-bone px-1.5 font-mono text-[10px] font-semibold text-charcoal">
                      {t.story_points}sp
                    </span>
                  )}
                  <button
                    onClick={() => moveTicket(t.id, selected.id)}
                    className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-dark"
                  >
                    스프린트에 추가
                  </button>
                </div>
              ))}
              {backlog.length === 0 && <p className="text-xs text-ash">백로그가 비었습니다.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// 전체 진행률 — 원형 진행률 링 + 하단 미니 스탯
function ProgressCard({ tickets }: { tickets: Ticket[] }) {
  const now = new Date()
  const total = tickets.reduce((s, t) => s + units(t), 0)
  const done = tickets.reduce((s, t) => s + (isDone(t) ? units(t) : 0), 0)
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const overdue = tickets.filter((t) => isOverdue(t, now)).length
  const stability =
    tickets.length > 0 ? Math.round(((tickets.length - overdue) / tickets.length) * 100) : 100

  const R = 52
  const C = 2 * Math.PI * R
  const offset = C * (1 - pct / 100)

  return (
    <div className="rounded-xl border border-hairline bg-card p-5 shadow-raised">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">전체 진행률</h3>
        <Activity size={16} className="text-brand" />
      </div>
      <p className="font-mono text-[10px] uppercase tracking-wide text-ash">COMPLETION MATRIX</p>

      {/* 원형 링 */}
      <div className="relative mx-auto my-5 h-44 w-44">
        <svg viewBox="0 0 120 120" className="-rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" className="stroke-bone" strokeWidth="12" />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            className="stroke-brand transition-all duration-700"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl font-extrabold text-ink">{pct}%</span>
          <span className="font-mono text-[10px] uppercase tracking-wide text-ash">COMPLETE</span>
        </div>
      </div>

      <p className="text-center text-xs text-mute">
        <span className="font-mono font-semibold text-ink">
          {done} / {total}
        </span>{' '}
        포인트 완료
      </p>

      {/* 미니 스탯 2개 */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-hairline pt-4">
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-wide text-mute">Velocity</div>
          <div className="mt-0.5 font-display text-lg font-bold text-brand">{done} pts</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-[10px] uppercase tracking-wide text-mute">Stability</div>
          <div className="mt-0.5 font-display text-lg font-bold text-mint-ink">{stability}%</div>
        </div>
      </div>
    </div>
  )
}

// 팀 벨로시티 — 최근 사이클별 막대 차트 (ACTUAL=brand · TARGET=mint)
function VelocityCard({ sprints, tickets }: { sprints: Sprint[]; tickets: Ticket[] }) {
  const cycles = useMemo(() => {
    const recent = [...sprints].slice(0, 6).reverse() // 오래된 → 최신
    return recent.map((s) => {
      const ts = tickets.filter((t) => t.sprint_id === s.id)
      const target = ts.reduce((a, t) => a + units(t), 0)
      const actual = ts.reduce((a, t) => a + (isDone(t) ? units(t) : 0), 0)
      return { id: s.id, name: s.name, target, actual }
    })
  }, [sprints, tickets])

  const max = Math.max(1, ...cycles.map((c) => Math.max(c.target, c.actual)))
  const h = (v: number) => `${Math.max(v > 0 ? 4 : 0, (v / max) * 100)}%`

  return (
    <div className="flex h-full flex-col rounded-xl border border-hairline bg-card p-5 shadow-raised">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-ink">팀 벨로시티</h3>
          <p className="font-mono text-[10px] uppercase tracking-wide text-ash">VELOCITY / CYCLE</p>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-ash">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-brand" /> Actual
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-mint" /> Target
          </span>
        </div>
      </div>

      {/* 막대 차트 */}
      <div className="mt-4 flex flex-1 items-end gap-3 sm:gap-5">
        {cycles.map((c) => (
          <div key={c.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-40 w-full items-end justify-center gap-1.5">
              <div
                className="w-3 rounded-t bg-brand transition-all sm:w-4"
                style={{ height: h(c.actual) }}
                title={`완료 ${c.actual} pts`}
              />
              <div
                className="w-3 rounded-t bg-mint transition-all sm:w-4"
                style={{ height: h(c.target) }}
                title={`계획 ${c.target} pts`}
              />
            </div>
            <span className="w-full truncate text-center font-mono text-[10px] uppercase tracking-wide text-ash">
              {c.name}
            </span>
          </div>
        ))}
        {cycles.length === 0 && (
          <p className="m-auto text-sm text-ash">표시할 사이클이 없습니다.</p>
        )}
      </div>
    </div>
  )
}

// 시스템 알림 — 마감 지난 미완료 작업 경고
function SystemAlerts({ tickets }: { tickets: Ticket[] }) {
  const now = new Date()
  const overdue = tickets.filter((t) => isOverdue(t, now))
  if (overdue.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-danger/40 bg-danger-soft/40 p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-danger-soft text-danger-ink">
          <AlertTriangle size={18} />
        </span>
        <div>
          <h3 className="font-display text-sm font-bold text-danger-ink">시스템 알림</h3>
          <p className="font-mono text-[10px] uppercase tracking-wide text-danger-ink/80">
            마감 초과 {overdue.length}건
          </p>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {overdue.slice(0, 4).map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-ink">{t.title}</span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-danger-ink">
              {t.due_date}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Top Priority — 우선순위 상위 항목 리스트
function TopPriority({
  tickets,
  profileMap,
}: {
  tickets: Ticket[]
  profileMap: Map<string, Profile>
}) {
  const top = [...tickets]
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority])
    .slice(0, 5)

  if (top.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-hairline bg-card p-5 shadow-raised">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-ink">Top Priority</h3>
        <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide text-mute">
          <TrendingUp size={12} /> {top.length} TASKS
        </span>
      </div>
      <div className="space-y-2">
        {top.map((t) => {
          const assignee = t.assignee_id ? profileMap.get(t.assignee_id) : null
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-lg border border-hairline bg-card px-3 py-2.5"
            >
              <span className={`h-9 w-1 shrink-0 rounded-full ${PRIORITY_ACCENT[t.priority]}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{t.title}</div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-ash">
                  #{shortId(t.id)}
                  {t.story_points != null && <span> · {t.story_points}sp</span>}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${PRIORITY_CHIP[t.priority]}`}
              >
                {PRIORITY_LABEL[t.priority]}
              </span>
              <Avatar profile={assignee} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
