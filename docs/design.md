# TeamHub — 사내 협업 툴 설계

Slack류 사내 메신저 + 업무 관리(티켓·간트·체크리스트)를 합친 내부용 협업 도구.

## 1. 기능 브레인스토밍 (필요 기능 리스트업)

### 핵심 (MVP)
1. **메시징** — 채널/DM, 스레드, 실시간 수신(Supabase Realtime), 멘션
2. **파일 공유 (쉽게)** — 드래그&드롭 업로드, 채널별 파일함, 인라인 미리보기(이미지/PDF), 검색
3. **공지 (눈에 띄게)** — 상단 고정 배너, 우선순위/색상, 읽음 확인(ack) 추적, 만료일
4. **티켓** — 생성/담당자/상태(open·in_progress·done)/우선순위, 채널 연동, 코멘트
5. **간트차트** — 프로젝트 타임라인, 작업 기간, 의존 관계, 진행률
6. **체크리스트 + 팔로업** — 항목 체크, 담당자/마감일, 팔로업 알림(follow_up_at)

### 확장 (이후)
- 알림 센터 / 이메일·푸시, 전역 검색, SSO(회사 계정), 권한(역할), 이모지 반응, 음성/화상, 봇/웹훅, 모바일 PWA

## 2. 아키텍처

```
[브라우저 SPA: React+Vite+TS+Tailwind]
        │  @supabase/supabase-js
        ▼
[Supabase]  Postgres(RLS) · Auth(매직링크) · Storage(파일) · Realtime(메시지/공지)
        │
[Render]  프론트엔드 정적 사이트 호스팅 (render.yaml)
   + 팔로업 알림: Supabase Edge Function 또는 pg_cron (이후)
```

- **프론트엔드**: SPA. 라우팅은 react-router. 경량 상태는 zustand.
- **데이터/백엔드**: Supabase 한 곳에서 DB·인증·스토리지·실시간 처리. 별도 API 서버 없이 시작.
- **배포**: 프론트는 Render 정적 사이트, 데이터는 Supabase 클라우드. 환경변수로 연결.

## 3. 데이터 모델 (요약)

`supabase/migrations/0001_init.sql` 참조. 주요 테이블:

| 도메인 | 테이블 |
|--------|--------|
| 사용자 | `profiles` (auth.users 연동) |
| 메시징 | `channels`, `channel_members`, `messages` |
| 파일 | `files` (Storage `files` 버킷 경로 보관) |
| 공지 | `announcements`, `announcement_reads` |
| 티켓 | `tickets`, `ticket_comments` |
| 간트 | `projects`, `gantt_tasks`, `gantt_dependencies` |
| 체크리스트 | `checklists`, `checklist_items` (`follow_up_at`) |

Realtime 활성화: `messages`, `announcements`.

## 4. 배포 절차 (요약)

1. **Supabase 프로젝트 생성** → `0001_init.sql` 적용(MCP/대시보드/CLI), Storage `files` 버킷 생성.
2. **.env** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 입력(`.env.example` 참고).
3. **로컬 실행**: `npm install && npm run dev`.
4. **Render 배포**: `render.yaml` 로 정적 사이트 생성, 빌드 시 동일 env 주입.

## 5. 로드맵

- M0(현재): 스캐폴딩 + 스키마 + 6개 모듈 셸 + 메시징/공지 실동작
- M1: 파일 미리보기·검색, 티켓 코멘트, 간트 의존선, 체크리스트 팔로업 알림
- M2: 알림 센터, 권한/역할, SSO, 반응/멘션, PWA

## 6. 개발 하네스

이 저장소에는 harness 메타 스킬이 `.claude/skills/harness/` 에 **프로젝트 로컬**로 설치돼 있다. 기능 단위 개발 시 "하네스 구성해줘"로 이 프로젝트 전용 에이전트 팀/스킬을 생성해 활용한다.
