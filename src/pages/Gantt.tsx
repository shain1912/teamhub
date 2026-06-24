import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, format, addDays, max, min, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Project, GanttTask } from '../lib/types'

const DAY_PX = 28
const STATUS_COLOR: Record<GanttTask['status'], string> = {
  todo: 'bg-slate-400',
  doing: 'bg-brand',
  done: 'bg-green-500',
}

export default function Gantt() {
  const profile = useAuth((s) => s.profile)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [tasks, setTasks] = useState<GanttTask[]>([])

  useEffect(() => {
    supabase
      .from('projects')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        const list = (data as Project[]) ?? []
        setProjects(list)
        if (list[0]) setProjectId((p) => p || list[0].id)
      })
  }, [])

  useEffect(() => {
    if (!projectId) return
    supabase
      .from('gantt_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')
      .then(({ data }) => setTasks((data as GanttTask[]) ?? []))
  }, [projectId])

  async function createProject() {
    const name = prompt('새 프로젝트 이름')
    if (!name) return
    const { data } = await supabase.from('projects').insert({ name, owner_id: profile?.id }).select().single()
    if (data) {
      setProjects((p) => [...p, data as Project])
      setProjectId((data as Project).id)
    }
  }

  async function addTask() {
    const title = prompt('작업 이름')
    if (!title || !projectId) return
    const start = new Date()
    const task = {
      project_id: projectId,
      title,
      start_date: format(start, 'yyyy-MM-dd'),
      end_date: format(addDays(start, 3), 'yyyy-MM-dd'),
      sort_order: tasks.length,
    }
    const { data } = await supabase.from('gantt_tasks').insert(task).select().single()
    if (data) setTasks((t) => [...t, data as GanttTask])
  }

  async function bump(t: GanttTask, days: number) {
    const newEnd = format(addDays(parseISO(t.end_date), days), 'yyyy-MM-dd')
    await supabase.from('gantt_tasks').update({ end_date: newEnd }).eq('id', t.id)
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, end_date: newEnd } : x)))
  }

  const { rangeStart, totalDays } = useMemo(() => {
    if (tasks.length === 0) return { rangeStart: new Date(), totalDays: 14 }
    const starts = tasks.map((t) => parseISO(t.start_date))
    const ends = tasks.map((t) => parseISO(t.end_date))
    const s = min(starts)
    const e = max(ends)
    return { rangeStart: s, totalDays: Math.max(differenceInCalendarDays(e, s) + 2, 7) }
  }, [tasks])

  const days = Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i))

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold">간트차트</h1>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-lg border px-2 py-1 text-sm">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={createProject} className="rounded-lg border px-3 py-1 text-sm hover:bg-slate-50">
          + 프로젝트
        </button>
        <button onClick={addTask} className="rounded-lg bg-brand px-3 py-1 text-sm font-semibold text-white" disabled={!projectId}>
          + 작업
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-white">
        <div className="inline-block min-w-full">
          {/* 날짜 헤더 */}
          <div className="flex border-b bg-slate-50">
            <div className="sticky left-0 z-10 w-48 shrink-0 border-r bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
              작업
            </div>
            {days.map((d, i) => (
              <div
                key={i}
                style={{ width: DAY_PX }}
                className="shrink-0 border-r py-2 text-center text-[10px] text-slate-400"
              >
                {format(d, 'd')}
              </div>
            ))}
          </div>

          {/* 작업 행 */}
          {tasks.map((t) => {
            const offset = differenceInCalendarDays(parseISO(t.start_date), rangeStart)
            const span = differenceInCalendarDays(parseISO(t.end_date), parseISO(t.start_date)) + 1
            return (
              <div key={t.id} className="flex items-center border-b">
                <div className="sticky left-0 z-10 w-48 shrink-0 border-r bg-white px-3 py-2 text-sm">
                  {t.title}
                  <button onClick={() => bump(t, 1)} className="ml-2 text-xs text-slate-400 hover:text-brand" title="+1일">
                    +
                  </button>
                  <button onClick={() => bump(t, -1)} className="ml-1 text-xs text-slate-400 hover:text-brand" title="-1일">
                    −
                  </button>
                </div>
                <div className="relative flex-1 py-2" style={{ height: 32 }}>
                  <div
                    className={`absolute top-1.5 h-5 rounded ${STATUS_COLOR[t.status]} text-[10px] text-white`}
                    style={{ left: offset * DAY_PX, width: span * DAY_PX - 4 }}
                    title={`${t.start_date} ~ ${t.end_date}`}
                  >
                    <span className="px-1 leading-5">{t.progress}%</span>
                  </div>
                </div>
              </div>
            )
          })}
          {tasks.length === 0 && <div className="p-6 text-sm text-slate-400">작업을 추가하세요.</div>}
        </div>
      </div>
    </div>
  )
}
