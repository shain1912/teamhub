---
name: teamhub-mcp-usage
description: TeamHub MCP 서버(teamhub — 채널/메시지, 공지, 티켓, 스프린트, 프로젝트/간트, 체크리스트, 알림/감사/검색 도구)를 자기 Claude Code/Desktop에 연결하고 실제 협업 작업(공지 올리기, 티켓·간트·체크리스트 생성 등)을 자연어로 수행하는 법. "TeamHub MCP 연결해줘", "TeamHub 도구 쓰는 법 알려줘", "이 티켓/공지/간트 TeamHub에 등록해줘", "mcp__teamhub__* 뭐가 있어" 같은 요청이나 TeamHub를 처음 쓰는 팀원을 온보딩할 때 반드시 사용하라.
---

# TeamHub MCP 사용법

TeamHub는 두 종류의 MCP 서버를 쓴다(`supabase`는 DB 운영용, 이 스킬은 다루지 않음). 이 스킬은 **`teamhub` 서버** — 메시지·공지·티켓·간트·체크리스트를 도구 호출로 CRUD하는 서버 — 를 연결하고 쓰는 법을 다룬다.

## 1. 연결하기

이미 TeamHub 레포를 클론해 로컬에서 개발 중이면 `.mcp.json`에 `teamhub`가 등록돼 있어 Claude Code 재시작만으로 붙는다(아래 "로컬 stdio" 참고). **레포가 없는 팀원**(기획자, 다른 프로젝트 소속 등)은 원격 HTTP로 붙는 게 맞다 — 이쪽이 대부분의 신규 사용자에게 해당한다.

### 원격 HTTP (레포 없는 팀원 — 추천)

관리자에게 `MCP_AUTH_TOKEN`을 받은 뒤 한 번만 실행:

```bash
claude mcp add --transport http teamhub \
  https://mcp.kodekorea.kr/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

> 인프라가 Render에서 자체 VPS(156.228.4.156, Cloudflare 프록시)로 이전되면서 엔드포인트가 `mcp.kodekorea.kr`로 바뀌었다. 구 주소(`teamhub-mcp.onrender.com`)는 더 이상 응답하지 않는다.

Claude Desktop이면 `claude_desktop_config.json`(또는 Settings → Connectors)에 같은 URL + `Authorization: Bearer <토큰>` 헤더로 원격 MCP를 추가한다.

### 로컬 stdio (레포 클론한 개발자)

```bash
npm install
cd server && npm install && npm run build && cd ..
# .env 에 VITE_SUPABASE_URL=https://supabase.kodekorea.kr, SUPABASE_SERVICE_ROLE_KEY 설정 (.env.example 참고)
# ※ 자체호스팅 Supabase는 legacy JWT 형식 service_role 키를 쓴다(신형 sb_secret_... 미지원)
```

Claude Code를 재시작하면 `.mcp.json`에 이미 있는 `teamhub` 항목(`node server/dist/index.js`)이 자동 연결된다.

### 연결 확인

```bash
claude mcp list      # teamhub 가 connected 로 표시되면 성공
```

Claude Code 안에서는 `/mcp` 로도 확인 가능. `-32000` 등 에러가 나면 원격은 토큰을, 로컬은 `.env`의 `SUPABASE_SERVICE_ROLE_KEY`를 먼저 의심한다.

## 2. 도구 카탈로그

전부 `mcp__teamhub__` 접두사가 붙는다(예: `mcp__teamhub__create_ticket`).

| 영역 | 도구 |
|------|------|
| 채널/메시지 | `list_channels`, `create_channel`, `list_messages`, `post_message` |
| 공지 | `list_announcements`, `post_announcement`, `delete_announcement` |
| 티켓 | `list_tickets`, `create_ticket`, `update_ticket`, `delete_ticket`, `add_ticket_comment`, `list_ticket_comments`, `set_ticket_labels`, `assign_ticket` |
| 스프린트 | `create_sprint`, `list_sprints`, `move_ticket_to_sprint` |
| 프로젝트/간트 | `list_projects`, `create_project`, `list_gantt_tasks`, `create_gantt_task`, `delete_gantt_task` |
| 체크리스트 | `list_checklists`, `create_checklist`, `add_checklist_item`, `toggle_checklist_item`, `delete_checklist` |
| 반응/알림/감사/검색 | `add_reaction`, `list_reactions`, `create_notification`, `list_notifications`, `search`, `log_audit`, `list_audit` |

**채널·프로젝트·체크리스트·스프린트 인자는 이름 또는 UUID를 둘 다 받는다** — `list_*`로 먼저 UUID를 찾아둘 필요 없이 사람이 부르는 이름(`"general"`, `"TeamHub MVP"`)을 그대로 넘기면 된다. 이름이 여러 개 걸리면 서버가 모호하다고 에러를 낼 수 있으니, 그럴 때만 `list_*`로 UUID를 확인해 명시한다.

`assign_ticket`은 담당자 지정 시 알림 + 감사 로그를 자동으로 남긴다 — 담당자 변경은 `update_ticket`이 아니라 이 도구를 쓴다.

세부 파라미터(필수/선택 필드, enum 값 등)는 도구가 로드된 뒤 스키마로 바로 확인 가능하니 외우지 않아도 된다. 잘 모르겠으면 `references/workflows.md`의 예시를 참고한다.

## 3. 자연어 → 도구 호출 감 잡기

- "general 채널 오늘 내용 요약해서 공지로 올려줘"
  → `list_messages(channel:"general", limit:100)` → (직접 요약) → `post_announcement(title, body, priority)`
- "결제 버그 티켓 만들고 높은 우선순위로"
  → `create_ticket(title:"결제 버그", priority:"high")`
- "TeamHub MVP 프로젝트에 'QA' 작업 3일짜리 추가"
  → `create_gantt_task(project:"TeamHub MVP", title:"QA", start_date, end_date)`
- "'출시 준비' 체크리스트에 'Render 배포' 항목 추가하고 내일 팔로업"
  → `add_checklist_item(checklist:"출시 준비", content:"Render 배포", follow_up_at:"...")`

**"요약해줘"류 요청은 서버가 LLM을 호출하지 않는다** — `list_messages`로 원문을 읽어온 뒤 에이전트(너)가 직접 요약문을 작성하고, 그 결과를 `post_message`/`post_announcement`로 올리는 2단계 작업이다.

## 4. 프로젝트 계획을 통째로 세울 때

"이 계획/일정을 TeamHub에 다 넣어줘" 같은 요청은 아래 순서가 자연스럽다 — 뒤 단계가 앞 단계의 이름을 참조하기 때문에 이 순서를 벗어나면 다시 조회해야 한다:

1. `create_project` — 프로젝트 하나
2. `create_sprint(project:...)` — 기간이 정해져 있으면 스프린트로 묶기
3. `create_gantt_task(project:...)` — 일정별로 여러 개 (간트 차트에 시각화됨)
4. `create_ticket` — 실행 단위 작업 여러 개 (간트 항목과 1:1로 대응시키면 보기 편하다)
5. `move_ticket_to_sprint(ticket_id, sprint:...)` — 각 티켓을 스프린트에 배정
6. `create_checklist(ticket_id:...)` → `add_checklist_item` 반복 — 티켓별 세부 체크리스트

서로 의존관계가 없는 호출(예: 여러 개의 `create_gantt_task`, 여러 개의 `create_ticket`)은 병렬로 한 번에 보내는 게 빠르다. 자세한 실행 예시는 `references/workflows.md` 참고.

## 5. 보안 주의

- 이 서버는 **service_role 키**로 동작해 모든 RLS를 우회한다(사실상 DB god-mode). 신뢰된 내부 팀원에게만 토큰을 공유한다.
- `MCP_AUTH_TOKEN`이나 `SUPABASE_SERVICE_ROLE_KEY`를 커밋하거나 대화/공지에 평문으로 올리지 않는다.
- 원격 토큰이 유출되면 관리자가 Render 환경변수에서 `MCP_AUTH_TOKEN`을 재발급하고 전 직원이 재등록해야 한다.
