---
name: Indigo Synthesis
colors:
  surface: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  on-surface: '#191c1d'
  on-surface-variant: '#4f434c'
  outline: '#80737d'
  primary: '#4a154b'
  on-primary: '#ffffff'
  primary-container: '#4a154b'
  secondary: '#2bac76'
  tertiary: '#607d8b'
  error: '#ba1a1a'
  error-container: '#ffdad6'
typography:
  headline-lg: { fontFamily: Inter, fontSize: 32px, fontWeight: '700', lineHeight: 40px, letterSpacing: -0.02em }
  headline-md: { fontFamily: Inter, fontSize: 24px, fontWeight: '600', lineHeight: 32px, letterSpacing: -0.01em }
  headline-sm: { fontFamily: Inter, fontSize: 18px, fontWeight: '600', lineHeight: 24px }
  body-lg: { fontFamily: Inter, fontSize: 16px, fontWeight: '400', lineHeight: 24px }
  body-md: { fontFamily: Inter, fontSize: 14px, fontWeight: '400', lineHeight: 20px }
  body-sm: { fontFamily: Inter, fontSize: 12px, fontWeight: '400', lineHeight: 18px }
  label-md: { fontFamily: Inter, fontSize: 13px, fontWeight: '600', lineHeight: 16px }
rounded: { sm: 0.25rem, DEFAULT: 0.5rem, md: 0.75rem, lg: 1rem, xl: 1.5rem, full: 9999px }
spacing: { base: 4px, sm: 8px, md: 16px, lg: 24px, xl: 32px }
---

> TeamHub(브랜딩: **TeamKode**)의 source-of-truth 디자인 명세. Stitch 프로젝트 `7986685272346136680` 에서 추출.
> 화면 원본: `.stitch/designs/*.png` (login·signup·tickets·gantt·sprints·announcements)

## Brand & Style

권위 있으면서 접근 가능한 — 고속 팀 동기화를 위한 **Corporate Modern** 스타일. 신뢰성과 구조적 명료함 강조.
정보 밀도가 높은 환경(엔지니어링·PM·크리에이티브)에서 인지 부하를 최소화. "Systematic Minimalist" 접근:
의도적 여백으로 스레드/모듈 분리, 스냅한 트랜지션, 장식 최소화. 감정 톤은 **집중된 생산성**.

## Colors

- **Primary `#4A154B`** (deep indigo) — 사이드바, 주요 CTA, 큰 타이틀. 브랜드 존재감/시각적 무게.
- **Secondary/Accent `#2BAC76`** (mint) — 성공 상태, 온라인/Active 인디케이터, "new"/활성 강조.
- **Tertiary `#607D8B`** (slate) — 보조 메타데이터, 아이콘, 비핵심 보더.
- **Background**: 메인 콘텐츠 흰색 `#FFFFFF`, 컨테이너 배경은 soft slate gray `#F8F9FA`.
- **우선순위 칩**: HIGH = mint, MEDIUM = light blue, LOW = gray, URGENT/BLOCKER = red(`#BA1A1A`)/pink.

## Typography

전 영역 **Inter**. 타이트한 모듈러 스케일(밀도). Body = Regular(400), 위계 = Semibold(600)/Bold(700).
본문 line-height는 약간 넉넉, 라벨/태그는 타이트. 모바일에서 대형 헤드라인 축소.

## Layout & Spacing

**8px 그리드.**
- **Desktop**: 3-pane fixed-fluid 하이브리드. 좌측 네비 사이드바 고정(260px), 보조 채널/리스트 페인 고정(300px), 메인 fluid.
- **Mobile**: 단일 페인 + 슬라이드 드로어. 하단 탭바(Home · Tasks · Projects · Notice · Profile).
- 밀집 리스트(채팅)는 4px(xs) 간격 허용. 워크스페이스 컨테이너 마진 desktop 24px / mobile 16px.

## Elevation

Tonal Layer + 저대비 아웃라인 위주(무거운 그림자 지양).
1. **Base** `#FFFFFF` 메인 캔버스
2. **Sub-surface** `#F8F9FA` 사이드바·검색바
3. **Raised** 카드/플로팅: 1px `#E2E8F0` 보더 + `0 2px 4px rgba(0,0,0,0.05)`
4. **Overlay** 모달/드롭다운: `0 10px 15px rgba(0,0,0,0.1)`
인디고 사이드바가 최심층 앵커.

## Shapes

일관되게 **Rounded**. 표준(버튼·인풋·카드) `0.5rem(8px)`, 소형(체크박스·태그) `0.25rem(4px)`,
아바타는 완전 원형, 사이드바 활성 표시는 leading-edge pill.

## Components

- **Buttons**: Primary = solid indigo `#4A154B` + 흰 텍스트, 8px radius, 150ms hover. Secondary = slate 보더 + indigo 텍스트.
- **Cards**: 흰 배경, 8px radius, 1px slate 보더. 카드 내 헤더는 `label-md`.
- **Inputs**: 1px slate 보더 → focus 시 indigo로 두꺼워짐. 배경 `#FFF` 또는 `#F8F9FA`.
- **Chips/Tags**: 상태용. Success = mint 10% 배경 + 100% 텍스트.
- **Lists**: 컴팩트 수직 리듬, hover 시 Quick Action 바(이모지·답글·스레드) 노출(Level 2).
- **Nav**: 채널 리스트 hover = indigo 10%. 활성 = leading pill.
- **Stat 카드**: 아이콘 + 라벨 + 큰 숫자. 진행률 = 인디고 원형 링.
