#!/usr/bin/env node
/**
 * TeamHub MCP 서버
 *
 * 에이전트/LLM가 TeamHub(Supabase) 데이터를 도구 호출로 다룬다:
 * 채널/메시지, 공지, 티켓, 프로젝트/간트, 체크리스트의 읽기 + CRUD.
 * 추가: 티켓 댓글/라벨/배정, 스프린트, 반응, 알림, 통합 검색, 감사 로그.
 *
 * 요약 워크플로우: list_messages 로 대화를 읽어 에이전트가 직접 요약한 뒤
 * post_message 또는 post_announcement 로 게시한다.
 *
 * 인증: 서비스 롤 키로 동작(RLS 우회) — 신뢰된 내부 에이전트 백엔드 전용.
 * .env 에 SUPABASE_URL(또는 VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY 필요.
 */
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'
import cors from 'cors'
import { z } from 'zod'

// 프로젝트 루트(.env) 로드 — server/ 기준 한 단계 위
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../../.env') })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    '[teamhub-mcp] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 없습니다.\n' +
      'Supabase 대시보드 > Project Settings > API > service_role 키를 .env 에 추가하세요.',
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ---------- 헬퍼 ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}
function fail(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true }
}

/** 이름 또는 UUID 로 단일 행 id 를 해석한다. */
async function resolveId(table: string, ref: string, nameCol = 'name'): Promise<string | null> {
  if (UUID.test(ref)) return ref
  const { data } = await db.from(table).select('id').eq(nameCol, ref).limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function profileIdByEmail(email?: string): Promise<string | null> {
  if (!email) return null
  const { data } = await db.from('profiles').select('id').eq('email', email).limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/**
 * 도구를 모두 등록한 새 McpServer 인스턴스를 만든다.
 * HTTP(무상태) 모드에선 요청마다 새 인스턴스를 생성하므로 팩토리로 감쌌다.
 */
function buildServer() {
  const server = new McpServer({ name: 'teamhub', version: '0.1.0' })

// ===================== 채널 / 메시지 =====================
server.tool('list_channels', '모든 채널 목록을 반환한다.', {}, async () => {
  const { data, error } = await db.from('channels').select('*').order('created_at')
  return error ? fail(error.message) : ok(data)
})

server.tool(
  'create_channel',
  '새 채널을 생성한다.',
  { name: z.string(), description: z.string().optional() },
  async ({ name, description }) => {
    const { data, error } = await db.from('channels').insert({ name, description }).select().single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'list_messages',
  '채널의 최근 메시지를 시간순으로 반환한다. 요약/분석에 사용한다. channel 은 이름 또는 UUID.',
  { channel: z.string(), limit: z.number().int().min(1).max(500).default(100) },
  async ({ channel, limit }) => {
    const channelId = await resolveId('channels', channel)
    if (!channelId) return fail(`채널을 찾을 수 없음: ${channel}`)
    const { data, error } = await db
      .from('messages')
      .select('id, body, created_at, profiles(full_name, email)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return fail(error.message)
    return ok((data ?? []).reverse())
  },
)

server.tool(
  'post_message',
  '채널에 메시지를 게시한다. channel 은 이름 또는 UUID. actor_email 로 작성자를 지정할 수 있다.',
  { channel: z.string(), body: z.string(), actor_email: z.string().optional() },
  async ({ channel, body, actor_email }) => {
    const channelId = await resolveId('channels', channel)
    if (!channelId) return fail(`채널을 찾을 수 없음: ${channel}`)
    const user_id = await profileIdByEmail(actor_email)
    const { data, error } = await db
      .from('messages')
      .insert({ channel_id: channelId, body, user_id })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

// ===================== 공지 =====================
server.tool(
  'list_announcements',
  '공지 목록을 반환한다(고정 우선).',
  { include_expired: z.boolean().default(true) },
  async ({ include_expired }) => {
    let q = db.from('announcements').select('*').order('pinned', { ascending: false }).order('published_at', { ascending: false })
    if (!include_expired) q = q.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    const { data, error } = await q
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'post_announcement',
  '공지를 게시한다. 요약 결과를 공지로 올릴 때도 사용.',
  {
    title: z.string(),
    body: z.string(),
    priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
    pinned: z.boolean().default(true),
    expires_at: z.string().optional().describe('ISO 8601 만료 시각 (선택)'),
    actor_email: z.string().optional(),
  },
  async ({ title, body, priority, pinned, expires_at, actor_email }) => {
    const author_id = await profileIdByEmail(actor_email)
    const { data, error } = await db
      .from('announcements')
      .insert({ title, body, priority, pinned, expires_at, author_id })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool('delete_announcement', '공지를 삭제한다.', { id: z.string() }, async ({ id }) => {
  const { error } = await db.from('announcements').delete().eq('id', id)
  return error ? fail(error.message) : ok({ deleted: id })
})

// ===================== 티켓 =====================
server.tool(
  'list_tickets',
  '티켓 목록을 반환한다. status 로 필터 가능.',
  { status: z.enum(['open', 'in_progress', 'done', 'closed']).optional() },
  async ({ status }) => {
    let q = db.from('tickets').select('*').order('created_at', { ascending: false })
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'create_ticket',
  '티켓을 생성한다.',
  {
    title: z.string(),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    assignee_email: z.string().optional(),
    reporter_email: z.string().optional(),
    due_date: z.string().optional().describe('YYYY-MM-DD'),
    channel: z.string().optional().describe('연동 채널 이름 또는 UUID'),
  },
  async ({ title, description, priority, assignee_email, reporter_email, due_date, channel }) => {
    const assignee_id = await profileIdByEmail(assignee_email)
    const reporter_id = await profileIdByEmail(reporter_email)
    const channel_id = channel ? await resolveId('channels', channel) : null
    const { data, error } = await db
      .from('tickets')
      .insert({ title, description, priority, assignee_id, reporter_id, due_date, channel_id })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'update_ticket',
  '티켓을 수정한다(상태 이동, 담당자 변경 등). 전달한 필드만 갱신된다.',
  {
    id: z.string(),
    status: z.enum(['open', 'in_progress', 'done', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    assignee_email: z.string().optional(),
    due_date: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
  },
  async ({ id, status, priority, assignee_email, due_date, title, description }) => {
    const patch: Record<string, unknown> = {}
    if (status) patch.status = status
    if (priority) patch.priority = priority
    if (due_date) patch.due_date = due_date
    if (title) patch.title = title
    if (description) patch.description = description
    if (assignee_email !== undefined) patch.assignee_id = await profileIdByEmail(assignee_email)
    if (Object.keys(patch).length === 0) return fail('수정할 필드가 없습니다.')
    const { data, error } = await db.from('tickets').update(patch).eq('id', id).select().single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool('delete_ticket', '티켓을 삭제한다.', { id: z.string() }, async ({ id }) => {
  const { error } = await db.from('tickets').delete().eq('id', id)
  return error ? fail(error.message) : ok({ deleted: id })
})

// ===================== 티켓 댓글 / 라벨 / 배정 =====================
server.tool(
  'add_ticket_comment',
  '티켓에 댓글을 추가한다. actor_email 로 작성자를 지정할 수 있다.',
  { ticket_id: z.string(), body: z.string(), actor_email: z.string().optional() },
  async ({ ticket_id, body, actor_email }) => {
    if (!UUID.test(ticket_id)) return fail(`잘못된 ticket_id(UUID 아님): ${ticket_id}`)
    const user_id = await profileIdByEmail(actor_email)
    const { data, error } = await db
      .from('ticket_comments')
      .insert({ ticket_id, body, user_id })
      .select('*, profiles(*)')
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'list_ticket_comments',
  '티켓의 댓글을 시간순으로 반환한다.',
  { ticket_id: z.string() },
  async ({ ticket_id }) => {
    if (!UUID.test(ticket_id)) return fail(`잘못된 ticket_id(UUID 아님): ${ticket_id}`)
    const { data, error } = await db
      .from('ticket_comments')
      .select('*, profiles(*)')
      .eq('ticket_id', ticket_id)
      .order('created_at', { ascending: true })
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'set_ticket_labels',
  '티켓의 라벨 배열을 교체한다(전체 덮어쓰기).',
  { ticket_id: z.string(), labels: z.array(z.string()) },
  async ({ ticket_id, labels }) => {
    if (!UUID.test(ticket_id)) return fail(`잘못된 ticket_id(UUID 아님): ${ticket_id}`)
    const { data, error } = await db
      .from('tickets')
      .update({ labels })
      .eq('id', ticket_id)
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'assign_ticket',
  '티켓 담당자를 지정한다. 담당자에게 배정 알림과 감사 로그를 남긴다.',
  { ticket_id: z.string(), assignee_email: z.string() },
  async ({ ticket_id, assignee_email }) => {
    if (!UUID.test(ticket_id)) return fail(`잘못된 ticket_id(UUID 아님): ${ticket_id}`)
    const assignee_id = await profileIdByEmail(assignee_email)
    if (!assignee_id) return fail(`담당자를 찾을 수 없음: ${assignee_email}`)
    const { data, error } = await db
      .from('tickets')
      .update({ assignee_id })
      .eq('id', ticket_id)
      .select()
      .single()
    if (error) return fail(error.message)
    const ticket = data as { id: string; title?: string } | null
    // 배정 알림
    await db.from('notifications').insert({
      user_id: assignee_id,
      type: 'assignment',
      title: '티켓이 배정되었습니다',
      body: ticket?.title ?? null,
      link: `/tickets?id=${ticket_id}`,
      entity_type: 'ticket',
      entity_id: ticket_id,
    })
    // 감사 로그
    await db.from('audit_log').insert({
      actor_id: assignee_id,
      action: 'assign_ticket',
      entity_type: 'ticket',
      entity_id: ticket_id,
      detail: { assignee_email },
    })
    return ok(data)
  },
)

// ===================== 스프린트 =====================
server.tool(
  'create_sprint',
  '스프린트를 생성한다. project 는 이름 또는 UUID(선택), 날짜는 YYYY-MM-DD.',
  {
    name: z.string(),
    project: z.string().optional().describe('프로젝트 이름 또는 UUID'),
    start_date: z.string().optional().describe('YYYY-MM-DD'),
    end_date: z.string().optional().describe('YYYY-MM-DD'),
    goal: z.string().optional(),
    status: z.enum(['planned', 'active', 'completed']).default('planned'),
  },
  async ({ name, project, start_date, end_date, goal, status }) => {
    const project_id = project ? await resolveId('projects', project) : null
    if (project && !project_id) return fail(`프로젝트를 찾을 수 없음: ${project}`)
    const { data, error } = await db
      .from('sprints')
      .insert({ name, project_id, start_date, end_date, goal, status })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool('list_sprints', '스프린트 목록을 반환한다.', {}, async () => {
  const { data, error } = await db.from('sprints').select('*').order('created_at', { ascending: false })
  return error ? fail(error.message) : ok(data)
})

server.tool(
  'move_ticket_to_sprint',
  '티켓을 스프린트로 이동한다. sprint 는 이름|UUID|null(백로그로 이동).',
  { ticket_id: z.string(), sprint: z.string().nullable() },
  async ({ ticket_id, sprint }) => {
    if (!UUID.test(ticket_id)) return fail(`잘못된 ticket_id(UUID 아님): ${ticket_id}`)
    let sprint_id: string | null = null
    if (sprint !== null && sprint !== '') {
      sprint_id = await resolveId('sprints', sprint, 'name')
      if (!sprint_id) return fail(`스프린트를 찾을 수 없음: ${sprint}`)
    }
    const { data, error } = await db
      .from('tickets')
      .update({ sprint_id })
      .eq('id', ticket_id)
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

// ===================== 반응 =====================
server.tool(
  'add_reaction',
  '메시지에 이모지 반응을 추가한다. actor_email 로 사용자를 지정할 수 있다.',
  { message_id: z.string(), emoji: z.string(), actor_email: z.string().optional() },
  async ({ message_id, emoji, actor_email }) => {
    if (!UUID.test(message_id)) return fail(`잘못된 message_id(UUID 아님): ${message_id}`)
    const user_id = await profileIdByEmail(actor_email)
    const { data, error } = await db
      .from('reactions')
      .insert({ message_id, emoji, user_id })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'list_reactions',
  '메시지의 반응 목록을 반환한다.',
  { message_id: z.string() },
  async ({ message_id }) => {
    if (!UUID.test(message_id)) return fail(`잘못된 message_id(UUID 아님): ${message_id}`)
    const { data, error } = await db
      .from('reactions')
      .select('*')
      .eq('message_id', message_id)
      .order('created_at', { ascending: true })
    return error ? fail(error.message) : ok(data)
  },
)

// ===================== 알림 =====================
server.tool(
  'create_notification',
  '사용자에게 알림을 생성한다. user_email 로 대상을 지정한다.',
  {
    user_email: z.string(),
    type: z.enum(['mention', 'assignment', 'follow_up', 'system']).default('system'),
    title: z.string(),
    body: z.string().optional(),
    link: z.string().optional(),
  },
  async ({ user_email, type, title, body, link }) => {
    const user_id = await profileIdByEmail(user_email)
    if (!user_id) return fail(`사용자를 찾을 수 없음: ${user_email}`)
    const { data, error } = await db
      .from('notifications')
      .insert({ user_id, type, title, body, link })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'list_notifications',
  '사용자의 알림을 최신순으로 반환한다. only_unread 로 안읽음만 필터.',
  { user_email: z.string(), only_unread: z.boolean().default(false) },
  async ({ user_email, only_unread }) => {
    const user_id = await profileIdByEmail(user_email)
    if (!user_id) return fail(`사용자를 찾을 수 없음: ${user_email}`)
    let q = db
      .from('notifications')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
    if (only_unread) q = q.eq('is_read', false)
    const { data, error } = await q
    return error ? fail(error.message) : ok(data)
  },
)

// ===================== 통합 검색 =====================
server.tool(
  'search',
  '메시지/티켓/파일/공지를 query 로 통합 검색한다(ilike). 카테고리별 결과를 묶어 반환.',
  { query: z.string() },
  async ({ query }) => {
    const like = `%${query}%`
    const [messages, tickets, files, announcements] = await Promise.all([
      db.from('messages').select('id, channel_id, body, created_at').ilike('body', like).order('created_at', { ascending: false }).limit(25),
      db.from('tickets').select('id, title, description, status, priority, created_at').or(`title.ilike.${like},description.ilike.${like}`).order('created_at', { ascending: false }).limit(25),
      db.from('files').select('id, channel_id, name, storage_path, created_at').ilike('name', like).order('created_at', { ascending: false }).limit(25),
      db.from('announcements').select('id, title, body, priority, published_at').or(`title.ilike.${like},body.ilike.${like}`).order('published_at', { ascending: false }).limit(25),
    ])
    const firstErr = messages.error || tickets.error || files.error || announcements.error
    if (firstErr) return fail(firstErr.message)
    return ok({
      query,
      messages: messages.data ?? [],
      tickets: tickets.data ?? [],
      files: files.data ?? [],
      announcements: announcements.data ?? [],
    })
  },
)

// ===================== 감사 로그 =====================
server.tool(
  'log_audit',
  '감사 로그 항목을 기록한다. detail 은 자유 형식 JSON 객체.',
  {
    action: z.string(),
    entity_type: z.string().optional(),
    entity_id: z.string().optional(),
    detail: z.record(z.unknown()).optional(),
    actor_email: z.string().optional(),
  },
  async ({ action, entity_type, entity_id, detail, actor_email }) => {
    if (entity_id && !UUID.test(entity_id)) return fail(`잘못된 entity_id(UUID 아님): ${entity_id}`)
    const actor_id = await profileIdByEmail(actor_email)
    const { data, error } = await db
      .from('audit_log')
      .insert({ action, entity_type, entity_id: entity_id ?? null, detail: detail ?? null, actor_id })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'list_audit',
  '감사 로그를 최신순으로 반환한다.',
  { limit: z.number().int().min(1).max(500).default(100) },
  async ({ limit }) => {
    const { data, error } = await db
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    return error ? fail(error.message) : ok(data)
  },
)

// ===================== 프로젝트 / 간트 =====================
server.tool('list_projects', '프로젝트 목록을 반환한다.', {}, async () => {
  const { data, error } = await db.from('projects').select('*').order('created_at')
  return error ? fail(error.message) : ok(data)
})

server.tool(
  'create_project',
  '간트 프로젝트를 생성한다.',
  {
    name: z.string(),
    description: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  },
  async ({ name, description, start_date, end_date }) => {
    const { data, error } = await db
      .from('projects')
      .insert({ name, description, start_date, end_date })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'list_gantt_tasks',
  '프로젝트의 간트 작업을 반환한다. project 는 이름 또는 UUID.',
  { project: z.string() },
  async ({ project }) => {
    const projectId = await resolveId('projects', project)
    if (!projectId) return fail(`프로젝트를 찾을 수 없음: ${project}`)
    const { data, error } = await db.from('gantt_tasks').select('*').eq('project_id', projectId).order('sort_order')
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'create_gantt_task',
  '간트 작업을 생성한다. project 는 이름 또는 UUID, 날짜는 YYYY-MM-DD.',
  {
    project: z.string(),
    title: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    progress: z.number().int().min(0).max(100).default(0),
    status: z.enum(['todo', 'doing', 'done']).default('todo'),
    assignee_email: z.string().optional(),
  },
  async ({ project, title, start_date, end_date, progress, status, assignee_email }) => {
    const projectId = await resolveId('projects', project)
    if (!projectId) return fail(`프로젝트를 찾을 수 없음: ${project}`)
    const assignee_id = await profileIdByEmail(assignee_email)
    const { count } = await db.from('gantt_tasks').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
    const { data, error } = await db
      .from('gantt_tasks')
      .insert({ project_id: projectId, title, start_date, end_date, progress, status, assignee_id, sort_order: count ?? 0 })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool('delete_gantt_task', '간트 작업을 삭제한다.', { id: z.string() }, async ({ id }) => {
  const { error } = await db.from('gantt_tasks').delete().eq('id', id)
  return error ? fail(error.message) : ok({ deleted: id })
})

// ===================== 체크리스트 =====================
server.tool('list_checklists', '체크리스트와 항목을 함께 반환한다.', {}, async () => {
  const { data, error } = await db
    .from('checklists')
    .select('*, checklist_items(*)')
    .order('created_at', { ascending: false })
  return error ? fail(error.message) : ok(data)
})

server.tool(
  'create_checklist',
  '체크리스트를 생성한다. project/ticket 연동은 선택.',
  { title: z.string(), project: z.string().optional(), ticket_id: z.string().optional() },
  async ({ title, project, ticket_id }) => {
    const project_id = project ? await resolveId('projects', project) : null
    const { data, error } = await db.from('checklists').insert({ title, project_id, ticket_id }).select().single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'add_checklist_item',
  '체크리스트에 항목을 추가한다. checklist 는 제목(title) 또는 UUID. follow_up_at 으로 팔로업 시각 지정.',
  {
    checklist: z.string(),
    content: z.string(),
    due_date: z.string().optional().describe('YYYY-MM-DD'),
    follow_up_at: z.string().optional().describe('ISO 8601'),
    assignee_email: z.string().optional(),
  },
  async ({ checklist, content, due_date, follow_up_at, assignee_email }) => {
    const checklistId = await resolveId('checklists', checklist, 'title')
    if (!checklistId) return fail(`체크리스트를 찾을 수 없음: ${checklist}`)
    const assignee_id = await profileIdByEmail(assignee_email)
    const { count } = await db
      .from('checklist_items')
      .select('id', { count: 'exact', head: true })
      .eq('checklist_id', checklistId)
    const { data, error } = await db
      .from('checklist_items')
      .insert({ checklist_id: checklistId, content, due_date, follow_up_at, assignee_id, sort_order: count ?? 0 })
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool(
  'toggle_checklist_item',
  '체크리스트 항목의 완료 여부를 설정한다.',
  { item_id: z.string(), is_done: z.boolean() },
  async ({ item_id, is_done }) => {
    const { data, error } = await db
      .from('checklist_items')
      .update({ is_done, completed_at: is_done ? new Date().toISOString() : null })
      .eq('id', item_id)
      .select()
      .single()
    return error ? fail(error.message) : ok(data)
  },
)

server.tool('delete_checklist', '체크리스트(및 항목)를 삭제한다.', { id: z.string() }, async ({ id }) => {
  const { error } = await db.from('checklists').delete().eq('id', id)
  return error ? fail(error.message) : ok({ deleted: id })
})

  return server
}

// ---------- 전송 선택: 로컬은 stdio, 호스팅은 HTTP ----------
// Render 등 호스팅 환경은 PORT 를 주입한다. MCP_TRANSPORT=http 로 강제도 가능.
const useHttp = process.env.MCP_TRANSPORT === 'http' || !!process.env.PORT

if (useHttp) {
  // 원격 다중 사용자: Bearer 토큰으로 게이트한다.
  // service_role 키는 이 서버에만 있고, 직원은 토큰만 받는다.
  const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN
  if (!AUTH_TOKEN) {
    console.error(
      '[teamhub-mcp] HTTP 모드에는 MCP_AUTH_TOKEN 이 필요합니다. ' +
        '긴 랜덤 문자열을 환경변수로 설정하세요.',
    )
    process.exit(1)
  }

  const app = express()
  app.use(
    cors({
      allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
      exposedHeaders: ['Mcp-Session-Id'],
    }),
  )
  app.use(express.json({ limit: '4mb' }))

  // 헬스체크 (Render)
  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, name: 'teamhub-mcp' })
  })

  // 인증 게이트 — /mcp 만 보호
  app.use('/mcp', (req, res, next) => {
    const header = req.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (token !== AUTH_TOKEN) {
      res
        .status(401)
        .json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null })
      return
    }
    next()
  })

  // 무상태(stateless): 요청마다 새 서버+전송을 만들어 동시 사용자 충돌을 막는다.
  app.post('/mcp', async (req, res) => {
    const server = buildServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('[teamhub-mcp] handleRequest 오류:', err)
      if (!res.headersSent) {
        res
          .status(500)
          .json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
      }
    }
  })

  // 무상태 모드에선 세션 스트림(GET/DELETE) 미지원
  const methodNotAllowed = (_req: express.Request, res: express.Response) => {
    res
      .status(405)
      .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null })
  }
  app.get('/mcp', methodNotAllowed)
  app.delete('/mcp', methodNotAllowed)

  const port = Number(process.env.PORT) || 8787
  app.listen(port, () => console.error(`[teamhub-mcp] HTTP 전송 listening on :${port}`))
} else {
  // 로컬 개발: 기존 stdio 그대로
  const server = buildServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[teamhub-mcp] started (stdio)')
}
