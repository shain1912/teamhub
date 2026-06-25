# TeamHub

협업 워크스페이스 — React+Vite+Tailwind 프론트, Supabase, teamhub-mcp 서버, 우하단 GLM AI 비서.

## 하네스: TeamHub 개발

**목표:** TeamHub를 안전하게 개발·검증·배포한다. 특히 인앱 AI 비서의 비결정적 도구호출 버그(중복/누락 생성)를 E2E로 잡는다.

**트리거:** TeamHub 기능 추가·수정·버그수정·배포 요청 시 `teamhub-orchestrator` 스킬을 사용하라. 단순 질문은 직접 응답 가능. AI 비서 계층(`src/lib/aiTools.ts`·`src/components/AiChat.tsx`·`src/lib/glm.ts`·서버 `/ai/chat`)을 건드린 직후엔 `ai-agent-verify` 스킬로 반드시 검증하라.

**구성:** 에이전트 팀(teamhub-builder · ai-verify · teamhub-reviewer) + 스킬(teamhub-dev · ai-agent-verify · teamhub-orchestrator). 상세는 `.claude/agents/`·`.claude/skills/`.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-26 | 초기 구성 | 전체 | AI 비서 중복/누락 생성 버그 재발 방지 + 개발·배포 표준화 |
