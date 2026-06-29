import { useEffect, useMemo, useRef, useState } from 'react'
import { differenceInCalendarDays, format, addDays, max, min, parseISO } from 'date-fns'
import { Pencil, X, Trash2, ArrowLeft } from 'lucide-react'
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
  const [editorTask, setEditorTask] = useState<string | null>(null) // 편집 모달 대상 작업 id
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

  async function deleteTask(t: GanttTask) {
    if (!confirm(`작업 "${t.title}" 를 삭제할까요?`)) return
    const { error } = await supabase.from('gantt_tasks').delete().eq('id', t.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    setTasks((list) => list.filter((x) => x.id !== t.id))
  }

  async function deleteProject() {
    const p = projects.find((x) => x.id === projectId)
    if (!p) return
    if (!confirm(`프로젝트 "${p.name}" 와 모든 작업을 삭제할까요?`)) return
    const { error } = await supabase.from('projects').delete().eq('id', projectId)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    const rest = projects.filter((x) => x.id !== projectId)
    setProjects(rest)
    setProjectId(rest[0]?.id ?? '')
  }

  async function bump(t: GanttTask, days: number) {
    const newEnd = format(addDays(parseISO(t.end_date), days), 'yyyy-MM-dd')
    await supabase.from('gantt_tasks').update({ end_date: newEnd }).eq('id', t.id)
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, end_date: newEnd } : x)))
  }

  // 진행률(%) 변경 — 0~100 으로 보정, 100/0 이면 상태도 자동 동기화
  async function setProgress(t: GanttTask, value: number) {
    const progress = Math.max(0, Math.min(100, Math.round(value)))
    if (progress === t.progress) return
    const status: GanttTask['status'] = progress >= 100 ? 'done' : progress > 0 ? 'doing' : 'todo'
    await supabase.from('gantt_tasks').update({ progress, status }).eq('id', t.id)
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, progress, status } : x)))
  }

  async function addDependency(taskId: string, dependsOnTaskId: string) {
    if (!dependsOnTaskId || dependsOnTaskId === taskId) return
    // prevent exact duplicate
    if (deps.some((d) => d.task_id === taskId && d.depends_on_task_id === dependsOnTaskId)) return
    const { data } = await supabase
      .from('gantt_dependencies')
      .insert({ task_id: taskId, depends_on_task_id: dependsOnTaskId })
      .select()
      .single()
    if (data) setDeps((d) => [...d, data as GanttDependency])
  }

  // 작업 필드 일괄 수정(제목/시작일/종료일/상태)
  async function patchTask(t: GanttTask, patch: Partial<GanttTask>) {
    const { error } = await supabase.from('gantt_tasks').update(patch).eq('id', t.id)
    if (error) {
      alert('수정 실패: ' + error.message)
      return
    }
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, ...patch } : x)))
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
    <div className="flex h-full flex-col p-4 lg:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="whitespace-nowrap text-xl font-bold">간트차트</h1>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="rounded-lg border border-hairline px-2 py-1 text-sm">
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={createProject} className="rounded-lg border border-hairline px-3 py-1 text-sm hover:bg-bone">
          + 프로젝트
        </button>
        <button onClick={addTask} className="rounded-lg bg-brand px-3 py-1 text-sm font-semibold text-white hover:bg-brand-dark" disabled={!projectId}>
          + 작업
        </button>
        <button
          onClick={deleteProject}
          className="ml-auto rounded-lg border border-hairline px-3 py-1 text-sm text-mute hover:border-danger hover:text-danger"
          disabled={!projectId}
          title="프로젝트 삭제"
        >
          프로젝트 삭제
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-hairline bg-card">
        <div className="inline-block min-w-full">
          {/* 날짜 헤더 */}
          <div className="flex border-b border-hairline bg-bone" ref={headerRef}>
            <div className="sticky left-0 z-20 w-64 shrink-0 border-r border-hairline bg-bone px-3 py-2 text-xs font-semibold text-mute">
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
            <div className="sticky left-0 z-10 w-64 shrink-0 border-r border-hairline bg-card">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-1 border-b border-hairline px-3 text-sm text-body"
                  style={{ height: ROW_H }}
                >
                  <button
                    onClick={() => setEditorTask(t.id)}
                    title={t.title}
                    className="min-w-0 flex-1 truncate text-left hover:text-brand"
                  >
                    {t.title}
                  </button>
                  <span className="shrink-0 font-mono text-[10px] text-ash">{t.progress}%</span>
                  <button
                    onClick={() => setEditorTask(t.id)}
                    className="shrink-0 text-ash hover:text-brand"
                    title="작업 수정"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
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
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-charcoal" />
                    </marker>
                  </defs>
                  {connectors.map((c) => (
                    <path
                      key={c.id}
                      className="stroke-charcoal"
                      d={c.d}
                      fill="none"
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

      {/* 작업 편집 모달 — 레이아웃에 영향 없는 오버레이(행 정렬 보존) */}
      {editorTask &&
        (() => {
          const t = tasks.find((x) => x.id === editorTask)
          if (!t) return null
          const myDeps = depsByTask.get(t.id) ?? []
          const candidates = tasks.filter((c) => c.id !== t.id)
          return (
            <div
              className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
              onClick={() => setEditorTask(null)}
            >
              <div
                className="w-full max-w-sm space-y-3 rounded-2xl border border-hairline bg-card p-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-ink">작업 수정</h3>
                  <button onClick={() => setEditorTask(null)} className="text-ash hover:text-ink" aria-label="닫기">
                    <X size={18} />
                  </button>
                </div>

                <label className="block text-xs text-mute">
                  제목
                  <input
                    key={t.id}
                    defaultValue={t.title}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== t.title) patchTask(t, { title: v })
                    }}
                    className="mt-0.5 w-full rounded-lg border border-hairline px-3 py-2 text-sm text-ink"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-mute">
                    시작일
                    <input
                      type="date"
                      value={t.start_date}
                      onChange={(e) => e.target.value && patchTask(t, { start_date: e.target.value })}
                      className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-1.5 font-mono text-xs"
                    />
                  </label>
                  <label className="text-xs text-mute">
                    종료일
                    <input
                      type="date"
                      value={t.end_date}
                      min={t.start_date}
                      onChange={(e) => e.target.value && patchTask(t, { end_date: e.target.value })}
                      className="mt-0.5 w-full rounded-lg border border-hairline px-2 py-1.5 font-mono text-xs"
                    />
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-mute">진행률</span>
                  <button onClick={() => setProgress(t, t.progress - 10)} className="rounded border border-hairline px-2 hover:bg-bone">
                    −
                  </button>
                  <input
                    key={t.progress}
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={t.progress}
                    onBlur={(e) => setProgress(t, Number(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    className="w-14 rounded border border-hairline px-1 py-1 text-center font-mono text-sm"
                  />
                  <button onClick={() => setProgress(t, t.progress + 10)} className="rounded border border-hairline px-2 hover:bg-bone">
                    +
                  </button>
                  <span className="text-xs text-mute">%</span>
                  <select
                    value={t.status}
                    onChange={(e) => patchTask(t, { status: e.target.value as GanttTask['status'] })}
                    className="ml-auto rounded-lg border border-hairline px-2 py-1 text-xs"
                  >
                    <option value="todo">할일</option>
                    <option value="doing">진행</option>
                    <option value="done">완료</option>
                  </select>
                </div>

                <div>
                  <div className="mb-1 text-xs text-mute">선행 작업(의존)</div>
                  <div className="mb-1 flex flex-wrap gap-1">
                    {myDeps.map((d) => {
                      const pre = taskById.get(d.depends_on_task_id)
                      return (
                        <span key={d.id} className="inline-flex items-center gap-1 rounded-full bg-bone px-2 py-0.5 text-[11px] text-mute">
                          <ArrowLeft size={11} className="shrink-0" /> {pre?.title ?? '(삭제됨)'}
                          <button onClick={() => removeDependency(d)} className="text-ash hover:text-danger" aria-label="의존 제거">
                            <X size={11} />
                          </button>
                        </span>
                      )
                    })}
                    {myDeps.length === 0 && <span className="text-[11px] text-ash">없음</span>}
                  </div>
                  {candidates.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && addDependency(t.id, e.target.value)}
                      className="w-full rounded-lg border border-hairline px-2 py-1 text-xs"
                    >
                      <option value="">+ 선행 작업 추가…</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex justify-between pt-1">
                  <button
                    onClick={() => {
                      deleteTask(t)
                      setEditorTask(null)
                    }}
                    className="flex items-center gap-1 rounded-lg border border-hairline px-3 py-1.5 text-xs text-danger hover:bg-danger-soft"
                  >
                    <Trash2 size={13} /> 삭제
                  </button>
                  <button
                    onClick={() => setEditorTask(null)}
                    className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark"
                  >
                    완료
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
