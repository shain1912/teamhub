# TeamKode E2E 테스트 계획

> 목적: 배포 전 **회귀 자동 검증**. 특히 (1) 새로 붙인 **MCP 사용자별 PAT 인증**, (2) CLAUDE.md 하네스의 핵심 목표인 **도구호출 비결정 버그(중복/누락 생성)**, (3) **RLS 격리 경계**를 깨지지 않게 고정한다.

## 0. 테스트 인프라 (현황 → 목표)

| 항목 | 현황 | 목표 |
|------|------|------|
| 러너 | Playwright만 설치, 설정·디렉터리 없음 (scratchpad 임시) | `tests/` 디렉터리 + `playwright.config.ts` |
| UI E2E | 임시 스크립트 | Playwright (390px 모바일 / 1440px 데스크톱 × light/dark) |
| API/MCP/RLS | 임시 node fetch | `tests/api/*.mjs` (node 내장 fetch) |
| 데이터 시드 | 수기 | `tests/seed.mjs` (service_key로 픽스처 생성/정리) |
| 비밀값 | `.env` | `tests/.env.test` (TEST_EMAIL/PW, MCP_URL, SUPABASE_*) |

**대상 환경:** 로컬(`npm run dev` :5173 + 서버 :8787) 우선, 스모크는 운영(team.kodekorea.kr / teamhub-mcp.onrender.com).

---

## 1. 우선순위 (리스크 기반)

| P | 스위트 | 사유 |
|---|--------|------|
| **P0** | A. MCP PAT 인증 | 이번에 새로 추가, 보안 경계, 미검증 시 무단접근 위험 |
| **P0** | F. RLS 격리 | 데이터 유출 = 치명. 게스트/클라/DM 경계 |
| **P1** | B. MCP 도구 멱등성 | 하네스 핵심 목표(중복/누락) |
| **P1** | C. 토큰 라이프사이클 | 발급/폐기/게스트차단 |
| **P2** | D. 인증/로그인 | 이메일저장·Google 버튼 |
| **P2** | E. 페이지 렌더/테마 | 콘솔에러 0, light/dark |
| **P2** | G. 기능 회귀 | 간트 담당자/칸반/체크리스트/DM |

---

## 2. 테스트 케이스

### Suite A — MCP PAT 인증 (서버 `/mcp` 게이트) · P0
대상: `server/src/index.ts:673-709`

| ID | 케이스 | 입력 | 기대 |
|----|--------|------|------|
| A-1 | 토큰 없음 | `Authorization` 헤더 없음 | 401, `{error.code:-32001}` |
| A-2 | 빈 Bearer | `Bearer ` | 401 |
| A-3 | 유효 PAT | DB에 해시 존재·revoked=false | 200, MCP initialize 성공 |
| A-4 | 잘못된 PAT | 임의 문자열 | 401 |
| A-5 | 폐기된 PAT | revoked=true 로 업데이트 후 | 401 |
| A-6 | 공용 AUTH_TOKEN | `MCP_AUTH_TOKEN` 값 | 200 (관리 경로) |
| A-7 | last_used_at 갱신 | A-3 성공 후 DB 조회 | `last_used_at` 갱신됨 |
| A-8 | GET/DELETE /mcp | 무상태 모드 | 405 Method not allowed |
| A-9 | 해시 일치성 | 프론트 `sha256Hex` ↔ 서버 `createHash('sha256')` | 동일 hex (회귀 가드) |

### Suite B — MCP 도구 동작/멱등성 (중복·누락) · P1
대상: `server.tool(...)` 전 도구. **하네스 핵심.**

| ID | 케이스 | 절차 | 기대 |
|----|--------|------|------|
| B-1 | list 도구 무인자 | `list_projects/channels/tickets/...` | 에러 없이 배열 |
| B-2 | create 단일성 | `create_ticket` 1회 호출 | 정확히 1행 생성 (중복 0) |
| B-3 | create→list 반영 | create 후 list | 방금 생성분 포함 |
| B-4 | delete 후 부재 | `delete_ticket` 후 list | 미포함 |
| B-5 | 멱등 update | 같은 값 `update_ticket` 2회 | 행 1개 유지, 충돌 없음 |
| B-6 | 동시 호출 | create 2개 병렬(서로 다른 제목) | 정확히 2행, 누락 0 |
| B-7 | 입력검증 | 필수 인자 누락 | zod 검증 에러(생성 안 됨) |
| B-8 | 정리 | 테스트 생성분 `delete_*` | 잔여 0 (시드 격리) |

> 참고: 인앱 GLM 비서는 제거됨 → 기존 `ai-agent-verify` 스킬의 `/ai/chat` 루프 검증은 **MCP 도구 레벨 멱등성 검증으로 대체**한다(B 스위트). `/ai/chat` 라우트는 잔존하나 비활성(키 없으면 503).

### Suite C — MCP 토큰 라이프사이클 (프론트 + RLS) · P1
대상: `McpConnect.tsx`, `0010_mcp_tokens.sql`

| ID | 케이스 | 절차 | 기대 |
|----|--------|------|------|
| C-1 | 발급 | "새 토큰 발급" | 원문 1회 표시, 목록에 1행 |
| C-2 | 원문 미저장 | DB `mcp_tokens` 조회 | `token_hash`만, 원문 없음 |
| C-3 | 설치명령 정확성 | 복사된 명령 | `claude mcp add teamkode --transport http <URL>/mcp --header "Authorization: Bearer tk_..." -s user` |
| C-4 | 폐기 | "폐기" 클릭 | 행 삭제, 해당 토큰 `/mcp` 401(=A-5 연동) |
| C-5 | RLS 본인전용 | 사용자2가 사용자1 토큰 select | 0행 |
| C-6 | 게스트 차단 | 게스트 계정으로 insert | RLS 거부 |
| C-7 | 재발급 후 양립 | 2개 발급 | 둘 다 유효(독립 해시) |

### Suite D — 인증/로그인 · P2
대상: `Login.tsx`, `auth.ts`

| ID | 케이스 | 기대 |
|----|--------|------|
| D-1 | 이메일/비번 로그인 | 세션 생성, `/me` 진입 |
| D-2 | 아이디 저장 ON | 재방문 시 `teamkode:email` 프리필 |
| D-3 | 아이디 저장 OFF | 프리필 없음 |
| D-4 | Google 버튼 존재 | "Google로 계속하기" 렌더 |
| D-5 | Google 클릭 | `signInWithOAuth({provider:'google'})` 호출(프로바이더 미설정 시 에러 메시지 노출) |
| D-6 | 오입력 | 잘못된 비번 → 에러 메시지 |

### Suite E — 페이지 렌더/테마 · P2
대상: 13개 라우트 (`App.tsx`)

| ID | 케이스 | 기대 |
|----|--------|------|
| E-1 | 라우트 13종 로드 | `/me /tickets /sprints /gantt /checklists /announcements /channels /dm /people /search /audit /notifications` — 각 콘솔 에러 0 |
| E-2 | 디폴트 테마 | 첫 방문 light (`html`에 `.dark` 없음) |
| E-3 | 토글 | ThemeToggle → `.dark` 추가/제거, `localStorage.theme` 반영 |
| E-4 | 무플래시 | 새로고침 시 dark 깜빡임 없음 (index.html init script) |
| E-5 | 모바일 390px | 사이드바 오프캔버스, 햄버거 동작 |
| E-6 | 데스크톱 1440px | 사이드바 고정, 접기/펼치기 |
| E-7 | 게스트 사이드바 | 채널·티켓만, MCP/클라 버튼 숨김 |

### Suite F — RLS 격리 · P0
대상: 0006/0007/0008/0009 마이그레이션

| ID | 케이스 | 기대 |
|----|--------|------|
| F-1 | 게스트 채널한정 | 게스트는 배정 채널만 select |
| F-2 | 클라 테넌트 격리 | 게스트는 자기 `client_id` 프로젝트만 |
| F-3 | 간트/스프린트 상속 | project 통해 클라 경계 상속 |
| F-4 | 만료 게스트 차단 | `expires_at` 경과 토큰 → 접근 불가 |
| F-5 | DM 1:1 격리 | 제3자는 남의 DM select 0행 |
| F-6 | DM 중복방지 | 같은 쌍 재생성 → `dm_key` unique 1행 |
| F-7 | DM 읽음상태 본인전용 | 타인 read_state 수정 불가 |

### Suite G — 기능 회귀 · P2

| ID | 케이스 | 기대 |
|----|--------|------|
| G-1 | 간트 담당자 지정 | editor에서 assignee select → `assignee_id` 저장, 미배정→null |
| G-2 | 티켓 칸반 | 컬럼별 카드, 우선순위 칩(urgent 강조) |
| G-3 | 체크리스트 마감일 | 캘린더 UI로 날짜 선택 (사람 전용, MCP 영향 없음) |
| G-4 | 체크리스트 메이슨리 | `columns-N` + `break-inside-avoid` 레이아웃 |
| G-5 | DM 보내기/읽음 | 전송→상대 미읽음 뱃지→읽음 처리 |

---

## 3. 실행 구조 (제안)

```
tests/
  playwright.config.ts        # projects: mobile/desktop × light/dark, baseURL
  seed.mjs                    # 픽스처 생성/정리 (service_key)
  .env.test                   # TEST_EMAIL/PW, MCP_URL, SUPABASE_URL/SERVICE_KEY
  api/
    mcp-auth.mjs              # Suite A (401/200/revoked)
    mcp-tools.mjs            # Suite B (멱등/중복/누락)
    rls.mjs                  # Suite F (게스트/클라/DM)
  ui/
    auth.spec.ts             # Suite D
    pages.spec.ts            # Suite E
    features.spec.ts         # Suite G
    mcp-connect.spec.ts      # Suite C (UI 부분)
```

**npm scripts(추가 예정):**
```
"test:api":  "node tests/api/mcp-auth.mjs && node tests/api/mcp-tools.mjs && node tests/api/rls.mjs",
"test:ui":   "playwright test",
"test":      "npm run test:api && npm run test:ui",
"test:smoke":"PW_BASE=https://team.kodekorea.kr playwright test pages.spec.ts"
```

## 4. 게이트 / CI

- **PR 게이트(필수):** Suite A + F (P0). 실패 시 머지 차단.
- **배포 전:** A·B·C·F 전체 + UI 스모크(E-1).
- **데이터 안전:** 모든 생성 케이스는 시드 격리 + 종료 시 정리(B-8). 운영 스모크는 **읽기 전용**만.
- **비밀값:** PAT/서비스키는 `.env.test`(gitignore), CI는 시크릿 주입.

## 5. 알려진 한계 / 메모

- MCP 데이터 연산은 현재 service_key 모델(내부신뢰) → **사용자별 RLS 스코프는 미적용**. B 스위트는 "도구가 정확히 1번 동작"만 검증하고, 사용자별 데이터 경계는 향후 PAT→user 매핑 적용 시 확장.
- 인앱 GLM 비서 제거됨 → `ai-agent-verify` 스킬 트리거는 더 이상 코드 경로 없음(B로 대체).
</content>
</invoke>
