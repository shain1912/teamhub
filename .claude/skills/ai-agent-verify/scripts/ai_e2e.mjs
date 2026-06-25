#!/usr/bin/env node
/**
 * TeamHub AI 비서 E2E 검증 하네스
 *
 * 인앱 GLM 챗봇의 에이전트 루프를 서버 프록시(/ai/chat)에 대고 그대로 재현하여
 * "여러번 생성 / 누락 생성" 같은 도구호출 버그를 잡는다.
 *
 * 동작:
 *   1) Supabase admin API로 임시 사용자 생성 → password grant 로 액세스 토큰 발급
 *   2) 주어진 시나리오(프롬프트 + 도구 + 모의 실행기)로 에이전트 루프를 돌림
 *      - 실제 DB 는 건드리지 않는다. 실행기는 멱등/상태형 모의(stateful mock).
 *   3) 도구호출 시퀀스를 기록하고 중복/누락을 판정
 *   4) 임시 사용자 삭제(cleanup)
 *
 * 사용:
 *   node ai_e2e.mjs                 # 내장 시나리오 전부, 각 N회
 *   node ai_e2e.mjs --runs 8        # 반복 횟수 변경(간헐 버그 포착)
 *   node ai_e2e.mjs --proxy https://teamhub-mcp.onrender.com
 *
 * 환경(.env 또는 환경변수): SUPABASE_URL(or VITE_SUPABASE_URL),
 *   VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 *
 * 종료코드: 버그 발견 시 1, 전부 통과 시 0 (CI 게이트로 사용 가능).
 */
import fs from 'node:fs'

// ---------- 설정 로드 ----------
function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
      if (!line.includes('=') || line.trim().startsWith('#')) continue
      const i = line.indexOf('=')
      const k = line.slice(0, i).trim()
      if (!(k in env)) env[k] = line.slice(i + 1).replace(/^["']|["']$/g, '').trim()
    }
  } catch {}
  return env
}
const ENV = loadEnv()
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name)
  return i >= 0 ? process.argv[i + 1] : dflt
}
const SB = ENV.SUPABASE_URL || ENV.VITE_SUPABASE_URL
const ANON = ENV.VITE_SUPABASE_ANON_KEY
const SVC = ENV.SUPABASE_SERVICE_ROLE_KEY
const PROXY = arg('proxy', ENV.VITE_AI_PROXY_URL || 'https://teamhub-mcp.onrender.com')
const RUNS = Number(arg('runs', '5'))
const TODAY = arg('today', new Date().toISOString().slice(0, 10))

if (!SB || !ANON || !SVC) {
  console.error('SUPABASE_URL / VITE_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(2)
}

// ---------- 도구 스키마(앱과 동일 형태의 핵심 일부) ----------
const T = {
  list_projects: { type: 'function', function: { name: 'list_projects', description: '프로젝트 목록 반환', parameters: { type: 'object', properties: {} } } },
  create_project: { type: 'function', function: { name: 'create_project', description: '프로젝트 생성', parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } } },
  create_gantt_task: { type: 'function', function: { name: 'create_gantt_task', description: '간트 작업 생성. 프로젝트 필수(없으면 먼저 create_project).', parameters: { type: 'object', properties: { project: { type: 'string' }, title: { type: 'string' }, start_date: { type: 'string' }, end_date: { type: 'string' } }, required: ['project', 'title', 'start_date', 'end_date'] } } },
  create_ticket: { type: 'function', function: { name: 'create_ticket', description: '티켓 생성', parameters: { type: 'object', properties: { title: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] } }, required: ['title'] } } },
}

// ---------- 상태형 모의 실행기 (앱 실행기의 멱등 동작을 모사) ----------
function makeMock() {
  const projects = new Set()
  const gantt = [] // {project,title}
  const tickets = []
  return {
    counts: { gantt: () => gantt.length, tickets: () => tickets.length, projects: () => projects.size },
    titles: { tickets: () => tickets.map((t) => t.title), gantt: () => gantt.map((g) => g.title) },
    run(name, a) {
      switch (name) {
        case 'list_projects':
          return { ok: true, summary: '프로젝트: ' + ([...projects].join(', ') || '없음') }
        case 'create_project':
          if (projects.has(a.name)) return { ok: true, summary: `프로젝트 "${a.name}" 이미 있음(재사용)` } // 멱등
          projects.add(a.name)
          return { ok: true, summary: '프로젝트 생성: ' + a.name }
        case 'create_gantt_task': {
          if (!projects.has(a.project)) projects.add(a.project) // 앱: 없으면 자동 생성
          gantt.push({ project: a.project, title: a.title })
          return { ok: true, summary: '간트 작업 생성: ' + a.title }
        }
        case 'create_ticket':
          tickets.push({ title: a.title })
          return { ok: true, summary: '티켓 생성: ' + a.title }
        default:
          return { ok: false, summary: 'unknown tool ' + name }
      }
    },
  }
}

// ---------- 시나리오 ----------
const SYS =
  '너는 TeamHub 비서다. 생성 요청이면 즉시 적절한 도구를 호출하라. 간트작업은 프로젝트 필수(없으면 먼저 create_project). ' +
  '여러 항목을 요청받으면 각 항목마다 도구를 정확히 한 번씩 호출해 전부 생성하라. 이미 성공한 호출을 같은 인자로 반복하지 마라. 오늘은 ' +
  TODAY +
  '.'
const SCENARIOS = [
  {
    name: 'gantt-autocreate (없는 프로젝트)',
    tools: [T.list_projects, T.create_project, T.create_gantt_task],
    prompt: '간트차트에 "디자인 시안" 작업 만들어줘. 6월 26~30일, 프로젝트 "출시"',
    expect: (m) => (m.counts.gantt() === 1 ? null : `간트 ${m.counts.gantt()}개(기대 1)`),
  },
  {
    name: 'multi-ticket (3개 요청)',
    tools: [T.create_ticket],
    prompt: '티켓 3개 만들어줘: 로그인 버그, 결제 오류, UI 깨짐',
    expect: (m) => {
      const t = m.titles.tickets()
      if (t.length !== 3) return `티켓 ${t.length}개(기대 3) — 누락/중복`
      if (new Set(t).size !== 3) return `중복 제목: ${t.join(', ')}`
      return null
    },
  },
]

// ---------- 에이전트 루프(앱 AiChat 과 동일 구조: 턴단위 중복차단 포함) ----------
async function agentLoop(token, scenario) {
  const mock = makeMock()
  const seen = new Set()
  const isMut = (n) => /^(create_|delete_|post_|add_|assign_|set_|move_|toggle_)/.test(n)
  const convo = [
    { role: 'system', content: SYS + '\n프로젝트: (없음)' },
    { role: 'user', content: scenario.prompt },
  ]
  const seq = []
  for (let i = 0; i < 8; i++) {
    const r = await fetch(`${PROXY}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: convo, tools: scenario.tools }),
    })
    if (!r.ok) throw new Error(`proxy ${r.status}: ${(await r.text()).slice(0, 120)}`)
    const m = (await r.json())?.choices?.[0]?.message
    if (!m) break
    convo.push(m)
    if (m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        let a = {}
        try { a = JSON.parse(tc.function.arguments || '{}') } catch {}
        const sig = `${tc.function.name}:${JSON.stringify(a)}`
        let res
        if (isMut(tc.function.name) && seen.has(sig)) {
          res = { ok: true, summary: `(중복무시) ${tc.function.name}` }
          seq.push(tc.function.name + '⊘')
        } else {
          res = mock.run(tc.function.name, a)
          if (isMut(tc.function.name)) seen.add(sig)
          seq.push(tc.function.name + (res.ok ? '✓' : '✗'))
        }
        convo.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) })
      }
      continue
    }
    break
  }
  return { mock, seq }
}

// ---------- 임시 사용자 ----------
async function mintUser() {
  const email = `aiverify_${Math.floor(Date.now() / 1000)}@example.com`
  const pw = 'Verify!2345xyz'
  await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw, email_confirm: true }) })
  const tj = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) })).json()
  return { token: tj.access_token, uid: tj.user?.id }
}
async function deleteUser(uid) {
  if (uid) await fetch(`${SB}/auth/v1/admin/users/${uid}`, { method: 'DELETE', headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } })
}

// ---------- 실행 ----------
const { token, uid } = await mintUser()
if (!token) { console.error('토큰 발급 실패'); await deleteUser(uid); process.exit(2) }
let failures = 0
try {
  for (const sc of SCENARIOS) {
    for (let n = 1; n <= RUNS; n++) {
      const { mock, seq } = await agentLoop(token, sc)
      const bug = sc.expect(mock)
      if (bug) failures++
      console.log(`[${sc.name} #${n}] ${seq.join(' → ')} | ${bug ? '❌ ' + bug : '✅ 정상'}`)
    }
  }
} finally {
  await deleteUser(uid)
}
console.log(`\n>>> ${failures === 0 ? '✅ 전부 통과' : `❌ ${failures}건 실패`}`)
process.exit(failures === 0 ? 0 : 1)
