import { useEffect, useMemo, useRef, useState } from 'react'
import { differenceInCalendarDays, format, addDays, max, min, parseISO } from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Project, GanttTask, GanttDependency } from '../lib/types'

const DAY_PX = 28
const ROW_H = 33 // border-b adds 1px; bar row content is 32px
const LABEL_W = 192 // w-48
const BAR_TOP = 6 // top-1.5
const BAR_H = 20 // h-5
const STATUS_COLOR: Record<GanttTask['status'], string> = {
  todo: 'bg-ash',
  doing: 'bg-brand',
  done: 'bg-success',
}

export default function Gantt() {
  const profile = useAuth((s) => s.profile)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [deps, setDeps] = useState<GanttDependency[]>([])
  const [depEditor, setDepEditor] = useState<string | null>(null) // task id whose "add dependency" picker is open
  const headerRef = useRef<HTMLDivElement>(null)

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
    if (!projectId) {
      setTasks([])
      setDeps([])
      return
    }
    let cancelled = false
    supabase
      .from('gantt_tasks')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')
      .then(({ data }) => {
        if (!cancelled) setTasks((data as GanttTask[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  // Load dependencies for the current project's tasks.
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const taskIdsKey = taskIds.join(',')
  useEffect(() => {
    if (taskIds.length === 0) {
      setDeps([])
      return
    }
    let cancelled = false
    supabase
      .from('gantt_dependencies')
      .select('*')
      .in('task_id', taskIds)
      .then(({ data }) => {
        if (!cancelled) setDeps((data as GanttDependency[]) ?? [])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdsKey])

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

  async function addDependency(taskId: string, dependsOnTaskId: string) {
    if (!dependsOnTaskId || dependsOnTaskId === taskId) return
    // prevent exact duplicate
    if (deps.some((d) => d.task_id === taskId && d.depends_on_task_id === dependsOnTaskId)) {
      setDepEditor(null)
      return
    }
    const { data } = await supabase
      .from('gantt_dependencies')
      .insert({ task_id: taskId, depends_on_task_id: dependsOnTaskId })
      .select()
      .single()
    if (data) setDeps((d) => [...d, data as GanttDependency])
    setDepEditor(null)
  }

  async function removeDependency(dep: GanttDependency) {
    await supabase.from('gantt_dependencies').delete().eq('id', dep.id)
    setDeps((list) => list.filter((d) => d.id !== dep.id))
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

  // index of each task within the rendered list, for y-coordinate computation
  const taskIndex = useMemo(() => {
    const m = new Map<string, number>()
    tasks.forEach((t, i) => m.set(t.id, i))
    return m
  }, [tasks])

  const taskById = useMemo(() => {
    const m = new Map<string, GanttTask>()
    tasks.forEach((t) => m.set(t.id, t))
    return m
  }, [tasks])

  // Geometry helpers in the timeline coordinate space (x=0 at the first day column).
  function barLeft(t: GanttTask) {
    return differenceInCalendarDays(parseISO(t.start_date), rangeStart) * DAY_PX
  }
  function barSpan(t: GanttTask) {
    return differenceInCalendarDays(parseISO(t.end_date), parseISO(t.start_date)) + 1
  }
  function barRight(t: GanttTask) {
    return barLeft(t) + barSpan(t) * DAY_PX - 4
  }
  function rowCenterY(taskId: string) {
    const i = taskIndex.get(taskId)
    if (i === undefined) return 0
    return i * ROW_H + BAR_TOP + BAR_H / 2
  }

  const timelineWidth = totalDays * DAY_PX
  const timelineHeight = tasks.length * ROW_H

  // Build the SVG connector paths: from predecessor's end -> successor's start.
  const connectors = useMemo(() => {
    const out: { id: string; d: string; x2: number; y2: number }[] = []
    for (const dep of deps) {
      const successor = taskById.get(dep.task_id)
      const predecessor = taskById.get(dep.depends_on_task_id)
      if (!successor || !predecessor) continue
      const x1 = barRight(predecessor)
      const y1 = rowCenterY(predecessor.id)
      const x2 = barLeft(successor)
      const y2 = rowCenterY(successor.id)
      // elbow path: out from predecessor end, over to a midpoint, then into successor start
      const midX = Math.max(x1 + 12, x2 - 12)
      const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`
      out.push({ id: dep.id, d, x2, y2 })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, taskById, taskIndex, rangeStart, totalDays])

  const depsByTask = useMemo(() => {
    const m = new Map<string, GanttDependency[]>()
    for (const d of deps) {
      const arr = m.get(d.task_id) ?? []
      arr.push(d)
      m.set(d.task_id, arr)
    }
    return m
  }, [deps])

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-bold">간트차트</h1>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-full border border-hairline px-2 py-1 text-sm">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={createProject} className="rounded-full border border-hairline px-3 py-1 text-sm hover:bg-bone">
          + 프로젝트
        </button>
        <button onClick={addTask} className="rounded-full bg-brand px-3 py-1 text-sm font-semibold text-white hover:bg-brand-dark" disabled={!projectId}>
          + 작업
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-hairline bg-white">
        <div className="inline-block min-w-full">
          {/* 날짜 헤더 */}
          <div className="flex border-b border-hairline bg-bone" ref={headerRef}>
            <div className="sticky left-0 z-20 w-48 shrink-0 border-r border-hairline bg-bone px-3 py-2 text-xs font-semibold text-mute">
              작업
            </div>
            {days.map((d, i) => (
              <div
                key={i}
                style={{ width: DAY_PX }}
                className="shrink-0 border-r border-hairline py-2 text-center font-mono text-[10px] text-ash"
              >
                {format(d, 'd')}
              </div>
            ))}
          </div>

          {/* 본문: 라벨 열 + 타임라인(+의존선 SVG 오버레이) */}
          <div className="flex">
            {/* 라벨 열 */}
            <div className="sticky left-0 z-10 w-48 shrink-0 border-r border-hairline bg-white">
              {tasks.map((t) => {
                const myDeps = depsByTask.get(t.id) ?? []
                const candidates = tasks.filter((c) => c.id !== t.id)
                return (
                  <div key={t.id} className="border-b border-hairline px-3 py-2 text-sm text-body" style={{ minHeight: ROW_H }}>
                    <div className="flex items-center">
                      <span className="truncate">{t.title}</span>
                      <button onClick={() => bump(t, 1)} className="ml-2 text-xs text-ash hover:text-brand" title="+1일">
                        +
                      </button>
                      <button onClick={() => bump(t, -1)} className="ml-1 text-xs text-ash hover:text-brand" title="-1일">
                        −
                      </button>
                      <button
                        onClick={() => setDepEditor((cur) => (cur === t.id ? null : t.id))}
                        className="ml-auto text-[10px] text-ash hover:text-brand"
                        title="의존 추가"
                      >
                        의존+
                      </button>
                    </div>

                    {/* 의존성 추가 셀렉터 */}
                    {depEditor === t.id && (
                      <div className="mt-1">
                        <select
                          defaultValue=""
                          onChange={(e) => addDependency(t.id, e.target.value)}
                          className="w-full rounded-full border border-hairline px-1 py-0.5 text-[11px]"
                        >
                          <option value="" disabled>
                            선행 작업 선택…
                          </option>
                          {candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 현재 의존성 목록 */}
                    {myDeps.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {myDeps.map((d) => {
                          const pre = taskById.get(d.depends_on_task_id)
                          return (
                            <span
                              key={d.id}
                              className="inline-flex items-center gap-1 rounded-full bg-bone px-1 text-[10px] text-mute"
                              title={`선행: ${pre?.title ?? '?'}`}
                            >
                              ← {pre?.title ?? '(삭제됨)'}
                              <button
                                onClick={() => removeDependency(d)}
                                className="text-ash hover:text-red-500"
                                title="의존성 삭제"
                              >
                                ×
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {tasks.length === 0 && <div className="p-6 text-sm text-ash">작업을 추가하세요.</div>}
            </div>

            {/* 타임라인 */}
            <div className="relative" style={{ width: timelineWidth, minWidth: timelineWidth }}>
              {/* 작업 막대 행 */}
              {tasks.map((t) => (
                <div key={t.id} className="relative border-b border-hairline" style={{ height: ROW_H }}>
                  <div
                    className={`absolute h-5 rounded ${STATUS_COLOR[t.status]} text-[10px] text-white`}
                    style={{ top: BAR_TOP, left: barLeft(t), width: barSpan(t) * DAY_PX - 4 }}
                    title={`${t.start_date} ~ ${t.end_date}`}
                  >
                    <span className="px-1 font-mono leading-5">{t.progress}%</span>
                  </div>
                </div>
              ))}

              {/* 의존선 SVG 오버레이 */}
              {connectors.length > 0 && (
                <svg
                  className="pointer-events-none absolute left-0 top-0"
                  width={timelineWidth}
                  height={timelineHeight}
                  style={{ overflow: 'visible' }}
                >
                  <defs>
                    <marker
                      id="gantt-arrow"
                      viewBox="0 0 10 10"
                      refX="8"
                      refY="5"
                      markerWidth="6"
                      markerHeight="6"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#575757" />
                    </marker>
                  </defs>
                  {connectors.map((c) => (
                    <path
                      key={c.id}
                      d={c.d}
                      fill="none"
                      stroke="#575757"
                      strokeWidth={1.5}
                      markerEnd="url(#gantt-arrow)"
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
