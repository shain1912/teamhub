---
name: teamhub-dev
description: TeamHub 코드베이스(React+Vite+Tailwind 프론트, Supabase, teamhub-mcp 서버, 인앱 GLM AI 비서)에서 기능을 추가·수정·배포할 때 쓰는 컨벤션·아키텍처·배포 절차. TeamHub 페이지/컴포넌트/MCP 도구/RLS/Render 배포 작업이나 "기능 추가/수정/배포해줘" 요청 시 사용.
---

# TeamHub 개발 컨벤션

## 아키텍처 (어디에 무엇이)

| 영역 | 위치 | 비고 |
|------|------|------|
| 프론트(SPA) | `src/` — pages·components·lib·store(zustand) | Render 정적사이트 `teamhub`, `team.kodekorea.kr` |
| 데이터/인증 | Supabase (`src/lib/supabase.ts`, anon+RLS) | 프론트는 **항상 로그인 사용자 세션**으로 동작 |
| MCP 서버 | `server/src/index.ts` (stdio + HTTP 전송) | Render web `teamhub-mcp`(싱가포르), service_role |
| AI 비서 | `src/components/AiChat.tsx`(루프), `src/lib/aiTools.ts`(도구), `src/lib/glm.ts`(프록시) | GLM 키는 **서버 `/ai/chat` 프록시에만** |

핵심 경계: **프론트는 anon+RLS, 서버(MCP/프록시)는 service_role.** service_role 키나 GLM 키는 절대 프론트 번들(`VITE_*`)에 두지 않는다.

## 빌드·검증

```bash
npm run build            # 프론트: tsc -b && vite build (루트)
cd server && npm run build   # 서버: tsc
```
- 코드 수정 후 **반드시 빌드로 타입 검증.** 에디트만 하고 끝내지 않는다.
- AI 비서(aiTools/AiChat/glm/프록시)를 건드렸으면 `ai-agent-verify` 스킬로 E2E 검증.

## RLS / 데이터

- 프론트에서 insert/update/delete는 그 사용자 권한으로 RLS를 통과해야 한다. UI가 이미 하는 작업이면 통과한다고 봐도 된다.
- 타 사용자 대상 쓰기(알림 등)는 RLS에 막힐 수 있어 **best-effort**로 감싼다(실패해도 본작업은 성공).
- 도구 실행기는 **이름→id 해석**을 한다: 생성/수정은 부분일치 허용, **삭제는 정확매칭만**(오삭제 방지).

## 배포 (Render — API/MCP로 직접 가능)

- 두 서비스 모두 `main` 푸시 시 **autoDeploy**. 커밋·푸시하면 프론트·서버가 자동 재배포된다.
- Render 조작은 `.env`의 `RENDER_API_KEY`로 API 호출(또는 Render MCP). service id:
  - 프론트 `teamhub`: `srv-d8tvoobtqb8s73eqqkmg`
  - 서버 `teamhub-mcp`: `srv-d8ujmdj7uimc73e9do5g` (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MCP_AUTH_TOKEN, GLM_API_KEY, GLM_MODEL)
- 배포 확인: 최신 deploy status가 `live` 인지 폴링. 서버는 `/healthz`로 헬스체크.
- ⚠️ Render 서비스 **리전은 생성 후 변경 불가**(KR 없음 → singapore). `VITE_*` 변수는 **빌드 시 번들에 박힘** → 변경 시 재배포 필요.

## 커밋

- 기능 단위로 커밋, 한국어 메시지. 무관한 변경(.env, 이미지 등)은 같이 커밋하지 않는다.
- `.env`는 gitignore됨(시크릿). 푸시 = 프로덕션 반영임을 인지하고 진행한다.

## 흔한 함정

- Supabase 기본 메일은 레이트리밋·도달률 문제 → 프로덕션은 커스텀 SMTP(닷홈 `mta-nm01.dothome.co.kr:465` 등).
- 도구를 늘리면 GLM 호출 컨텍스트가 커진다 — 꼭 필요한 도구만.
- 좁은 사이드바 폼에서 가로 배치 입력은 넘친다 → 세로(두 줄)로.
