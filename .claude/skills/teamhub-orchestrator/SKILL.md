---
name: teamhub-orchestrator
description: TeamHub 개발 작업(기능 추가·수정, 버그 수정, 배포)을 빌더·AI검증·리뷰어 에이전트 팀으로 조율한다. "TeamHub 기능 만들어/고쳐줘", "AI 비서 수정", "배포해줘", "이거 다시/보완해줘" 등 TeamHub 개발 요청 시 사용. 단순 질문은 직접 응답.
---

# TeamHub 오케스트레이터

TeamHub 개발을 **생성–검증** 패턴의 에이전트 팀으로 굴린다.
구현(teamhub-builder) → AI 비서면 검증(ai-verify) → 리뷰(teamhub-reviewer) → 배포.

## Phase 0: 컨텍스트 확인
- `_workspace/` 존재 + 부분 수정 요청 → **부분 재실행**(해당 에이전트만).
- `_workspace/` 존재 + 새 입력 → 기존을 `_workspace_prev/`로 옮기고 **새 실행**.
- 미존재 → **초기 실행**.
- 변경 범위 파악: AI 비서 계층(aiTools/AiChat/glm/프록시)을 건드리는가? → 그렇다면 ai-verify 필수.

## Phase 1: 구현
- 실행 모드: **에이전트 팀**. 리더가 `TeamCreate`로 builder·ai-verify·reviewer 구성, `TaskCreate`로 작업 할당.
- builder가 `teamhub-dev` 스킬을 따라 구현하고 빌드로 타입 검증.

## Phase 2: 검증 (AI 비서 변경 시 필수)
- builder가 AI 비서 계층을 바꿨으면 ai-verify가 `ai-agent-verify` 스킬로 E2E 검증(반복 실행).
- 버그 발견 → ai-verify가 근본원인+권장수정을 builder에 전달 → 재구현 → 재검증(통과까지).
- AI 비서와 무관한 변경이면 이 Phase는 건너뛴다.

## Phase 3: 리뷰
- reviewer가 시크릿 경계·RLS·멱등성·삭제안전·단순성 체크. 높음 항목은 builder가 수정.

## Phase 4: 배포
- 빌드 통과 + 검증/리뷰 통과 후에만 커밋·푸시(`main` → 자동배포).
- 배포 상태를 `live`까지 폴링(`teamhub-dev`의 service id/healthz). 프로덕션 반영을 사용자에게 알린다.

## 데이터 전달
- 태스크 기반(조율) + 파일 기반(`_workspace/{phase}_{agent}_*.md` 산출물) + 메시지 기반(builder↔ai-verify↔reviewer 직접 소통).

## 에러 핸들링
- 에이전트 1회 재시도 후 재실패 → 해당 결과 없이 진행하되 **보고서에 누락 명시**.
- 검증/리뷰가 막히면(프록시 다운, 배포 실패) 진행을 멈추고 원인 보고. "검증 불가 ≠ 통과".

## 테스트 시나리오
- **정상**: "AI 비서에 라벨 일괄변경 도구 추가" → builder 구현+빌드 → ai-verify가 신규도구 시나리오로 E2E(중복/누락 없음) → reviewer 통과 → 커밋·배포·폴링 live.
- **에러**: ai-verify가 "간트 2개 중복" 발견 → builder에 "create_gantt_task 멱등화/루프 dedup" 전달 → 재구현 → 재검증 통과 후에만 배포.
