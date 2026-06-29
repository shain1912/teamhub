import { useEffect, useMemo, useState } from 'react'
import {
  parseISO,
  eachDayOfInterval,
  differenceInCalendarDays,
  format,
  isValid,
} from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Sprint, Ticket, Project } from '../lib/types'

const STATUS_LABEL: Record<string, string> = {
  planned: '예정',
  active: '진행 중',
  completed: '완료',
}
const STATUS_BADGE: Record<string, string> = {
  planned: 'rounded-full font-mono bg-bone text-ink',
  active: 'rounded-full font-mono bg-green-100 text-green-700',
  completed: 'rounded-full font-mono bg-bone text-ash',
}
const COLS: { key: Ticket['status']; label: string }[] = [
  { key: 'open', label: '열림' },
  { key: 'in_progress', label: '진행 중' },
  { key: 'done', label: '완료' },
  { key: 'closed', label: '종료' },
]

// 티켓의 작업량 단위: story_points 가 있으면 그 값, 없으면 1
function units(t: Ticket): number {
  return t.story_points != null ? t.story_points : 1
}
function isDone(t: Ticket): boolean {
  return t.status === 'done' || t.status === 'closed'
}

export default function Sprints() {
  const me = useAuth((s) => s.profile)
  const [projects, setProjects] = useState<Project[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
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

  async function loadAll() {
    const [{ data: pj }, { data: sp }, { data: tk }] = await Promise.all([
      supabase.from('projects').select('*').order('created_at'),
      supabase.from('sprints').select('*').order('created_at', { ascending: false }),
      supabase.from('tickets').select('*').order('created_at', { ascending: false }),
    ])
    setProjects((pj as Project[]) ?? [])
    const sprintList = (sp as Sprint[]) ?? []
    setSprints(sprintList)
    setTickets((tk as Ticket[]) ?? [])
    setSelectedId((cur) => cur || sprintList[0]?.id || '')
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function createSprint(e: React.FormEvent) {
    e.preventDefault()
    const payload = {
      name: form.name,
      project_id: form.project_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      goal: form.goal || null,
      status: form.status,
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

  const selected = sprints.find((s) => s.id === selectedId) || null
  const sprintTickets = useMemo(
    () => tickets.filter((t) => t.sprint_id === selectedId),
    [tickets, selectedId],
  )
  const backlog = useMemo(() => tickets.filter((t) => !t.sprint_id), [tickets])

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* 스프린트 목록 */}
      <div className="max-h-44 w-full shrink-0 overflow-y-auto border-b border-hairline bg-white p-3 lg:max-h-none lg:w-60 lg:border-b-0 lg:border-r">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-mute">스프린트</h2>
          <button onClick={() => setShowForm((v) => !v)} className="text-xs font-semibold text-brand hover:underline">
            + 새 스프린트
          </button>
        </div>

        {showForm && (
          <form onSubmit={createSprint} className="mb-3 space-y-2 rounded-xl border border-hairline bg-bone p-2">
            <input
              required
              placeholder="스프린트 이름"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-full border border-hairline px-2 py-1 text-sm"
            />
            <select
              value={form.project_id}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              className="w-full rounded-full border border-hairline px-2 py-1 text-sm"
            >
              <option value="">프로젝트 없음</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-semibold text-mute">시작일</span>
              <input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-full border border-hairline px-2 py-1 font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-semibold text-mute">종료일</span>
              <input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full rounded-full border border-hairline px-2 py-1 font-mono text-xs"
              />
            </label>
            <input
              placeholder="목표 (선택)"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              className="w-full rounded-full border border-hairline px-2 py-1 text-sm"
            />
            <button className="w-full rounded-full bg-brand py-1 text-sm font-semibold text-white hover:bg-brand-dark">
              생성
            </button>
          </form>
        )}

        {sprints.map((s) => (
          <div key={s.id} className="group relative mb-1">
            <button
              onClick={() => setSelectedId(s.id)}
              className={`block w-full rounded-xl px-2 py-1.5 pr-7 text-left text-sm ${
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
              className="absolute right-1.5 top-1.5 hidden text-ash hover:text-red-500 group-hover:block"
              title="스프린트 삭제"
            >
              ✕
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
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-xl font-bold text-ink">{selected.name}</h1>
              <select
                value={selected.status}
                onChange={(e) => setSprintStatus(selected, e.target.value as Sprint['status'])}
                className="rounded-full border border-hairline px-2 py-1 text-sm"
              >
                <option value="planned">예정</option>
                <option value="active">진행 중</option>
                <option value="completed">완료</option>
              </select>
              {selected.start_date && selected.end_date && (
                <span className="font-mono text-sm text-ash">
                  {selected.start_date} ~ {selected.end_date}
                </span>
              )}
              <button
                onClick={() => (editing ? setEditing(false) : startEdit(selected))}
                className="rounded-full border border-hairline px-2 py-1 text-xs text-mute hover:border-ink/30"
              >
                {editing ? '취소' : '✏️ 수정'}
              </button>
            </div>

            {editing ? (
              <form onSubmit={saveEdit} className="mb-4 grid max-w-md gap-2 rounded-xl border border-hairline bg-white p-4">
                <input
                  required
                  placeholder="스프린트 이름"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="rounded-full border border-hairline px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-mute">
                    시작일
                    <input
                      type="date"
                      value={editForm.start_date}
                      onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                      className="mt-0.5 w-full rounded-full border border-hairline px-2 py-1.5 font-mono text-xs"
                    />
                  </label>
                  <label className="text-[11px] text-mute">
                    종료일
                    <input
                      type="date"
                      value={editForm.end_date}
                      onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                      className="mt-0.5 w-full rounded-full border border-hairline px-2 py-1.5 font-mono text-xs"
                    />
                  </label>
                </div>
                <input
                  placeholder="목표 (선택)"
                  value={editForm.goal}
                  onChange={(e) => setEditForm({ ...editForm, goal: e.target.value })}
                  className="rounded-full border border-hairline px-3 py-2 text-sm"
                />
                <button className="justify-self-start rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
                  저장
                </button>
              </form>
            ) : (
              selected.goal && <p className="mb-4 text-sm text-charcoal">🎯 {selected.goal}</p>
            )}

            <Burndown sprint={selected} tickets={sprintTickets} />

            {/* 스프린트 보드 */}
            <h2 className="mb-2 mt-6 text-sm font-semibold text-mute">
              스프린트 보드 <span className="font-mono">({sprintTickets.length})</span>
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
              {COLS.map((c) => {
                const list = sprintTickets.filter((t) => t.status === c.key)
                return (
                  <div key={c.key} className="w-[70%] shrink-0 rounded-xl bg-bone p-2 sm:w-[44%] lg:w-auto lg:shrink">
                    <div className="px-1 py-1 text-xs font-semibold text-mute">
                      {c.label} <span className="font-mono text-ash">({list.length})</span>
                    </div>
                    <div className="space-y-2">
                      {list.map((t) => (
                        <div key={t.id} className="rounded-xl border border-hairline bg-white p-2">
                          <div className="text-sm font-medium text-ink">{t.title}</div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-ash">
                            {t.story_points != null && (
                              <span className="rounded-full bg-bone px-1 font-mono font-semibold text-charcoal">
                                {t.story_points}sp
                              </span>
                            )}
                            <button onClick={() => moveTicket(t.id, null)} className="hover:text-red-500">
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
            <h2 className="mb-2 mt-6 text-sm font-semibold text-mute">백로그 <span className="font-mono">({backlog.length})</span></h2>
            <div className="space-y-1">
              {backlog.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-xl border border-hairline bg-white px-3 py-1.5">
                  <span className="flex-1 truncate text-sm">{t.title}</span>
                  {t.story_points != null && (
                    <span className="rounded-full bg-bone px-1 font-mono text-[10px] font-semibold text-charcoal">
                      {t.story_points}sp
                    </span>
                  )}
                  <button
                    onClick={() => moveTicket(t.id, selected.id)}
                    className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-brand-dark"
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

// 번다운 차트 (인라인 SVG) — 이상선(선형 소진) vs 실제 잔여 작업량
function Burndown({ sprint, tickets }: { sprint: Sprint; tickets: Ticket[] }) {
  const total = tickets.reduce((s, t) => s + units(t), 0)

  const days = useMemo(() => {
    if (!sprint.start_date || !sprint.end_date) return []
    const a = parseISO(sprint.start_date)
    const b = parseISO(sprint.end_date)
    if (!isValid(a) || !isValid(b) || differenceInCalendarDays(b, a) < 0) return []
    return eachDayOfInterval({ start: a, end: b })
  }, [sprint.start_date, sprint.end_date])

  if (days.length < 2 || total === 0) {
    return (
      <div className="rounded-xl border border-hairline bg-white p-4 text-sm text-ash">
        번다운: 스프린트 기간과 스토리포인트(또는 티켓)가 있어야 표시됩니다. (현재 총 {total} 단위)
      </div>
    )
  }

  const W = 560
  const H = 180
  const PAD = 28
  const n = days.length
  const x = (i: number) => PAD + (i / (n - 1)) * (W - PAD * 2)
  const y = (v: number) => PAD + (1 - v / total) * (H - PAD * 2)

  // 실제 잔여: 각 날짜 종료 시점 기준 미완료 티켓 작업량 합
  const remaining = days.map((d) => {
    const end = new Date(d)
    end.setHours(23, 59, 59, 999)
    return tickets.reduce((s, t) => {
      const doneByThen = isDone(t) && new Date(t.updated_at) <= end
      return s + (doneByThen ? 0 : units(t))
    }, 0)
  })
  const today = new Date()
  const idealPts = days.map((_, i) => `${x(i)},${y(total - (total * i) / (n - 1))}`).join(' ')
  const actualPts = days
    .map((d, i) => (parseISO(format(d, 'yyyy-MM-dd')) <= today ? `${x(i)},${y(remaining[i])}` : null))
    .filter(Boolean)
    .join(' ')

  return (
    <div className="rounded-xl border border-hairline bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">번다운</h3>
        <span className="font-mono text-xs text-ash">총 {total} 단위 · {n}일</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 축 */}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e2e8f0" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="#e2e8f0" />
        {/* 이상선 */}
        <polyline points={idealPts} fill="none" stroke="#bbbbbb" strokeDasharray="4 4" strokeWidth={2} />
        {/* 실제선 */}
        {actualPts && <polyline points={actualPts} fill="none" stroke="#ea2804" strokeWidth={2} />}
        {/* 시작/끝 라벨 */}
        <text x={PAD} y={H - 8} fontSize="9" fill="#94a3b8">
          {sprint.start_date}
        </text>
        <text x={W - PAD} y={H - 8} fontSize="9" fill="#94a3b8" textAnchor="end">
          {sprint.end_date}
        </text>
        <text x={6} y={y(total) + 3} fontSize="9" fill="#94a3b8">
          {total}
        </text>
        <text x={12} y={y(0) + 3} fontSize="9" fill="#94a3b8">
          0
        </text>
      </svg>
      <div className="flex gap-4 text-[11px] text-mute">
        <span className="text-stone">— 이상선(점선)</span>
        <span className="text-brand">— 실제 잔여</span>
      </div>
    </div>
  )
}
