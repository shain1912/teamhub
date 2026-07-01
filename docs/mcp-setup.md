# MCP 설치 가이드

TeamHub는 두 개의 MCP 서버를 쓴다. 새로 클론한 사람이 아래대로 설정하면 에이전트(Claude 등)가 곧바로 TeamHub를 운영할 수 있다.

| 서버 | 용도 | 전송 |
|------|------|------|
| `teamhub` | 메시지·공지·티켓·간트·체크리스트 CRUD (이 저장소의 `server/`) | stdio (로컬 실행) 또는 http (원격, `mcp.kodekorea.kr` — `docs/mcp-remote.md` 참고) |
| `supabase` | DB 스키마·마이그레이션·로그 등 운영 | ⚠️ 아래 "supabase MCP 참고사항" 확인 |

**`teamhub`는 각자 로컬에서 도는 stdio 서버**이므로 별도 호스팅이 필요 없다 — 클론 → 빌드 → 키 입력 → 재시작이면 끝.

> **2026-07 인프라 전환**: DB는 Supabase Cloud가 아니라 자체호스팅 `https://supabase.kodekorea.kr`이다. `*.supabase.co`를 하드코딩하지 않는다. 상세는 `kodekorea-cloud` 스킬(있다면) 또는 담당자에게 확인.

## 1. teamhub MCP 설치 (필수)

```bash
# 1) 저장소 의존성
npm install

# 2) MCP 서버 빌드
cd server && npm install && npm run build && cd ..

# 3) .env 에 백엔드 키 입력 (.env.example 참고)
#    - VITE_SUPABASE_URL          : https://supabase.kodekorea.kr
#    - SUPABASE_SERVICE_ROLE_KEY  : 자체호스팅 Supabase의 legacy JWT service_role 키
#      ※ 자체호스팅은 legacy JWT 형식만 지원(신형 sb_secret_... 미지원). 이 키는 RLS를 우회하므로 .env 밖으로 내보내지 말 것.

# 4) Claude Code 재시작 → 'teamhub' 서버 자동 연결
```

`.mcp.json` 등록 내용(이미 포함됨):

```json
{
  "mcpServers": {
    "supabase": { "type": "http", "url": "https://mcp.supabase.com/mcp" },
    "teamhub":  { "command": "node", "args": ["server/dist/index.js"] }
  }
}
```

> 서버는 시작 시 프로젝트 루트의 `.env` 를 자동 로드한다(`server/dist/index.js` 기준 `../../.env`).
> 키가 없으면 명확한 메시지와 함께 종료하므로, 연결이 안 되면 먼저 `.env` 의 `SUPABASE_SERVICE_ROLE_KEY` 를 확인한다.

### 수동 등록(다른 프로젝트에서 재사용 시)

```bash
claude mcp add --scope project teamhub -- node /절대경로/server/dist/index.js
```

## 2. supabase MCP 참고사항 (자체호스팅 전환 후 미해결)

현재 `.mcp.json`의 `supabase` 항목(`@supabase/mcp-server-supabase` + `--project-ref=<구 Supabase Cloud 프로젝트>`)은 **Supabase Cloud 전용 관리 API를 쓴다** — 자체호스팅 `supabase.kodekorea.kr` 인스턴스에는 그대로 적용되지 않을 가능성이 높다. DB 운영이 필요하면 당장은:

- **Studio(관리 UI)**: SSH 터널로만 접근 — `ssh -L 8000:127.0.0.1:8000 ubuntu@156.228.4.156` → `http://localhost:8000`
- **직접 SQL**: `.156`의 Postgres에 연결 문자열로 직접 접속

자체호스팅에 맞는 MCP 연결 방식이 확정되면 이 섹션과 `.mcp.json`의 `supabase` 항목을 갱신한다. 담당자에게 먼저 확인할 것 — 추측으로 `.mcp.json`을 바꾸면 팀 전체의 연결이 깨질 수 있다.

## 3. 연결 확인

- Claude Code에서 `/mcp` 실행 → `teamhub`, `supabase` 가 connected 로 표시.
- 실패(`-32000` 등) 시: `node server/dist/index.js` 를 직접 실행해 에러 메시지를 확인한다(대개 키 누락).

## 4. 도구 카탈로그 / 사용 예

[`docs/agent-backend.md`](agent-backend.md) 참조 — 도구 목록과 "채널 요약 → 공지 게시" 같은 워크플로우 예시 포함.

## 보안 메모

- `SUPABASE_SERVICE_ROLE_KEY`(= `sb_secret_...`)는 모든 RLS를 우회한다. 신뢰된 로컬/내부 환경에서만 MCP 서버를 구동하고, 키는 `.env`(gitignore됨)에만 둔다.
- 프론트엔드(배포본)에는 절대 secret 키를 넣지 않는다. 프론트는 `VITE_SUPABASE_ANON_KEY`(publishable/anon)만 사용한다.
