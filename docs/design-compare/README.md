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

## 아직 원본과 다른 점 (정직)

색·티켓카드는 맞췄지만 **공통 셸(크롬)** 이 아직 다릅니다 — 다음 작업 대상:

1. **페이지 헤더** — 원본: 큰 `Kanban Board` 제목 + 스프린트 컨텍스트 pill + `Target Delivery` + 아바타 스택 + `FILTERS`/`VIEW_LOGS` 버튼. 우리: "티켓" + 담당자/라벨 드롭다운 + 새 티켓.
2. **사이드바 톤** — 원본: 상단 워크스페이스 카드(Project Alpha) + 사이드바 안에 기본 버튼. 우리: 메인/커뮤니케이션/기타 섹션 + 하단 프로필. (메뉴 항목은 우리 실제 라우트라 다름)
3. **아바타** — 원본은 실제 인물 사진, 우리는 이니셜 원(사용자 avatar_url 없음).
4. **공지 배너** — 우리는 상단 분홍 공지 바가 추가로 있음(실기능). 원본 목업엔 없음.

---

## 배포 커밋 (디자인 관련, 최신순)

| 커밋 | 내용 |
|------|------|
| `8336d39` | 확정 Stitch 팔레트/폰트 전면 교체 (인디고→마젠타, Inter→Geist) |
| `5f658d3` | 티켓 카드 Stitch 데스크탑 충실 이식(아웃라인 칩·#ID·설명·구분선 푸터) |
| `74e9f3e` | 다크모드 보조 텍스트 대비 향상 |
| `a4783d4` | 체크리스트 마감일 달력 UI + 네이티브 컨트롤 다크 대응 |
| `f07175e` | 버튼/카드 라운드 정렬(과한 둥글기 제거, lg 16→8px) |
| `54ca485` | 라이트/다크 테마 시스템(CSS변수 토큰 + 토글) |
