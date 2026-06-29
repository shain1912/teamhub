# 디자인 변경 정리 — Stitch 확정본 반영 비교

> 각 항목: **Stitch 원본** vs **현재 우리 앱(실제 E2E 캡처)**. VS Code에서 `Ctrl+Shift+V`로 보면 이미지가 함께 렌더됩니다.
> 캡처: Playwright 데스크탑 1440px, 라이트/다크 각각. (목업의 "NEON_CORE"·인물사진은 Stitch 더미데이터 — 우리는 실제 제품명 TeamHub + 실데이터)

---

## 1. 색 / 폰트 — 근본 교체 (인디고 → 마젠타, Inter → Geist)

가장 큰 "원본과 다르다"의 원인이었습니다. 제가 초기에 옛 디자인시스템("Indigo Synthesis")의 **인디고**로 라이트 테마를 깔았는데, 확정본은 라이트도 **마젠타 `#b7004f`** 입니다. Stitch HTML에서 정확한 토큰을 추출해 전면 교체했습니다.

| 구분 | 이전(인디고) | 현재(마젠타 = 확정본) |
|------|------------|----------------------|
| 우리 앱 | ![](./ours_tickets_BEFORE_indigo.png) | ![](./ours_tickets_light.png) |

**바뀐 토큰 (확정 Material-3):**
| 토큰 | 라이트 | 다크 |
|------|--------|------|
| primary(주색) | `#b7004f` 마젠타 | `#ff2d78` 핫핑크 |
| secondary | `#006970` teal | `#00ffcc` 시안 |
| tertiary(info) | `#7000ff` 퍼플 | `#a78bfa` |
| surface/배경 | `#fbf8ff` 라벤더화이트 | `#0a0a12` 니어블랙 |
| on-surface(텍스트) | `#1a1b26` | `#e8e0f0` |
| 폰트 | **Geist**(본문)·**Space Grotesk**(제목)·**Space Mono**(ID/라벨) | (동일) |

---

## 2. 티켓 관리 (Kanban)

카드 구조를 Stitch HTML 그대로 재구성: 컬럼 헤더 **점(dot)+라벨+카운트**, 카드 **`#ID`(모노)+아웃라인 우선순위 칩+제목+설명 발췌+구분선 푸터(아바타·상대시간)**, 진행중 좌측 액센트, 완료 취소선.

| | Stitch 원본 | 우리 앱 |
|--|------------|---------|
| Light | ![](./stitch_tickets_light.png) | ![](./ours_tickets_light.png) |
| Dark | ![](./stitch_tickets_dark.png) | ![](./ours_tickets_dark.png) |

---

## 3. 스프린트 대시보드

진행률 히어로(인디고→마젠타 카드) + Remaining/Velocity 스탯 카드 + Top Priority 리스트.

| | Stitch 원본 | 우리 앱 |
|--|------------|---------|
| Light | ![](./stitch_sprint_light.png) | ![](./ours_sprints_light.png) |
| Dark | ![](./stitch_sprint_dark.png) | ![](./ours_sprints_dark.png) |

---

## 4. 공지사항

Featured 히어로(그라데이션) + 2열(메인/카테고리 레일) + Latest/Popular 토글 + 컬러 아이콘 타일.

| | Stitch 원본 | 우리 앱 |
|--|------------|---------|
| Light | ![](./stitch_announce_light.png) | ![](./ours_announce_light.png) |
| Dark | ![](./stitch_announce_dark.png) | ![](./ours_announce_dark.png) |

---

## 5. 간트 차트

| | Stitch 원본 | 우리 앱 |
|--|------------|---------|
| Light | ![](./stitch_gantt_light.png) | ![](./ours_gantt_light.png) |
| Dark | (원본 다크 미수집) | ![](./ours_gantt_dark.png) |

---

## 전면 재구현 (방침 전환 후 — 위 "우리 앱" 이미지가 재구현본)

사용자 피드백("싹 갈아엎고 기능을 디자인에 끼워맞춰라") 반영 — 기존 구조 보존을 멈추고 **Stitch HTML 구조를 프론트로 충실 재현**:

- **셸(사이드바)**: 워크스페이스 카드 + AI 프라이머리 버튼 + **좌측 액센트 활성** + 모노 대문자 섹션 → 원본 톤과 일치
- **티켓**: 컨텍스트 칩 헤더 + 점 컬럼헤더 + `#ID`·아웃라인칩·설명·구분선 푸터·댓글카운트 + EMPTY 플레이스홀더
- **간트**: `활성 로드맵` eyebrow + `COMPLETION%` 도넛 + 작업&담당자/날짜 컬럼 + **TODAY 라인** + 컬러 타임라인 바(완료 teal·진행 마젠타·대기)
- **스프린트**: **그래프 중심** — 원형 진행률 링 + 팀 벨로시티 막대차트(ACTUAL/TARGET) + 보드/백로그
- **공지**: `LIVE_FEED` eyebrow + 2열 featured(**좌측 액센트**·전문보기) + 최근공지 필터 pill + 날짜 리스트 + 페이지네이션

### 의도적으로 다른(유지) 점
- 메뉴 라벨/항목은 우리 실제 라우트(내작업·채널·DM·체크리스트 등) — 목업의 더미 메뉴와 다름
- 아바타: 사용자 사진 없으면 이니셜 원(목업은 더미 인물사진)
- 상단 분홍 공지 배너 = 실제 기능(목업엔 없음)
- 브랜딩: 목업 "NEON_CORE" 대신 실제 제품명 **TeamHub**

---

## 배포 커밋 (디자인 관련, 최신순)

| 커밋 | 내용 |
|------|------|
| `07fdb4f` | **Stitch 원본 충실 재구현 — 셸 + 4페이지 프론트 전면 재구성** |
| `934c32f` | 체크리스트 masonry(Padlet식) |
| `8336d39` | 확정 Stitch 팔레트/폰트 전면 교체 (인디고→마젠타, Inter→Geist) |
| `5f658d3` | 티켓 카드 Stitch 데스크탑 충실 이식(아웃라인 칩·#ID·설명·구분선 푸터) |
| `74e9f3e` | 다크모드 보조 텍스트 대비 향상 |
| `a4783d4` | 체크리스트 마감일 달력 UI + 네이티브 컨트롤 다크 대응 |
| `f07175e` | 버튼/카드 라운드 정렬(과한 둥글기 제거, lg 16→8px) |
| `54ca485` | 라이트/다크 테마 시스템(CSS변수 토큰 + 토글) |
