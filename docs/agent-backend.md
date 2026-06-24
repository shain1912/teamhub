# TeamHub MCP 서버 — 에이전트/LLM 백엔드

프론트엔드는 Supabase에 직접 붙지만, **에이전트/LLM가 쓰기 작업을 하려면** 별도 인터페이스가 필요하다.
`server/` 의 MCP 서버가 그 역할을 한다 — Claude 같은 에이전트가 도구 호출로 메시지/공지/티켓/간트/체크리스트를 자유롭게 CRUD 한다.

## 동작 방식

- **MCP(stdio) 서버**. `@modelcontextprotocol/sdk` + `@supabase/supabase-js`.
- **서비스 롤 키**로 동작 → RLS 우회. 신뢰된 내부 에이전트 백엔드 전용이며, 이 키는 절대 프론트엔드/깃에 노출하지 않는다.
- 작성자 귀속은 선택적 `actor_email`/`assignee_email` → `profiles.email` 로 해석.

## 설정

1. `.env` 에 추가 (대시보드 > Project Settings > API > **service_role secret**):
   ```
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
   `SUPABASE_URL` 은 기존 `VITE_SUPABASE_URL` 을 자동 사용한다.
2. 빌드:
   ```bash
   cd server && npm install && npm run build
   ```
3. `.mcp.json` 에 `teamhub` 서버가 등록돼 있다. **Claude Code 재시작**으로 연결한다.
   (로컬 단독 실행: `node server/dist/index.js`)

## 도구 카탈로그

| 영역 | 도구 |
|------|------|
| 채널/메시지 | `list_channels`, `create_channel`, `list_messages`, `post_message` |
| 공지 | `list_announcements`, `post_announcement`, `delete_announcement` |
| 티켓 | `list_tickets`, `create_ticket`, `update_ticket`, `delete_ticket` |
| 프로젝트/간트 | `list_projects`, `create_project`, `list_gantt_tasks`, `create_gantt_task`, `delete_gantt_task` |
| 체크리스트 | `list_checklists`, `create_checklist`, `add_checklist_item`, `toggle_checklist_item`, `delete_checklist` |

채널·프로젝트·체크리스트 인자는 **이름 또는 UUID** 둘 다 받는다.

## 요약 워크플로우 (LLM)

"요약"은 서버가 LLM을 호출하지 않는다. 에이전트가 직접 수행한다:

1. `list_messages(channel: "general", limit: 100)` 로 대화를 읽는다.
2. 에이전트가 요약문을 만든다.
3. `post_message(channel: "general", body: "오늘 요약: …")` 또는
   `post_announcement(title: "일일 요약", body: "…", priority: "normal")` 로 게시한다.

## 사용 예 (자연어 → 도구 호출)

- "general 채널 오늘 내용 요약해서 공지로 올려줘"
  → `list_messages` → (요약) → `post_announcement`
- "결제 버그 티켓 만들고 높은 우선순위로"
  → `create_ticket(title:"결제 버그", priority:"high")`
- "TeamHub MVP 프로젝트에 'QA' 작업 3일짜리 추가"
  → `create_gantt_task(project:"TeamHub MVP", title:"QA", start_date, end_date)`
- "'출시 준비' 체크리스트에 'Render 배포' 항목 추가하고 내일 팔로업"
  → `add_checklist_item(checklist:"출시 준비", content:"Render 배포", follow_up_at: ...)`

## 보안 주의

- 서비스 롤 키는 모든 RLS를 우회한다. MCP 서버를 신뢰된 환경에서만 구동한다.
- 키는 `.env`(gitignore됨)에만 두고, `.mcp.json`/코드/프론트엔드에 넣지 않는다.
