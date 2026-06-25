import { supabase } from './supabase'

/**
 * AI 챗봇이 호출하는 도구 정의 + 실행기.
 * 모두 로그인한 사용자의 Supabase 세션(anon + RLS)으로 동작한다 — 즉 UI에서 직접 만드는 것과 동일 권한.
 * service_role 은 절대 프론트에 두지 않는다.
 */

export interface ToolCtx {
  /** 현재 로그인 사용자 id (reporter/owner 로 기록) */
  userId: string | null
}

// ---------- enum 정규화 (모델이 한글/변형을 줄 때 대비) ----------
function pick(map: Record<string, string>, val: unknown, dflt: string): string {
  if (typeof val !== 'string') return dflt
  const k = val.trim().toLowerCase()
  return map[k] ?? (Object.values(map).includes(k) ? k : dflt)
}
const PRIORITY = { 긴급: 'urgent', urgent: 'urgent', 높음: 'high', high: 'high', 중간: 'medium', 보통: 'medium', medium: 'medium', 낮음: 'low', low: 'low' }
const TICKET_TYPE = { epic: 'epic', 에픽: 'epic', story: 'story', 스토리: 'story', task: 'task', 작업: 'task', bug: 'bug', 버그: 'bug', subtask: 'subtask', 하위작업: 'subtask' }
const SPRINT_STATUS = { planned: 'planned', 예정: 'planned', active: 'active', 진행: 'active', '진행 중': 'active', completed: 'completed', 완료: 'completed' }
const GANTT_STATUS = { todo: 'todo', 할일: 'todo', doing: 'doing', 진행: 'doing', '진행 중': 'doing', done: 'done', 완료: 'done' }

// ---------- 해석 헬퍼 ----------
async function profileIdByPerson(ref?: string): Promise<string | null> {
  if (!ref) return null
  // 이메일 정확매칭 → 이름 정확매칭 → 이름 부분매칭
  const byEmail = await supabase.from('profiles').select('id').eq('email', ref).limit(1).maybeSingle()
  if (byEmail.data) return (byEmail.data as { id: string }).id
  const byName = await supabase.from('profiles').select('id').eq('full_name', ref).limit(1).maybeSingle()
  if (byName.data) return (byName.data as { id: string }).id
  const like = await supabase.from('profiles').select('id').ilike('full_name', `%${ref}%`).limit(1).maybeSingle()
  return (like.data as { id: string } | null)?.id ?? null
}

async function projectIdByName(ref?: string): Promise<string | null> {
  if (!ref) return null
  const exact = await supabase.from('projects').select('id').eq('name', ref).limit(1).maybeSingle()
  if (exact.data) return (exact.data as { id: string }).id
  const like = await supabase.from('projects').select('id').ilike('name', `%${ref}%`).limit(1).maybeSingle()
  return (like.data as { id: string } | null)?.id ?? null
}

async function sprintIdByName(ref?: string): Promise<string | null> {
  if (!ref) return null
  const exact = await supabase.from('sprints').select('id').eq('name', ref).limit(1).maybeSingle()
  if (exact.data) return (exact.data as { id: string }).id
  const like = await supabase.from('sprints').select('id').ilike('name', `%${ref}%`).limit(1).maybeSingle()
  return (like.data as { id: string } | null)?.id ?? null
}

// ---------- 컨텍스트 (시스템 프롬프트 주입용) ----------
export async function loadAiContext(): Promise<string> {
  const [{ data: pj }, { data: sp }, { data: pf }] = await Promise.all([
    supabase.from('projects').select('name').order('created_at'),
    supabase.from('sprints').select('name,status').order('created_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('full_name,email').limit(50),
  ])
  const projects = (pj ?? []).map((p: any) => p.name).join(', ') || '(없음)'
  const sprints = (sp ?? []).map((s: any) => `${s.name}(${s.status})`).join(', ') || '(없음)'
  const people = (pf ?? []).map((p: any) => `${p.full_name ?? '?'}<${p.email ?? ''}>`).join(', ') || '(없음)'
  return `현재 워크스페이스 데이터:\n- 프로젝트: ${projects}\n- 스프린트: ${sprints}\n- 팀원: ${people}`
}

// ---------- 도구 스키마 (OpenAI/GLM function calling) ----------
export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_ticket',
      description: '새 티켓(작업/버그 등)을 생성한다.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '티켓 제목' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          type: { type: 'string', enum: ['epic', 'story', 'task', 'bug', 'subtask'] },
          assignee: { type: 'string', description: '담당자 이름 또는 이메일' },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          sprint: { type: 'string', description: '연결할 스프린트 이름(선택)' },
          story_points: { type: 'number' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_sprint',
      description: '새 스프린트를 생성한다.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          project: { type: 'string', description: '프로젝트 이름(선택)' },
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD' },
          goal: { type: 'string' },
          status: { type: 'string', enum: ['planned', 'active', 'completed'] },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_project',
      description: '간트/스프린트가 속할 프로젝트를 생성한다.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_gantt_task',
      description: '간트차트 작업을 생성한다. 프로젝트가 반드시 있어야 한다(없으면 먼저 create_project).',
      parameters: {
        type: 'object',
        properties: {
          project: { type: 'string', description: '프로젝트 이름' },
          title: { type: 'string' },
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD' },
          progress: { type: 'number', description: '0-100' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
          assignee: { type: 'string', description: '담당자 이름 또는 이메일' },
        },
        required: ['project', 'title', 'start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_checklist',
      description: '체크리스트를 생성한다. items 로 항목을 함께 추가할 수 있다.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          items: { type: 'array', items: { type: 'string' }, description: '체크리스트 항목들(선택)' },
          project: { type: 'string', description: '프로젝트 이름(선택)' },
        },
        required: ['title'],
      },
    },
  },
] as const

// ---------- 실행기 ----------
export async function executeAiTool(
  name: string,
  args: any,
  ctx: ToolCtx,
): Promise<{ ok: boolean; summary: string }> {
  try {
    switch (name) {
      case 'create_ticket': {
        const assignee_id = await profileIdByPerson(args.assignee)
        const sprint_id = args.sprint ? await sprintIdByName(args.sprint) : null
        const { data, error } = await supabase
          .from('tickets')
          .insert({
            title: args.title,
            description: args.description ?? null,
            priority: pick(PRIORITY, args.priority, 'medium'),
            type: pick(TICKET_TYPE, args.type, 'task'),
            assignee_id,
            reporter_id: ctx.userId,
            due_date: args.due_date ?? null,
            sprint_id,
            story_points: args.story_points ?? null,
            labels: args.labels ?? [],
          })
          .select('id,title')
          .single()
        if (error) return { ok: false, summary: `티켓 생성 실패: ${error.message}` }
        return { ok: true, summary: `티켓 생성: "${(data as any).title}"` }
      }
      case 'create_sprint': {
        const project_id = args.project ? await projectIdByName(args.project) : null
        const { data, error } = await supabase
          .from('sprints')
          .insert({
            name: args.name,
            project_id,
            start_date: args.start_date ?? null,
            end_date: args.end_date ?? null,
            goal: args.goal ?? null,
            status: pick(SPRINT_STATUS, args.status, 'planned'),
          })
          .select('id,name')
          .single()
        if (error) return { ok: false, summary: `스프린트 생성 실패: ${error.message}` }
        return { ok: true, summary: `스프린트 생성: "${(data as any).name}"` }
      }
      case 'create_project': {
        const { data, error } = await supabase
          .from('projects')
          .insert({
            name: args.name,
            description: args.description ?? null,
            start_date: args.start_date ?? null,
            end_date: args.end_date ?? null,
          })
          .select('id,name')
          .single()
        if (error) return { ok: false, summary: `프로젝트 생성 실패: ${error.message}` }
        return { ok: true, summary: `프로젝트 생성: "${(data as any).name}"` }
      }
      case 'create_gantt_task': {
        const project_id = await projectIdByName(args.project)
        if (!project_id) return { ok: false, summary: `프로젝트를 찾을 수 없음: ${args.project}` }
        const assignee_id = await profileIdByPerson(args.assignee)
        const { count } = await supabase
          .from('gantt_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project_id)
        const { data, error } = await supabase
          .from('gantt_tasks')
          .insert({
            project_id,
            title: args.title,
            start_date: args.start_date,
            end_date: args.end_date,
            progress: args.progress ?? 0,
            status: pick(GANTT_STATUS, args.status, 'todo'),
            assignee_id,
            sort_order: count ?? 0,
          })
          .select('id,title')
          .single()
        if (error) return { ok: false, summary: `간트 작업 생성 실패: ${error.message}` }
        return { ok: true, summary: `간트 작업 생성: "${(data as any).title}"` }
      }
      case 'create_checklist': {
        const project_id = args.project ? await projectIdByName(args.project) : null
        const { data, error } = await supabase
          .from('checklists')
          .insert({ title: args.title, project_id, owner_id: ctx.userId })
          .select('id,title')
          .single()
        if (error) return { ok: false, summary: `체크리스트 생성 실패: ${error.message}` }
        const checklistId = (data as any).id
        const items: string[] = Array.isArray(args.items) ? args.items : []
        if (items.length) {
          const rows = items.map((content, i) => ({ checklist_id: checklistId, content, sort_order: i }))
          await supabase.from('checklist_items').insert(rows)
        }
        return { ok: true, summary: `체크리스트 생성: "${(data as any).title}" (항목 ${items.length}개)` }
      }
      default:
        return { ok: false, summary: `알 수 없는 도구: ${name}` }
    }
  } catch (e: any) {
    return { ok: false, summary: `오류: ${e?.message ?? e}` }
  }
}
