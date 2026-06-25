import { supabase } from './supabase'

/**
 * AI 챗봇 도구 — TeamHub MCP 서버(server/src/index.ts)의 도구 세트를 차용.
 * 모두 로그인 사용자의 Supabase 세션(anon + RLS)으로 동작 = UI에서 직접 하는 것과 동일 권한.
 * MCP 와 달리 actor 는 항상 현재 로그인 사용자(ctx.userId)다(actor_email 인자 불필요).
 * 안전상 파괴적 delete 계열은 의도적으로 제외.
 */

export interface ToolCtx {
  userId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------- enum 정규화 (모델이 한글/변형을 줄 때 대비) ----------
function pick(map: Record<string, string>, val: unknown, dflt: string): string {
  if (typeof val !== 'string') return dflt
  const k = val.trim().toLowerCase()
  return map[k] ?? (Object.values(map).includes(k) ? k : dflt)
}
const PRIORITY = { 긴급: 'urgent', urgent: 'urgent', 높음: 'high', high: 'high', 중간: 'medium', 보통: 'medium', medium: 'medium', 낮음: 'low', low: 'low' }
const TICKET_TYPE = { epic: 'epic', 에픽: 'epic', story: 'story', 스토리: 'story', task: 'task', 작업: 'task', bug: 'bug', 버그: 'bug', subtask: 'subtask', 하위작업: 'subtask' }
const TICKET_STATUS = { open: 'open', 열림: 'open', in_progress: 'in_progress', 진행: 'in_progress', '진행 중': 'in_progress', done: 'done', 완료: 'done', closed: 'closed', 종료: 'closed' }
const SPRINT_STATUS = { planned: 'planned', 예정: 'planned', active: 'active', 진행: 'active', '진행 중': 'active', completed: 'completed', 완료: 'completed' }
const GANTT_STATUS = { todo: 'todo', 할일: 'todo', doing: 'doing', 진행: 'doing', '진행 중': 'doing', done: 'done', 완료: 'done' }
const ANN_PRIORITY = { normal: 'normal', 보통: 'normal', high: 'high', 높음: 'high', urgent: 'urgent', 긴급: 'urgent' }
const NOTI_TYPE = { mention: 'mention', assignment: 'assignment', follow_up: 'follow_up', system: 'system' }

// ---------- 해석 헬퍼 (이름/UUID → id) ----------
async function profileIdByPerson(ref?: string): Promise<string | null> {
  if (!ref) return null
  if (UUID.test(ref)) return ref
  const byEmail = await supabase.from('profiles').select('id').eq('email', ref).limit(1).maybeSingle()
  if (byEmail.data) return (byEmail.data as any).id
  const byName = await supabase.from('profiles').select('id').eq('full_name', ref).limit(1).maybeSingle()
  if (byName.data) return (byName.data as any).id
  const like = await supabase.from('profiles').select('id').ilike('full_name', `%${ref}%`).limit(1).maybeSingle()
  return (like.data as any)?.id ?? null
}
async function idByName(table: string, ref?: string, col = 'name'): Promise<string | null> {
  if (!ref) return null
  if (UUID.test(ref)) return ref
  const exact = await supabase.from(table).select('id').eq(col, ref).limit(1).maybeSingle()
  if (exact.data) return (exact.data as any).id
  const like = await supabase.from(table).select('id').ilike(col, `%${ref}%`).limit(1).maybeSingle()
  return (like.data as any)?.id ?? null
}
const channelId = (r?: string) => idByName('channels', r, 'name')
const projectId = (r?: string) => idByName('projects', r, 'name')
const sprintId = (r?: string) => idByName('sprints', r, 'name')
const ticketId = (r?: string) => idByName('tickets', r, 'title')
const checklistId = (r?: string) => idByName('checklists', r, 'title')

// ---------- 컨텍스트 (시스템 프롬프트 주입용) ----------
export async function loadAiContext(): Promise<string> {
  const [{ data: pj }, { data: sp }, { data: pf }, { data: ch }] = await Promise.all([
    supabase.from('projects').select('name').order('created_at'),
    supabase.from('sprints').select('name,status').order('created_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('full_name,email').limit(50),
    supabase.from('channels').select('name').order('created_at').limit(30),
  ])
  const j = (a: any[] | null, f: (x: any) => string) => (a ?? []).map(f).join(', ') || '(없음)'
  return [
    '현재 워크스페이스 데이터:',
    `- 프로젝트: ${j(pj, (p) => p.name)}`,
    `- 스프린트: ${j(sp, (s) => `${s.name}(${s.status})`)}`,
    `- 채널: ${j(ch, (c) => c.name)}`,
    `- 팀원: ${j(pf, (p) => `${p.full_name ?? '?'}<${p.email ?? ''}>`)}`,
  ].join('\n')
}

// ---------- 도구 스키마 (OpenAI/GLM function calling) ----------
const fn = (name: string, description: string, properties: any, required: string[] = []) => ({
  type: 'function' as const,
  function: { name, description, parameters: { type: 'object', properties, required } },
})
const S = { type: 'string' } as const
const N = { type: 'number' } as const
const B = { type: 'boolean' } as const
const ARR = { type: 'array', items: { type: 'string' } } as const

export const AI_TOOLS = [
  // 읽기
  fn('list_tickets', '티켓 목록을 반환한다. status 로 필터 가능.', { status: S }),
  fn('list_sprints', '스프린트 목록을 반환한다.', {}),
  fn('list_projects', '프로젝트 목록을 반환한다.', {}),
  fn('list_channels', '채널 목록을 반환한다.', {}),
  fn('list_people', '팀원(이름/이메일) 목록을 반환한다.', {}),
  fn('list_announcements', '공지 목록을 반환한다.', {}),
  fn('list_checklists', '체크리스트와 항목을 반환한다.', {}),
  fn('list_messages', '채널의 최근 메시지를 반환한다.', { channel: S, limit: N }, ['channel']),
  fn('list_notifications', '특정 사용자의 알림을 반환한다.', { person: S, only_unread: B }, ['person']),
  fn('search', '메시지·티켓·파일·공지를 통합 검색한다.', { query: S }, ['query']),
  // 채널 / 메시지
  fn('create_channel', '새 채널을 생성한다.', { name: S, description: S }, ['name']),
  fn('post_message', '채널에 메시지를 게시한다. channel 은 이름 또는 UUID.', { channel: S, body: S }, ['channel', 'body']),
  // 공지
  fn('post_announcement', '공지를 게시한다.', { title: S, body: S, priority: S, pinned: B, expires_at: S }, ['title', 'body']),
  // 티켓
  fn('create_ticket', '새 티켓을 생성한다.', {
    title: S, description: S, priority: S, type: S, assignee: S, due_date: S, sprint: S, story_points: N, labels: ARR,
  }, ['title']),
  fn('update_ticket', '티켓을 수정한다(상태·우선순위·담당자·마감일 등). ticket 은 제목 또는 UUID.', {
    ticket: S, status: S, priority: S, assignee: S, due_date: S, title: S, description: S,
  }, ['ticket']),
  fn('assign_ticket', '티켓 담당자를 지정한다(배정 알림 포함). ticket 은 제목/UUID, assignee 는 이름/이메일.', { ticket: S, assignee: S }, ['ticket', 'assignee']),
  fn('set_ticket_labels', '티켓 라벨 배열을 교체한다.', { ticket: S, labels: ARR }, ['ticket', 'labels']),
  fn('add_ticket_comment', '티켓에 댓글을 단다.', { ticket: S, body: S }, ['ticket', 'body']),
  fn('move_ticket_to_sprint', '티켓을 스프린트로 이동한다. sprint 가 비면 백로그로.', { ticket: S, sprint: S }, ['ticket']),
  // 스프린트 / 프로젝트 / 간트
  fn('create_sprint', '새 스프린트를 생성한다.', { name: S, project: S, start_date: S, end_date: S, goal: S, status: S }, ['name']),
  fn('create_project', '프로젝트를 생성한다.', { name: S, description: S, start_date: S, end_date: S }, ['name']),
  fn('create_gantt_task', '간트 작업을 생성한다. 프로젝트 필수(없으면 먼저 create_project).', {
    project: S, title: S, start_date: S, end_date: S, progress: N, status: S, assignee: S,
  }, ['project', 'title', 'start_date', 'end_date']),
  // 체크리스트
  fn('create_checklist', '체크리스트를 생성한다. items 로 항목 동시 추가.', { title: S, items: ARR, project: S }, ['title']),
  fn('add_checklist_item', '체크리스트에 항목을 추가한다. checklist 는 제목/UUID.', { checklist: S, content: S, due_date: S, assignee: S }, ['checklist', 'content']),
  fn('toggle_checklist_item', '체크리스트 항목 완료 여부를 설정한다.', { item_id: S, is_done: B }, ['item_id', 'is_done']),
  // 반응 / 알림
  fn('add_reaction', '메시지에 이모지 반응을 추가한다. message_id 는 UUID(list_messages 로 조회).', { message_id: S, emoji: S }, ['message_id', 'emoji']),
  fn('create_notification', '사용자에게 알림을 생성한다.', { person: S, type: S, title: S, body: S, link: S }, ['person', 'title']),
] as const

// ---------- 실행기 ----------
const okR = (summary: string) => ({ ok: true, summary })
const errR = (summary: string) => ({ ok: false, summary })

export async function executeAiTool(
  name: string,
  args: any,
  ctx: ToolCtx,
): Promise<{ ok: boolean; summary: string }> {
  try {
    switch (name) {
      // ---- 읽기 ----
      case 'list_tickets': {
        let q = supabase.from('tickets').select('id,title,status,priority').order('created_at', { ascending: false }).limit(50)
        if (args.status) q = q.eq('status', pick(TICKET_STATUS, args.status, 'open'))
        const { data, error } = await q
        return error ? errR(error.message) : okR(`티켓 ${data?.length ?? 0}건: ${(data ?? []).map((t: any) => t.title).slice(0, 15).join(', ')}`)
      }
      case 'list_sprints': {
        const { data, error } = await supabase.from('sprints').select('name,status').order('created_at', { ascending: false })
        return error ? errR(error.message) : okR(`스프린트: ${(data ?? []).map((s: any) => `${s.name}(${s.status})`).join(', ') || '없음'}`)
      }
      case 'list_projects': {
        const { data, error } = await supabase.from('projects').select('name').order('created_at')
        return error ? errR(error.message) : okR(`프로젝트: ${(data ?? []).map((p: any) => p.name).join(', ') || '없음'}`)
      }
      case 'list_channels': {
        const { data, error } = await supabase.from('channels').select('name').order('created_at')
        return error ? errR(error.message) : okR(`채널: ${(data ?? []).map((c: any) => c.name).join(', ') || '없음'}`)
      }
      case 'list_people': {
        const { data, error } = await supabase.from('profiles').select('full_name,email').limit(100)
        return error ? errR(error.message) : okR(`팀원: ${(data ?? []).map((p: any) => `${p.full_name ?? '?'}<${p.email ?? ''}>`).join(', ') || '없음'}`)
      }
      case 'list_announcements': {
        const { data, error } = await supabase.from('announcements').select('title,priority').order('published_at', { ascending: false }).limit(30)
        return error ? errR(error.message) : okR(`공지: ${(data ?? []).map((a: any) => a.title).join(', ') || '없음'}`)
      }
      case 'list_checklists': {
        const { data, error } = await supabase.from('checklists').select('title, checklist_items(content,is_done)').order('created_at', { ascending: false })
        return error ? errR(error.message) : okR(`체크리스트 ${data?.length ?? 0}개: ${(data ?? []).map((c: any) => c.title).join(', ')}`)
      }
      case 'list_messages': {
        const cid = await channelId(args.channel)
        if (!cid) return errR(`채널을 찾을 수 없음: ${args.channel}`)
        const { data, error } = await supabase
          .from('messages').select('body, profiles(full_name)').eq('channel_id', cid)
          .order('created_at', { ascending: false }).limit(Math.min(args.limit ?? 30, 200))
        if (error) return errR(error.message)
        return okR(`최근 ${data?.length ?? 0}개 메시지: ${(data ?? []).reverse().map((m: any) => m.body?.slice(0, 40)).join(' / ')}`)
      }
      case 'list_notifications': {
        const uid = await profileIdByPerson(args.person)
        if (!uid) return errR(`사용자를 찾을 수 없음: ${args.person}`)
        let q = supabase.from('notifications').select('title,is_read').eq('user_id', uid).order('created_at', { ascending: false }).limit(30)
        if (args.only_unread) q = q.eq('is_read', false)
        const { data, error } = await q
        return error ? errR(error.message) : okR(`알림 ${data?.length ?? 0}건: ${(data ?? []).map((n: any) => n.title).join(', ')}`)
      }
      case 'search': {
        const like = `%${args.query}%`
        const [m, t, a] = await Promise.all([
          supabase.from('messages').select('body').ilike('body', like).limit(10),
          supabase.from('tickets').select('title').or(`title.ilike.${like},description.ilike.${like}`).limit(10),
          supabase.from('announcements').select('title').or(`title.ilike.${like},body.ilike.${like}`).limit(10),
        ])
        return okR(`검색 "${args.query}" — 티켓 ${t.data?.length ?? 0}, 메시지 ${m.data?.length ?? 0}, 공지 ${a.data?.length ?? 0}`)
      }

      // ---- 채널 / 메시지 ----
      case 'create_channel': {
        const { data, error } = await supabase.from('channels').insert({ name: args.name, description: args.description ?? null }).select('name').single()
        return error ? errR(`채널 생성 실패: ${error.message}`) : okR(`채널 생성: "${(data as any).name}"`)
      }
      case 'post_message': {
        const cid = await channelId(args.channel)
        if (!cid) return errR(`채널을 찾을 수 없음: ${args.channel}`)
        const { error } = await supabase.from('messages').insert({ channel_id: cid, body: args.body, user_id: ctx.userId })
        return error ? errR(`메시지 게시 실패: ${error.message}`) : okR(`메시지 게시 → ${args.channel}`)
      }

      // ---- 공지 ----
      case 'post_announcement': {
        const { data, error } = await supabase.from('announcements').insert({
          title: args.title, body: args.body,
          priority: pick(ANN_PRIORITY, args.priority, 'normal'),
          pinned: args.pinned ?? true, expires_at: args.expires_at ?? null, author_id: ctx.userId,
        }).select('title').single()
        return error ? errR(`공지 실패: ${error.message}`) : okR(`공지 게시: "${(data as any).title}"`)
      }

      // ---- 티켓 ----
      case 'create_ticket': {
        const assignee_id = await profileIdByPerson(args.assignee)
        const sprint_id = args.sprint ? await sprintId(args.sprint) : null
        const { data, error } = await supabase.from('tickets').insert({
          title: args.title, description: args.description ?? null,
          priority: pick(PRIORITY, args.priority, 'medium'), type: pick(TICKET_TYPE, args.type, 'task'),
          assignee_id, reporter_id: ctx.userId, due_date: args.due_date ?? null, sprint_id,
          story_points: args.story_points ?? null, labels: args.labels ?? [],
        }).select('title').single()
        return error ? errR(`티켓 생성 실패: ${error.message}`) : okR(`티켓 생성: "${(data as any).title}"`)
      }
      case 'update_ticket': {
        const tid = await ticketId(args.ticket)
        if (!tid) return errR(`티켓을 찾을 수 없음: ${args.ticket}`)
        const patch: any = {}
        if (args.status) patch.status = pick(TICKET_STATUS, args.status, 'open')
        if (args.priority) patch.priority = pick(PRIORITY, args.priority, 'medium')
        if (args.due_date) patch.due_date = args.due_date
        if (args.title) patch.title = args.title
        if (args.description) patch.description = args.description
        if (args.assignee !== undefined) patch.assignee_id = await profileIdByPerson(args.assignee)
        if (!Object.keys(patch).length) return errR('수정할 내용이 없습니다.')
        const { data, error } = await supabase.from('tickets').update(patch).eq('id', tid).select('title').single()
        return error ? errR(`티켓 수정 실패: ${error.message}`) : okR(`티켓 수정: "${(data as any).title}"`)
      }
      case 'assign_ticket': {
        const tid = await ticketId(args.ticket)
        if (!tid) return errR(`티켓을 찾을 수 없음: ${args.ticket}`)
        const assignee_id = await profileIdByPerson(args.assignee)
        if (!assignee_id) return errR(`담당자를 찾을 수 없음: ${args.assignee}`)
        const { data, error } = await supabase.from('tickets').update({ assignee_id }).eq('id', tid).select('title').single()
        if (error) return errR(`배정 실패: ${error.message}`)
        await supabase.from('notifications').insert({
          user_id: assignee_id, type: 'assignment', title: '티켓이 배정되었습니다',
          body: (data as any).title, link: `/tickets?id=${tid}`, entity_type: 'ticket', entity_id: tid,
        })
        return okR(`티켓 배정: "${(data as any).title}" → ${args.assignee}`)
      }
      case 'set_ticket_labels': {
        const tid = await ticketId(args.ticket)
        if (!tid) return errR(`티켓을 찾을 수 없음: ${args.ticket}`)
        const { data, error } = await supabase.from('tickets').update({ labels: args.labels ?? [] }).eq('id', tid).select('title').single()
        return error ? errR(`라벨 설정 실패: ${error.message}`) : okR(`라벨 설정: "${(data as any).title}" [${(args.labels ?? []).join(', ')}]`)
      }
      case 'add_ticket_comment': {
        const tid = await ticketId(args.ticket)
        if (!tid) return errR(`티켓을 찾을 수 없음: ${args.ticket}`)
        const { error } = await supabase.from('ticket_comments').insert({ ticket_id: tid, body: args.body, user_id: ctx.userId })
        return error ? errR(`댓글 실패: ${error.message}`) : okR(`댓글 추가 → "${args.ticket}"`)
      }
      case 'move_ticket_to_sprint': {
        const tid = await ticketId(args.ticket)
        if (!tid) return errR(`티켓을 찾을 수 없음: ${args.ticket}`)
        let sid: string | null = null
        if (args.sprint) {
          sid = await sprintId(args.sprint)
          if (!sid) return errR(`스프린트를 찾을 수 없음: ${args.sprint}`)
        }
        const { data, error } = await supabase.from('tickets').update({ sprint_id: sid }).eq('id', tid).select('title').single()
        return error ? errR(`이동 실패: ${error.message}`) : okR(`"${(data as any).title}" → ${args.sprint ?? '백로그'}`)
      }

      // ---- 스프린트 / 프로젝트 / 간트 ----
      case 'create_sprint': {
        const project_id = args.project ? await projectId(args.project) : null
        const { data, error } = await supabase.from('sprints').insert({
          name: args.name, project_id, start_date: args.start_date ?? null, end_date: args.end_date ?? null,
          goal: args.goal ?? null, status: pick(SPRINT_STATUS, args.status, 'planned'),
        }).select('name').single()
        return error ? errR(`스프린트 실패: ${error.message}`) : okR(`스프린트 생성: "${(data as any).name}"`)
      }
      case 'create_project': {
        const { data, error } = await supabase.from('projects').insert({
          name: args.name, description: args.description ?? null, start_date: args.start_date ?? null, end_date: args.end_date ?? null,
        }).select('name').single()
        return error ? errR(`프로젝트 실패: ${error.message}`) : okR(`프로젝트 생성: "${(data as any).name}"`)
      }
      case 'create_gantt_task': {
        const pid = await projectId(args.project)
        if (!pid) return errR(`프로젝트를 찾을 수 없음: ${args.project}`)
        const assignee_id = await profileIdByPerson(args.assignee)
        const { count } = await supabase.from('gantt_tasks').select('id', { count: 'exact', head: true }).eq('project_id', pid)
        const { data, error } = await supabase.from('gantt_tasks').insert({
          project_id: pid, title: args.title, start_date: args.start_date, end_date: args.end_date,
          progress: args.progress ?? 0, status: pick(GANTT_STATUS, args.status, 'todo'), assignee_id, sort_order: count ?? 0,
        }).select('title').single()
        return error ? errR(`간트 작업 실패: ${error.message}`) : okR(`간트 작업 생성: "${(data as any).title}"`)
      }

      // ---- 체크리스트 ----
      case 'create_checklist': {
        const project_id = args.project ? await projectId(args.project) : null
        const { data, error } = await supabase.from('checklists').insert({ title: args.title, project_id, owner_id: ctx.userId }).select('id,title').single()
        if (error) return errR(`체크리스트 실패: ${error.message}`)
        const items: string[] = Array.isArray(args.items) ? args.items : []
        if (items.length) await supabase.from('checklist_items').insert(items.map((content, i) => ({ checklist_id: (data as any).id, content, sort_order: i })))
        return okR(`체크리스트 생성: "${(data as any).title}" (항목 ${items.length}개)`)
      }
      case 'add_checklist_item': {
        const cid = await checklistId(args.checklist)
        if (!cid) return errR(`체크리스트를 찾을 수 없음: ${args.checklist}`)
        const assignee_id = await profileIdByPerson(args.assignee)
        const { count } = await supabase.from('checklist_items').select('id', { count: 'exact', head: true }).eq('checklist_id', cid)
        const { error } = await supabase.from('checklist_items').insert({ checklist_id: cid, content: args.content, due_date: args.due_date ?? null, assignee_id, sort_order: count ?? 0 })
        return error ? errR(`항목 추가 실패: ${error.message}`) : okR(`항목 추가 → "${args.checklist}": ${args.content}`)
      }
      case 'toggle_checklist_item': {
        if (!UUID.test(args.item_id)) return errR(`잘못된 item_id: ${args.item_id}`)
        const { error } = await supabase.from('checklist_items').update({ is_done: args.is_done, completed_at: args.is_done ? new Date().toISOString() : null }).eq('id', args.item_id)
        return error ? errR(`토글 실패: ${error.message}`) : okR(`항목 ${args.is_done ? '완료' : '미완료'} 처리`)
      }

      // ---- 반응 / 알림 ----
      case 'add_reaction': {
        if (!UUID.test(args.message_id)) return errR(`잘못된 message_id: ${args.message_id}`)
        const { error } = await supabase.from('reactions').insert({ message_id: args.message_id, emoji: args.emoji, user_id: ctx.userId })
        return error ? errR(`반응 실패: ${error.message}`) : okR(`반응 추가: ${args.emoji}`)
      }
      case 'create_notification': {
        const uid = await profileIdByPerson(args.person)
        if (!uid) return errR(`사용자를 찾을 수 없음: ${args.person}`)
        const { error } = await supabase.from('notifications').insert({
          user_id: uid, type: pick(NOTI_TYPE, args.type, 'system'), title: args.title, body: args.body ?? null, link: args.link ?? null,
        })
        return error ? errR(`알림 실패: ${error.message}`) : okR(`알림 전송 → ${args.person}: "${args.title}"`)
      }

      default:
        return errR(`알 수 없는 도구: ${name}`)
    }
  } catch (e: any) {
    return errR(`오류: ${e?.message ?? e}`)
  }
}
