import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type {
  Ticket,
  TicketStatus,
  GanttTask,
  ChecklistItem,
  Project,
} from '../lib/types'

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: '열림',
  in_progress: '진행 중',
  done: '완료',
  closed: '종료',
}

const STATUS_CHIP: Record<TicketStatus, string> = {
  open: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  closed: 'bg-slate-200 text-slate-500',
}

const GANTT_LABEL: Record<GanttTask['status'], string> = {
  todo: '대기',
  doing: '진행',
  done: '완료',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString()
}

function dueClass(iso: string | null): string {
  if (!iso) return 'text-slate-400'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'text-slate-400'
  const now = new Date()
  if (d < now) return 'text-red-600 font-medium'
  const soon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3)
  if (d < soon) return 'text-amber-600 font-medium'
  return 'text-slate-500'
}

interface SectionCardProps {
  title: string
  count: number
  emptyText: string
  children: React.ReactNode
}

function SectionCard({ title, count, emptyText, children }: SectionCardProps) {
  return (
    <div className="flex flex-col rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-slate-400">{emptyText}</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </div>
  )
}

/**
 * 한 사용자(userId)에 대한 작업 대시보드 본문.
 * MyWork(나 자신)와 People 상세에서 공유한다.
 */
export function WorkBoard({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [ganttTasks, setGanttTasks] = useState<GanttTask[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [projects, setProjects] = useState<Record<string, Project>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [ticketRes, ganttRes, itemRes, projectRes] = await Promise.all([
        supabase.from('tickets').select('*').eq('assignee_id', userId),
        supabase.from('gantt_tasks').select('*').eq('assignee_id', userId),
        supabase.from('checklist_items').select('*').eq('assignee_id', userId),
        supabase.from('projects').select('*'),
      ])
      if (cancelled) return
      setTickets((ticketRes.data as Ticket[]) ?? [])
      setGanttTasks((ganttRes.data as GanttTask[]) ?? [])
      setItems((itemRes.data as ChecklistItem[]) ?? [])
      const map: Record<string, Project> = {}
      for (const p of ((projectRes.data as Project[]) ?? [])) map[p.id] = p
      setProjects(map)
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  // (1) 내 티켓 — 상태별 칩
  const ticketCounts = useMemo(() => {
    const c: Record<TicketStatus, number> = { open: 0, in_progress: 0, done: 0, closed: 0 }
    for (const t of tickets) c[t.status] = (c[t.status] ?? 0) + 1
    return c
  }, [tickets])

  // (2) 내 간트 작업 — 마감 임박순(완료 제외 우선)
  const upcomingGantt = useMemo(() => {
    return [...ganttTasks]
      .filter((t) => t.status !== 'done')
      .sort((a, b) => a.end_date.localeCompare(b.end_date))
  }, [ganttTasks])

  // (3) 미완료 체크리스트 항목
  const openItems = useMemo(() => {
    return items
      .filter((i) => !i.is_done)
      .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  }, [items])

  // (4) 다가오는 팔로업
  const followUps = useMemo(() => {
    return items
      .filter((i) => i.follow_up_at)
      .sort((a, b) => (a.follow_up_at ?? '').localeCompare(b.follow_up_at ?? ''))
  }, [items])

  if (loading) {
    return <p className="text-sm text-slate-400">불러오는 중…</p>
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* (1) 내 티켓 */}
      <SectionCard title="티켓" count={tickets.length} emptyText="배정된 티켓이 없습니다.">
        <li className="mb-2 flex flex-wrap gap-1.5">
          {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => (
            <span key={s} className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CHIP[s]}`}>
              {STATUS_LABEL[s]} {ticketCounts[s]}
            </span>
          ))}
        </li>
        {tickets.slice(0, 6).map((t) => (
          <li
            key={t.id}
            onClick={() => navigate('/tickets')}
            className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            <span className="truncate">{t.title}</span>
            <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_CHIP[t.status]}`}>
              {STATUS_LABEL[t.status]}
            </span>
          </li>
        ))}
        {tickets.length > 6 && (
          <li className="text-center text-xs text-slate-400">외 {tickets.length - 6}건</li>
        )}
      </SectionCard>

      {/* (2) 내 간트 작업 */}
      <SectionCard title="간트 작업" count={ganttTasks.length} emptyText="배정된 간트 작업이 없습니다.">
        {upcomingGantt.slice(0, 6).map((t) => (
          <li
            key={t.id}
            onClick={() => navigate('/gantt')}
            className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            <span className="min-w-0 flex-1 truncate">
              {t.title}
              <span className="ml-1 text-xs text-slate-400">
                {projects[t.project_id]?.name ?? '프로젝트'}
              </span>
            </span>
            <span className="ml-2 flex shrink-0 items-center gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                {GANTT_LABEL[t.status]}
              </span>
              <span className={`text-xs ${dueClass(t.end_date)}`}>{fmtDate(t.end_date)}</span>
            </span>
          </li>
        ))}
        {upcomingGantt.length === 0 && ganttTasks.length > 0 && (
          <li className="text-sm text-slate-400">진행 중인 작업이 없습니다.</li>
        )}
      </SectionCard>

      {/* (3) 미완료 체크리스트 항목 */}
      <SectionCard title="미완료 체크리스트" count={openItems.length} emptyText="미완료 항목이 없습니다.">
        {openItems.slice(0, 8).map((i) => (
          <li
            key={i.id}
            onClick={() => navigate('/checklists')}
            className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            <span className="min-w-0 flex-1 truncate">{i.content}</span>
            {i.due_date && (
              <span className={`ml-2 shrink-0 text-xs ${dueClass(i.due_date)}`}>{fmtDate(i.due_date)}</span>
            )}
          </li>
        ))}
        {openItems.length > 8 && (
          <li className="text-center text-xs text-slate-400">외 {openItems.length - 8}건</li>
        )}
      </SectionCard>

      {/* (4) 다가오는 팔로업 */}
      <SectionCard title="다가오는 팔로업" count={followUps.length} emptyText="예정된 팔로업이 없습니다.">
        {followUps.slice(0, 8).map((i) => (
          <li
            key={i.id}
            onClick={() => navigate('/checklists')}
            className="flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
          >
            <span className="min-w-0 flex-1 truncate">
              {i.content}
              {i.is_done && <span className="ml-1 text-[10px] text-green-600">(완료)</span>}
            </span>
            <span className={`ml-2 shrink-0 text-xs ${dueClass(i.follow_up_at)}`}>
              ⏰ {fmtDate(i.follow_up_at)}
            </span>
          </li>
        ))}
        {followUps.length > 8 && (
          <li className="text-center text-xs text-slate-400">외 {followUps.length - 8}건</li>
        )}
      </SectionCard>
    </div>
  )
}

export default function MyWork() {
  const me = useAuth((s) => s.profile)

  if (!me?.id) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">
          로그인 정보를 불러올 수 없습니다. 다시 로그인해 주세요.
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold">내 작업</h1>
        <p className="text-sm text-slate-500">
          {me.full_name ?? me.email ?? '나'} 님에게 배정된 작업 모음
        </p>
      </div>
      <WorkBoard userId={me.id} />
    </div>
  )
}
