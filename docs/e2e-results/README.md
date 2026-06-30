# TeamKode E2E 검증 결과 (2026-06-30)

대상: **MCP 직접 호출 검증** + **워크스페이스/채팅 화면 E2E**
환경: 로컬 `npm run dev`(localhost:5173) · 운영 MCP `https://teamhub-mcp.onrender.com/mcp`(PAT 인증)
방식: MCP 도구 직접 호출 + Playwright(Chromium, 1440×900) 자동 캡처

---

## 1. 요약

| 구분 | 케이스 | 결과 |
|------|--------|------|
| MCP 인증 | 토큰 없음/오류 → 401, 유효 PAT → 200 | ✅ |
| MCP 읽기 | list_channels / list_tickets / list_projects | ✅ |
| MCP 멱등성 | create_ticket → **정확히 1건**(중복 0) | ✅ |
| MCP 수정 | update_ticket (status·priority) | ✅ |
| MCP 삭제/정리 | delete_ticket → 베이스라인 복원 | ✅ |
| 워크스페이스 전환 | 드롭다운 전환 동작 | ✅ |
| 워크스페이스 생성 | 인라인 생성 → 빈 팀 시작 | ✅ |
| **워크스페이스 격리** | 신규=0건 / 기본=1건 (화면 대비) | ✅ |
| 채팅 줄바꿈 | Shift+Enter 멀티라인 + 자동확장 | ✅ |
| 다크모드 | 토글 정상, 콘솔 에러 0 | ✅ |

> ⚠️ **발견된 갭 1건**: MCP로 생성한 티켓은 `workspace_id = null` → 워크스페이스로 필터되는 UI 목록엔 안 보임. 아래 5장 참고.

---

## 2. MCP 직접 호출 E2E (운영 서버, PAT 인증)

연결: `claude mcp add teamkode --transport http …/mcp --header "Authorization: Bearer tk_…"`

| # | 호출 | 결과 |
|---|------|------|
| 1 | `list_channels` | 6개 채널 반환, 전부 `workspace_id=기본` |
| 2 | `list_tickets` | 베이스라인 1건("메인 배너 시안 검토") |
| 3 | `list_projects` | 4개 프로젝트 반환 |
| 4 | `create_ticket("[E2E] MCP 멱등성 검증 티켓", high)` | 1건 생성 (id `65ee7ff4…`) |
| 5 | `list_tickets` | 해당 제목 **정확히 1건** (중복 없음) |
| 6 | `update_ticket(status=in_progress, priority=urgent)` | 필드 반영 확인 |
| 7 | `delete_ticket` | `{deleted: …}` |
| 8 | `list_tickets` | 베이스라인 1건으로 복원 (정리 완료) |

→ **비결정 중복/누락 없음.** 생성·수정·삭제 모두 1회 정확 동작.

---

## 3. 화면 E2E (Playwright)

### 3-1. 로그인 → 내 작업 (라이트)
임시 계정으로 로그인 성공, 사이드바·대시보드 렌더, 콘솔 에러 0.

![login](shots/01-login.png)
![mywork](shots/02-mywork-light.png)

### 3-2. 워크스페이스 전환기
사이드바 상단 클릭 → "내 워크스페이스" 드롭다운 (현재=체크, "＋새 워크스페이스").

![switcher](shots/03-ws-switcher-open.png)

### 3-3. 새 워크스페이스 생성
인라인 입력 → 생성 → 새 워크스페이스로 자동 전환.

![create](shots/04-ws-create.png)

---

## 4. 워크스페이스 격리 (핵심)

같은 사용자가 워크스페이스만 바꿨을 때 데이터가 분리되는지 화면으로 대비.

| 신규 "__E2E QA팀" — **0 TICKETS (전부 EMPTY)** | 기본 워크스페이스 — **1 TICKETS** |
|---|---|
| ![new](shots/05-newws-tickets-empty.png) | ![default](shots/06-defaultws-tickets.png) |

> DB 레벨 RLS 격리도 별도 검증 통과 (비멤버 `sees_c2=0`, 멤버 `sees_c2=1`). `0011_workspaces.sql` 적용.

---

## 5. 채팅 줄바꿈 (DM·채널 버그 수정)

`<input>` → `<textarea>` 교체. **Enter=전송, Shift+Enter=줄바꿈**, 한글 IME 오전송 방지, 높이 자동확장.

![textarea](shots/07-textarea-multiline.png)

---

## 6. 다크모드

![dark](shots/08-mywork-dark.png)

---

## 7. 발견 사항 / 후속 과제

1. **MCP 생성물의 워크스페이스 미지정** (갭)
   서버 MCP 도구(`create_ticket`·`create_channel`·`create_project` 등)는 `workspace_id`를 안 찍어 `null`로 저장됨.
   UI 목록은 `workspace_id = 현재` 로 필터하므로 **MCP로 만든 항목이 어느 워크스페이스에도 안 보임**.
   → 해결안: ① MCP 도구에 `workspace`(이름/UUID) 인자 추가, 또는 ② PAT을 발급 사용자·기본 워크스페이스에 매핑해 자동 기입. (PAT→user 매핑과 함께 처리 권장)

2. **하위 엔티티 격리는 상속 의존**
   sprints/gantt/checklists는 프로젝트 목록이 워크스페이스로 필터되는 것에 의존(내부 신뢰 모델). 완전 격리는 PAT→user RLS 스코프 단계에서 강화.

3. 운영 배포 필요: 이번 변경(워크스페이스 + 줄바꿈)은 **로컬 검증 완료, 아직 미배포**.

---

## 부록 — 재현 방법

```bash
npm run dev                 # localhost:5173
# 임시 확인 계정은 admin API로 생성 후 테스트 종료 시 삭제(정리 완료)
# 스크린샷: docs/e2e-results/shots/*.png
```
</content>
