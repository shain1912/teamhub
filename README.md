# TeamHub

사내 협업 툴 — 메신저 + 파일 공유 + 공지 + 티켓 + 간트차트 + 체크리스트.

- 프론트엔드: React + Vite + TypeScript + Tailwind
- 백엔드/데이터: Supabase (Postgres · Auth · Storage · Realtime)
- 배포: Render (정적 사이트) + Supabase 클라우드

설계 문서: [`docs/design.md`](docs/design.md)

## 빠른 시작

```bash
npm install

# 1) Supabase 프로젝트 생성 후 스키마 적용
#    supabase/migrations/0001_init.sql 을 대시보드 SQL Editor 또는 CLI로 실행
#    Storage 에 'files' 버킷 생성

# 2) 환경변수 설정
cp .env.example .env   # 값 채우기 (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)

# 3) 실행
npm run dev            # http://localhost:5173
```

## 배포 (Render)

1. 이 저장소를 GitHub에 푸시.
2. Render → New → Blueprint → `render.yaml` 선택.
3. 환경변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 입력 후 배포.

## 구조

```
src/
├── lib/         supabase 클라이언트, 타입
├── store/       zustand 상태(auth)
├── components/  레이아웃, 사이드바, 공지 배너
└── pages/       Channels(메신저+파일) / Announcements / Tickets / Gantt / Checklists
supabase/migrations/0001_init.sql   DB 스키마
```

## 에이전트 백엔드 (MCP)

`server/` 는 에이전트/LLM가 메시지·공지·티켓·간트·체크리스트를 도구 호출로 CRUD 하는 **MCP 서버**다.
설정·도구 카탈로그·요약 워크플로우: [`docs/agent-backend.md`](docs/agent-backend.md).

```bash
cd server && npm install && npm run build
# .env 에 SUPABASE_SERVICE_ROLE_KEY 추가 후 Claude Code 재시작 → 'teamhub' MCP 연결
```

## 개발 하네스

harness 메타 스킬이 `.claude/skills/harness/` 에 프로젝트 로컬로 설치돼 있다.
새 기능 단위 작업 시 "하네스 구성해줘"로 이 프로젝트 전용 에이전트 팀/스킬을 생성할 수 있다.
