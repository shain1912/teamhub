import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, format, addDays, max, min, parseISO } from 'date-fns'
import {
  Pencil,
  X,
  Trash2,
  ArrowLeft,
  Plus,
  FolderPlus,
  CheckCircle2,
  AlertTriangle,
  ListFilter,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Project, GanttTask, GanttDependency, Profile } from '../lib/types'

// ── 타임라인 기하 (Stitch 비율: 넉넉한 행/열) ──
const DAY_PX = 88
const ROW_H = 76
const LABEL_W = 320 // w-80
const BAR_H = 30
const BAR_TOP = (ROW_H - BAR_H) / 2

type Variant = 'done' | 'doing' | 'todo' | 'overdue'

export default function Gantt() {
  const profile = useAuth((s) => s.profile)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<string>('')
  const [tasks, setTasks] = useState<GanttTask[]>([])
  const [deps, setDeps] = useState<GanttDependency[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [editorTask, setEditorTask] = useState<string | null>(null) // 편집 모달 대상 작업 id

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

  // 담당자 아바타/역할 표시용 프로필 (읽기 전용, 데이터 보존엔 영향 없음)
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .then(({ data }) => setProfiles((data as Profile[]) ?? []))
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

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>()
    profiles.forEach((p) => m.set(p.id, p))
    return m
  }, [profiles])

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

  // 오늘(시간 무시) — 지연 판정·TODAY 라인 계산에 사용
  const today = useMemo(() => parseISO(format(new Date(), 'yyyy-MM-dd')), [])

  function variantOf(t: GanttTask): Variant {
    if (t.status === 'done' || t.progress >= 100) return 'done'
    const overdue = differenceInCalendarDays(parseISO(t.end_date), today) < 0
    if (overdue) return 'overdue'
    if (t.status === 'doing' || t.progress > 0) return 'doing'
    return 'todo'
  }

  // Geometry helpers in the timeline coordinate space (x=0 at the first day column).
  function barLeft(t: GanttTask) {
    return differenceInCalendarDays(parseISO(t.start_date), rangeStart) * DAY_PX
  }
  function barSpan(t: GanttTask) {
    return differenceInCalendarDays(parseISO(t.end_date), parseISO(t.start_date)) + 1
  }
  function barWidth(t: GanttTask) {
    return Math.max(barSpan(t) * DAY_PX - 8, 40)
  }
  function barRight(t: GanttTask) {
    return barLeft(t) + barWidth(t)
  }
  function rowCenterY(taskId: string) {
    const i = taskIndex.get(taskId)
    if (i === undefined) return 0
    return i * ROW_H + ROW_H / 2
  }

  const timelineWidth = totalDays * DAY_PX
  const timelineHeight = tasks.length * ROW_H

  // TODAY 세로 라인 위치
  const todayOffset = differenceInCalendarDays(today, rangeStart)
  const todayX = todayOffset * DAY_PX + DAY_PX / 2
  const todayInRange = todayOffset >= 0 && todayOffset < totalDays

  // 전체 완료율(평균 진행률) — 헤더 도넛
  const completion = useMemo(() => {
    if (tasks.length === 0) return 0
    return Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length)
  }, [tasks])

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

  const projectName = projects.find((p) => p.id === projectId)?.name

  // 완료율 도넛 기하
  const R = 16
  const C = 2 * Math.PI * R
  const dash = (C * completion) / 100

  return (
    <div className="relative flex h-full flex-col overflow-hidden p-4 lg:p-6">
      {/* 우하단 장식 블롭 (라이트=연한 라벤더 위 흐린 색면) */}
      <div className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-mint/15 blur-3xl" />
      <div className="pointer-events-none absolute bottom-16 right-40 h-60 w-60 rounded-full bg-brand/10 blur-3xl" />

      {/* ── 헤더: eyebrow + 큰 제목 + 완료율 카드 ── */}
      <header className="relative z-10 mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-brand">활성 로드맵</p>
          <h1 className="mt-1 truncate font-display text-3xl font-bold text-ink">{projectName ?? '간트차트'}</h1>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-hairline bg-card px-4 py-3 shadow-raised">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-mute">COMPLETION</p>
            <p className="font-display text-2xl font-bold text-brand">{completion}%</p>
          </div>
          <div className="relative h-11 w-11">
            <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
              <circle cx="20" cy="20" r={R} fill="none" strokeWidth="4" style={{ stroke: 'rgb(var(--brand) / 0.15)' }} />
              <circle
                cx="20"
                cy="20"
                r={R}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${C}`}
                style={{ stroke: 'rgb(var(--brand))' }}
              />
            </svg>
            <TrendingUp size={14} className="absolute inset-0 m-auto text-brand" />
          </div>
        </div>
      </header>

      {/* ── 컨트롤: 프로젝트 선택 + 생성/삭제 ── */}
      <div className="relative z-10 mb-4 flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-lg border border-hairline bg-card px-3 py-1.5 text-sm text-ink"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          onClick={createProject}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-card px-3 py-1.5 text-sm text-body hover:bg-bone"
        >
          <FolderPlus size={15} /> 프로젝트
        </button>
        <button
          onClick={addTask}
          disabled={!projectId}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
        >
          <Plus size={15} /> 작업 추가
        </button>
        <button
          onClick={deleteProject}
          disabled={!projectId}
          title="프로젝트 삭제"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-card px-3 py-1.5 text-sm text-mute hover:border-danger hover:text-danger disabled:opacity-40"
        >
          <Trash2 size={15} /> 프로젝트 삭제
        </button>
      </div>

      {/* ── 간트 테이블 ── */}
      <div className="relative z-10 min-h-0 flex-1 overflow-auto rounded-xl border border-hairline bg-card shadow-raised">
        <div className="inline-block min-w-full">
          {/* 헤더 행: 좌측 라벨 컬럼 + 날짜 컬럼 */}
          <div className="sticky top-0 z-30 flex border-b border-hairline bg-bone">
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center justify-between border-r border-hairline bg-bone px-4 py-3"
              style={{ width: LABEL_W }}
            >
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-mute">작업 & 담당자</span>
              <ListFilter size={15} className="text-ash" />
            </div>
            {days.map((d, i) => (
              <div
                key={i}
                style={{ width: DAY_PX }}
                className="shrink-0 border-r border-hairline py-3 text-center font-mono text-[10px] uppercase tracking-wider text-ash"
              >
                {format(d, 'MMM d')}
              </div>
            ))}
          </div>

          {/* 본문: 라벨 열 + 타임라인 */}
          <div className="flex">
            {/* 라벨 열 — 상태점 + 작업명 + 담당자 아바타/역할 */}
            <div className="sticky left-0 z-20 shrink-0 border-r border-hairline bg-card" style={{ width: LABEL_W }}>
              {tasks.map((t) => {
                const v = variantOf(t)
                const a = t.assignee_id ? profileById.get(t.assignee_id) : undefined
                const dotColor =
                  v === 'done' ? 'bg-mint' : v === 'doing' ? 'bg-brand' : v === 'overdue' ? 'bg-danger' : 'bg-info'
                return (
                  <div
                    key={t.id}
                    className={`group flex items-center gap-3 border-b border-hairline px-4 ${
                      v === 'overdue' ? 'bg-danger-soft/40' : ''
                    }`}
                    style={{ height: ROW_H }}
                  >
                    {/* 상태 점 / 지연 경고 */}
                    {v === 'overdue' ? (
                      <AlertTriangle size={14} className="shrink-0 text-danger" />
                    ) : (
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
                    )}

                    {/* 작업명 + 담당자 */}
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => setEditorTask(t.id)}
                        title={t.title}
                        className={`block w-full truncate text-left text-sm font-semibold hover:text-brand ${
                          v === 'overdue' ? 'text-danger-ink' : 'text-ink'
                        }`}
                      >
                        {t.title}
                      </button>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Avatar profile={a} />
                        <span className="truncate font-mono text-[10px] uppercase tracking-wide text-ash">
                          {v === 'overdue' && <span className="text-danger">지연 · </span>}
                          {a ? shortName(a) : '미배정'}
                          {a?.role ? ` · ${a.role}` : ''}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setEditorTask(t.id)}
                      className="shrink-0 text-ash opacity-0 transition hover:text-brand group-hover:opacity-100"
                      title="작업 수정"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                )
              })}
              {tasks.length === 0 && <div className="p-6 text-sm text-ash">작업을 추가하세요.</div>}
            </div>

            {/* 타임라인 */}
            <div
              className="relative"
              style={{ width: timelineWidth, minWidth: timelineWidth, minHeight: Math.max(timelineHeight, 120) }}
            >
              {/* 세로 그리드 라인 */}
              {days.map((_, i) => (
                <div
                  key={i}
                  className="absolute bottom-0 top-0 border-r border-hairline"
                  style={{ left: i * DAY_PX, width: DAY_PX }}
                />
              ))}

              {/* TODAY 세로 라인 */}
              {todayInRange && (
                <div className="pointer-events-none absolute bottom-0 top-0 z-20" style={{ left: todayX }}>
                  <div className="absolute inset-y-0 w-px" style={{ background: 'rgb(var(--brand))' }} />
                  <span className="absolute -left-px top-0 rounded-b-md bg-brand px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-white">
                    TODAY
                  </span>
                </div>
              )}

              {/* 의존선 SVG 오버레이 */}
              {connectors.length > 0 && (
                <svg
                  className="pointer-events-none absolute left-0 top-0 z-10"
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
                      <path d="M 0 0 L 10 5 L 0 10 z" className="fill-ash" />
                    </marker>
                  </defs>
                  {connectors.map((c) => (
                    <path
                      key={c.id}
                      className="stroke-ash"
                      d={c.d}
                      fill="none"
                      strokeWidth={1.5}
                      markerEnd="url(#gantt-arrow)"
                    />
                  ))}
                </svg>
              )}

              {/* 작업 막대 행 */}
              {tasks.map((t) => {
                const v = variantOf(t)
                return (
                  <div
                    key={t.id}
                    className={`relative border-b border-hairline ${v === 'overdue' ? 'bg-danger-soft/30' : ''}`}
                    style={{ height: ROW_H }}
                  >
                    <Bar variant={v} task={t} left={barLeft(t)} width={barWidth(t)} onOpen={() => setEditorTask(t.id)} />
                  </div>
                )
              })}
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
                  <h3 className="font-display font-semibold text-ink">작업 수정</h3>
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

                {/* 종료일 ±1일 빠른 조정 (기존 bump 핸들러 유지) */}
                <div className="flex items-center gap-2 text-xs text-mute">
                  <span>기간 조정</span>
                  <button onClick={() => bump(t, -1)} className="rounded border border-hairline px-2 py-0.5 hover:bg-bone">
                    종료 −1일
                  </button>
                  <button onClick={() => bump(t, 1)} className="rounded border border-hairline px-2 py-0.5 hover:bg-bone">
                    종료 +1일
                  </button>
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

// ── 담당자 이름 약식: "홍길동" -> "홍길동", 영문 "Lee Chen" -> "L. Chen" ──
function shortName(p: Profile): string {
  const base = (p.full_name ?? p.email ?? '?').trim()
  const parts = base.split(/\s+/)
  if (parts.length >= 2 && /^[A-Za-z]/.test(parts[0])) {
    return `${parts[0][0].toUpperCase()}. ${parts[parts.length - 1]}`
  }
  return base
}

function Avatar({ profile }: { profile?: Profile }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
  }
  const ch = (profile?.full_name ?? profile?.email ?? '?').trim().charAt(0).toUpperCase() || '?'
  return (
    <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bone font-mono text-[9px] font-bold text-charcoal">
      {ch}
    </div>
  )
}

// ── 타임라인 막대: 완료=mint / 진행=brand(진행률 2톤) / 지연=점선 danger / 대기=brand 옅게 ──
function Bar({
  variant,
  task,
  left,
  width,
  onOpen,
}: {
  variant: Variant
  task: GanttTask
  left: number
  width: number
  onOpen: () => void
}) {
  const base =
    'absolute z-10 flex items-center gap-1.5 overflow-hidden rounded-lg px-2 text-left transition hover:brightness-105'
  const style = { top: BAR_TOP, left, width, height: BAR_H }
  const title = `${task.title} · ${task.start_date} ~ ${task.end_date} · ${task.progress}%`

  if (variant === 'done') {
    return (
      <button
        onClick={onOpen}
        title={title}
        style={style}
        className={`${base} border border-mint/40 bg-mint-soft text-mint-ink`}
      >
        <CheckCircle2 size={14} className="shrink-0" />
        <span className="truncate font-mono text-[11px] font-bold uppercase tracking-wide">100% 완료</span>
      </button>
    )
  }

  if (variant === 'overdue') {
    return (
      <button
        onClick={onOpen}
        title={title}
        style={style}
        className={`${base} border-2 border-dashed border-danger bg-danger-soft/70 text-danger-ink`}
      >
        <AlertTriangle size={14} className="shrink-0" />
        <span className="truncate font-mono text-[11px] font-bold uppercase tracking-wide">
          지연 · {task.progress}%
        </span>
      </button>
    )
  }

  // doing / todo — brand 막대 위에 미진행 구간을 옅게 덮어 진행률 2톤 표현
  const remaining = Math.max(0, 100 - task.progress)
  return (
    <button onClick={onOpen} title={title} style={style} className={`${base} bg-brand text-white`}>
      {remaining > 0 && (
        <div className="absolute inset-y-0 right-0 bg-white/25" style={{ width: `${remaining}%` }} />
      )}
      <span className="relative truncate font-mono text-[11px] font-bold uppercase tracking-wide">
        {task.progress > 0 ? `${task.progress}% 진행` : '대기'}
      </span>
    </button>
  )
}
