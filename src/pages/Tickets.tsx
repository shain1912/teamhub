import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type {
  Ticket,
  TicketComment,
  TicketStatus,
  TicketPriority,
  TicketType,
  Profile,
  Sprint,
} from '../lib/types'

const COLUMNS: { key: TicketStatus; label: string }[] = [
  { key: 'open', label: '열림' },
  { key: 'in_progress', label: '진행 중' },
  { key: 'done', label: '완료' },
  { key: 'closed', label: '종료' },
]

const PRIO: Record<TicketPriority, string> = {
  low: 'border-l-slate-300',
  medium: 'border-l-blue-400',
  high: 'border-l-mint',
  urgent: 'border-l-red-500',
}

const PRIO_LABEL: Record<TicketPriority, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  urgent: '긴급',
}

const TYPE_LABEL: Record<TicketType, string> = {
  epic: '에픽',
  story: '스토리',
  task: '작업',
  bug: '버그',
  subtask: '하위작업',
}

const TYPE_BADGE: Record<TicketType, string> = {
  epic: 'rounded-full font-mono lowercase bg-purple-100 text-purple-700',
  story: 'rounded-full font-mono lowercase bg-emerald-100 text-emerald-700',
  task: 'rounded-full font-mono lowercase bg-blue-100 text-blue-700',
  bug: 'rounded-full font-mono lowercase bg-red-100 text-red-700',
  subtask: 'rounded-full font-mono lowercase bg-bone text-charcoal',
}

const PRIORITIES: TicketPriority[] = ['low', 'medium', 'high', 'urgent']
const TYPES: TicketType[] = ['epic', 'story', 'task', 'bug', 'subtask']

function nameOf(map: Map<string, Profile>, id: string | null): string {
  if (!id) return '미지정'
  const p = map.get(id)
  return p?.full_name ?? p?.email ?? '미지정'
}

function parseLabels(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

interface FormState {
  title: string
  description: string
  type: TicketType
  priority: TicketPriority
  labels: string
  story_points: string
  assignee_id: string
  sprint_id: string
  parent_ticket_id: string
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  type: 'task',
  priority: 'medium',
  labels: '',
  story_points: '',
  assignee_id: '',
  sprint_id: '',
  parent_ticket_id: '',
}

export default function Tickets() {
  const me = useAuth((s) => s.profile)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [sprints, setSprints] = useState<Sprint[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 필터
  const [labelFilter, setLabelFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')

  // 드래그앤드롭
  const [dragOverCol, setDragOverCol] = useState<TicketStatus | null>(null)

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of profiles) m.set(p.id, p)
    return m
  }, [profiles])

  async function loadTickets() {
    const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false })
    setTickets((data as Ticket[]) ?? [])
  }

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setProfiles((data as Profile[]) ?? [])
  }

  async function loadSprints() {
    const { data } = await supabase.from('sprints').select('*').order('created_at', { ascending: false })
    setSprints((data as Sprint[]) ?? [])
  }

  useEffect(() => {
    loadTickets()
    loadProfiles()
    loadSprints()
    const ch = supabase
      .channel('tickets-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, loadTickets)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    const sp = form.story_points.trim() === '' ? null : Number(form.story_points)
    await supabase.from('tickets').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      priority: form.priority,
      labels: parseLabels(form.labels),
      story_points: sp !== null && !Number.isNaN(sp) ? sp : null,
      assignee_id: form.assignee_id || null,
      sprint_id: form.sprint_id || null,
      parent_ticket_id: form.parent_ticket_id || null,
      reporter_id: me?.id ?? null,
    })
    setForm(EMPTY_FORM)
    setOpen(false)
    loadTickets()
  }

  async function move(t: Ticket, status: TicketStatus) {
    await supabase.from('tickets').update({ status }).eq('id', t.id)
    setTickets((list) => list.map((x) => (x.id === t.id ? { ...x, status } : x)))
  }

  // 담당자 변경 시 베스트에포트 알림 + 감사 로그
  async function notifyAssignment(ticket: Ticket, assigneeId: string) {
    try {
      await supabase.from('notifications').insert({
        user_id: assigneeId,
        type: 'assignment',
        title: '티켓 배정: ' + ticket.title,
        link: '/tickets',
        entity_type: 'ticket',
        entity_id: ticket.id,
      })
    } catch {
      /* 실패 무시 */
    }
    try {
      await supabase.from('audit_log').insert({
        actor_id: me?.id ?? null,
        action: 'ticket.assign',
        entity_type: 'ticket',
        entity_id: ticket.id,
        detail: { assignee_id: assigneeId },
      })
    } catch {
      /* 실패 무시 */
    }
  }

  async function patchTicket(ticket: Ticket, patch: Partial<Ticket>) {
    const next = { ...ticket, ...patch }
    setTickets((list) => list.map((x) => (x.id === ticket.id ? next : x)))
    await supabase.from('tickets').update(patch).eq('id', ticket.id)
    if (
      Object.prototype.hasOwnProperty.call(patch, 'assignee_id') &&
      patch.assignee_id &&
      patch.assignee_id !== ticket.assignee_id
    ) {
      notifyAssignment(next, patch.assignee_id)
    }
    loadTickets()
  }

  async function deleteTicket(t: Ticket) {
    if (!confirm(`티켓 "${t.title}" 를 삭제할까요?`)) return
    const { error } = await supabase.from('tickets').delete().eq('id', t.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    setSelectedId(null)
    loadTickets()
  }

  const labelOptions = useMemo(() => {
    const set = new Set<string>()
    for (const t of tickets) for (const l of t.labels ?? []) set.add(l)
    return Array.from(set).sort()
  }, [tickets])

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (labelFilter && !(t.labels ?? []).includes(labelFilter)) return false
      if (assigneeFilter) {
        if (assigneeFilter === '__none__') {
          if (t.assignee_id) return false
        } else if (t.assignee_id !== assigneeFilter) {
          return false
        }
      }
      return true
    })
  }, [tickets, labelFilter, assigneeFilter])

  const selected = useMemo(() => tickets.find((t) => t.id === selectedId) ?? null, [tickets, selectedId])

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col p-4 lg:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-ink">티켓</h1>
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + 새 티켓
          </button>
        </div>

        {/* 필터 바 */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs font-semibold text-ash">필터</span>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-full border border-hairline px-2 py-1 text-sm"
          >
            <option value="">담당자: 전체</option>
            <option value="__none__">미지정</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.email ?? p.id}
              </option>
            ))}
          </select>
          <select
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            className="rounded-full border border-hairline px-2 py-1 text-sm"
          >
            <option value="">라벨: 전체</option>
            {labelOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {(labelFilter || assigneeFilter) && (
            <button
              onClick={() => {
                setLabelFilter('')
                setAssigneeFilter('')
              }}
              className="rounded-full border border-hairline px-2 py-1 text-xs text-mute hover:bg-bone"
            >
              초기화
            </button>
          )}
        </div>

        {open && (
          <form onSubmit={create} className="mb-4 grid gap-2 rounded-xl border border-hairline bg-white p-4 md:grid-cols-2">
            <input
              required
              placeholder="제목"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="rounded-full border border-hairline px-3 py-2 text-sm md:col-span-2"
            />
            <textarea
              placeholder="설명"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="rounded-xl border border-hairline px-3 py-2 text-sm md:col-span-2"
              rows={2}
            />
            <label className="text-xs text-mute">
              종류
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as TicketType })}
                className="mt-0.5 w-full rounded-full border border-hairline px-2 py-2 text-sm text-ink"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-mute">
              우선순위
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}
                className="mt-0.5 w-full rounded-full border border-hairline px-2 py-2 text-sm text-ink"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIO_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <input
              placeholder="라벨 (쉼표로 구분)"
              value={form.labels}
              onChange={(e) => setForm({ ...form, labels: e.target.value })}
              className="rounded-full border border-hairline px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="스토리 포인트"
              value={form.story_points}
              onChange={(e) => setForm({ ...form, story_points: e.target.value })}
              className="rounded-full border border-hairline px-3 py-2 text-sm"
            />
            <label className="text-xs text-mute">
              담당자
              <select
                value={form.assignee_id}
                onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
                className="mt-0.5 w-full rounded-full border border-hairline px-2 py-2 text-sm text-ink"
              >
                <option value="">미지정</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.email ?? p.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-mute">
              스프린트
              <select
                value={form.sprint_id}
                onChange={(e) => setForm({ ...form, sprint_id: e.target.value })}
                className="mt-0.5 w-full rounded-full border border-hairline px-2 py-2 text-sm text-ink"
              >
                <option value="">없음</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-mute md:col-span-2">
              부모 티켓
              <select
                value={form.parent_ticket_id}
                onChange={(e) => setForm({ ...form, parent_ticket_id: e.target.value })}
                className="mt-0.5 w-full rounded-full border border-hairline px-2 py-2 text-sm text-ink"
              >
                <option value="">없음</option>
                {tickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2 md:col-span-2">
              <button
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM)
                  setOpen(false)
                }}
                className="rounded-full border border-hairline px-4 py-2 text-sm text-charcoal hover:bg-bone"
              >
                취소
              </button>
              <button className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
                생성
              </button>
            </div>
          </form>
        )}

        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
          {COLUMNS.map((col) => {
            const list = filtered.filter((t) => t.status === col.key)
            const isDropTarget = dragOverCol === col.key
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverCol !== col.key) setDragOverCol(col.key)
                }}
                onDragLeave={(e) => {
                  // 컬럼 밖으로 완전히 벗어났을 때만 해제
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setDragOverCol((c) => (c === col.key ? null : c))
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverCol(null)
                  const id = e.dataTransfer.getData('text/plain')
                  if (!id) return
                  const t = tickets.find((x) => x.id === id)
                  if (t && t.status !== col.key) move(t, col.key)
                }}
                className={`flex min-h-0 w-[78%] shrink-0 flex-col rounded-xl bg-bone p-2 transition sm:w-[44%] lg:w-auto lg:shrink ${
                  isDropTarget ? 'bg-brand/10 ring-2 ring-brand' : ''
                }`}
              >
                <div className="px-1 py-1 text-xs font-semibold text-mute">
                  {col.label} <span className="font-mono text-ash">({list.length})</span>
                </div>
                <div className="space-y-2 overflow-y-auto">
                  {list.map((t) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', t.id)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onClick={() => setSelectedId(t.id)}
                      className={`cursor-pointer rounded-xl border border-hairline border-l-4 bg-white p-2 hover:border-stone active:cursor-grabbing ${PRIO[t.priority]} ${
                        selectedId === t.id ? 'ring-2 ring-brand' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className={`px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[t.type]}`}>
                          {TYPE_LABEL[t.type]}
                        </span>
                        {t.story_points != null && (
                          <span className="rounded-full bg-bone px-1.5 py-0.5 font-mono text-[10px] text-mute">
                            {t.story_points} SP
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-medium text-ink">{t.title}</div>
                      {(t.labels ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.labels.map((l) => (
                            <span key={l} className="rounded-full bg-bone px-1.5 py-0.5 text-[10px] text-charcoal">
                              {l}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-1.5 text-[11px] text-ash">
                        {nameOf(profileMap, t.assignee_id)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1" onClick={(e) => e.stopPropagation()}>
                        {COLUMNS.filter((c) => c.key !== t.status).map((c) => (
                          <button
                            key={c.key}
                            onClick={() => move(t, c.key)}
                            className="rounded-full bg-bone px-1.5 py-0.5 text-[10px] text-mute hover:bg-stone/40"
                          >
                            → {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {list.length === 0 && <div className="px-1 py-2 text-[11px] text-ash">없음</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {selected && (
        <DetailPanel
          key={selected.id}
          ticket={selected}
          allTickets={tickets}
          profiles={profiles}
          profileMap={profileMap}
          sprints={sprints}
          me={me}
          onClose={() => setSelectedId(null)}
          onSelect={(id) => setSelectedId(id)}
          onPatch={patchTicket}
          onDelete={deleteTicket}
        />
      )}
    </div>
  )
}

interface DetailProps {
  ticket: Ticket
  allTickets: Ticket[]
  profiles: Profile[]
  profileMap: Map<string, Profile>
  sprints: Sprint[]
  me: Profile | null
  onClose: () => void
  onSelect: (id: string) => void
  onPatch: (ticket: Ticket, patch: Partial<Ticket>) => void
  onDelete: (ticket: Ticket) => void
}

function DetailPanel({
  ticket,
  allTickets,
  profiles,
  profileMap,
  sprints,
  me,
  onClose,
  onSelect,
  onPatch,
  onDelete,
}: DetailProps) {
  const [comments, setComments] = useState<TicketComment[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [titleDraft, setTitleDraft] = useState(ticket.title)
  const [descDraft, setDescDraft] = useState(ticket.description ?? '')

  useEffect(() => {
    setTitleDraft(ticket.title)
    setDescDraft(ticket.description ?? '')
  }, [ticket.id, ticket.title, ticket.description])

  async function loadComments() {
    const { data } = await supabase
      .from('ticket_comments')
      .select('*, profiles(*)')
      .eq('ticket_id', ticket.id)
      .order('created_at')
    setComments((data as TicketComment[]) ?? [])
  }

  useEffect(() => {
    loadComments()
    const ch = supabase
      .channel('ticket-comments-' + ticket.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ticket_comments', filter: 'ticket_id=eq.' + ticket.id },
        loadComments,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.id])

  async function addComment(e: React.FormEvent) {
    e.preventDefault()
    const body = commentBody.trim()
    if (!body) return
    setCommentBody('')
    await supabase.from('ticket_comments').insert({ ticket_id: ticket.id, user_id: me?.id ?? null, body })
    loadComments()
  }

  function addLabel() {
    const v = newLabel.trim()
    if (!v) return
    const current = ticket.labels ?? []
    if (current.includes(v)) {
      setNewLabel('')
      return
    }
    onPatch(ticket, { labels: [...current, v] })
    setNewLabel('')
  }

  function removeLabel(label: string) {
    onPatch(ticket, { labels: (ticket.labels ?? []).filter((l) => l !== label) })
  }

  const subtasks = allTickets.filter((t) => t.parent_ticket_id === ticket.id)
  const parent = ticket.parent_ticket_id ? allTickets.find((t) => t.id === ticket.parent_ticket_id) : null

  return (
    <div className="fixed inset-0 z-40 flex w-full flex-col border-l border-hairline bg-white lg:static lg:z-auto lg:w-[26rem]">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className={`px-1.5 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[ticket.type]}`}>
          {TYPE_LABEL[ticket.type]}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => onDelete(ticket)}
            className="text-xs text-ash hover:text-red-500"
            title="티켓 삭제"
          >
            🗑 삭제
          </button>
          <button onClick={onClose} className="text-ash hover:text-ink" title="닫기">
            ✕
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* 제목 */}
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => {
            const v = titleDraft.trim()
            if (v && v !== ticket.title) onPatch(ticket, { title: v })
          }}
          className="w-full rounded-xl border border-hairline px-2 py-1.5 text-base font-semibold outline-none focus:border-brand"
        />

        {/* 부모 링크 */}
        {parent && (
          <div className="text-xs text-mute">
            부모:{' '}
            <button onClick={() => onSelect(parent.id)} className="text-brand hover:underline">
              {parent.title}
            </button>
          </div>
        )}

        {/* 설명 */}
        <div>
          <div className="mb-1 text-xs font-semibold text-ash">설명</div>
          <textarea
            value={descDraft}
            onChange={(e) => setDescDraft(e.target.value)}
            onBlur={() => {
              const v = descDraft.trim()
              if (v !== (ticket.description ?? '')) onPatch(ticket, { description: v || null })
            }}
            rows={3}
            className="w-full rounded-xl border border-hairline px-2 py-1.5 text-sm outline-none focus:border-brand"
            placeholder="설명 추가..."
          />
        </div>

        {/* 인라인 편집 필드 */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label className="text-mute">
            상태
            <select
              value={ticket.status}
              onChange={(e) => onPatch(ticket, { status: e.target.value as TicketStatus })}
              className="mt-0.5 w-full rounded-full border border-hairline px-2 py-1.5 text-sm text-ink"
            >
              {COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-mute">
            우선순위
            <select
              value={ticket.priority}
              onChange={(e) => onPatch(ticket, { priority: e.target.value as TicketPriority })}
              className="mt-0.5 w-full rounded-full border border-hairline px-2 py-1.5 text-sm text-ink"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIO_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-mute">
            종류
            <select
              value={ticket.type}
              onChange={(e) => onPatch(ticket, { type: e.target.value as TicketType })}
              className="mt-0.5 w-full rounded-full border border-hairline px-2 py-1.5 text-sm text-ink"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-mute">
            스토리 포인트
            <input
              type="number"
              defaultValue={ticket.story_points ?? ''}
              onBlur={(e) => {
                const raw = e.target.value.trim()
                const sp = raw === '' ? null : Number(raw)
                const val = sp !== null && !Number.isNaN(sp) ? sp : null
                if (val !== ticket.story_points) onPatch(ticket, { story_points: val })
              }}
              className="mt-0.5 w-full rounded-full border border-hairline px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="text-mute">
            담당자
            <select
              value={ticket.assignee_id ?? ''}
              onChange={(e) => onPatch(ticket, { assignee_id: e.target.value || null })}
              className="mt-0.5 w-full rounded-full border border-hairline px-2 py-1.5 text-sm text-ink"
            >
              <option value="">미지정</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.email ?? p.id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-mute">
            스프린트
            <select
              value={ticket.sprint_id ?? ''}
              onChange={(e) => onPatch(ticket, { sprint_id: e.target.value || null })}
              className="mt-0.5 w-full rounded-full border border-hairline px-2 py-1.5 text-sm text-ink"
            >
              <option value="">없음</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="text-xs text-ash">보고자: {nameOf(profileMap, ticket.reporter_id)}</div>

        {/* 라벨 */}
        <div>
          <div className="mb-1 text-xs font-semibold text-ash">라벨</div>
          <div className="flex flex-wrap items-center gap-1">
            {(ticket.labels ?? []).map((l) => (
              <span
                key={l}
                className="inline-flex items-center gap-1 rounded-full bg-bone px-1.5 py-0.5 text-[11px] text-charcoal"
              >
                {l}
                <button onClick={() => removeLabel(l)} className="text-ash hover:text-red-500" title="삭제">
                  ✕
                </button>
              </span>
            ))}
            {(ticket.labels ?? []).length === 0 && <span className="text-[11px] text-ash">없음</span>}
          </div>
          <div className="mt-1.5 flex gap-1">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addLabel()
                }
              }}
              placeholder="라벨 추가"
              className="flex-1 rounded-full border border-hairline px-2 py-1 text-sm"
            />
            <button onClick={addLabel} className="rounded-full border border-hairline px-2 text-sm hover:bg-bone">
              +
            </button>
          </div>
        </div>

        {/* 서브태스크 */}
        <div>
          <div className="mb-1 text-xs font-semibold text-ash">
            서브태스크 <span className="font-mono text-stone">({subtasks.length})</span>
          </div>
          <div className="space-y-1">
            {subtasks.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s.id)}
                className="flex w-full items-center gap-2 rounded-xl border border-hairline px-2 py-1.5 text-left text-sm hover:bg-bone"
              >
                <span className={`px-1 py-0.5 text-[10px] font-semibold ${TYPE_BADGE[s.type]}`}>
                  {TYPE_LABEL[s.type]}
                </span>
                <span className="flex-1 truncate">{s.title}</span>
                <span className="text-[10px] text-ash">
                  {COLUMNS.find((c) => c.key === s.status)?.label}
                </span>
              </button>
            ))}
            {subtasks.length === 0 && <div className="text-[11px] text-ash">없음</div>}
          </div>
        </div>

        {/* 코멘트 스레드 */}
        <div>
          <div className="mb-1 text-xs font-semibold text-ash">
            코멘트 <span className="font-mono text-stone">({comments.length})</span>
          </div>
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-xl bg-bone px-2 py-1.5 text-sm">
                <div className="text-[11px] text-ash">
                  <b className="text-charcoal">{c.profiles?.full_name ?? c.profiles?.email ?? '익명'}</b>{' '}
                  <span className="font-mono">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <div className="whitespace-pre-wrap">{c.body}</div>
              </div>
            ))}
            {comments.length === 0 && <div className="text-[11px] text-ash">아직 코멘트가 없습니다.</div>}
          </div>
          <form onSubmit={addComment} className="mt-2 flex gap-1">
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="코멘트 작성..."
              className="flex-1 rounded-full border border-hairline px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
            <button className="rounded-full bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
              작성
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
