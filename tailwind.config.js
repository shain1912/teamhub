/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── 테마 토큰 (CSS 변수 → 라이트/다크 자동 플립) ──
        // 라이트: 인디고+민트 / 다크: 네온 핫핑크+시안
        brand: { DEFAULT: v('brand'), dark: v('brand-dark'), soft: v('brand-soft'), tint: v('brand-tint') },
        mint: { DEFAULT: v('mint'), soft: v('mint-soft'), ink: v('mint-ink') },
        info: { DEFAULT: v('info'), soft: v('info-soft'), ink: v('info-ink') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft'), ink: v('danger-ink') },

        canvas: v('canvas'), // 앱 배경
        bone: v('bone'), // 인셋/사이드바
        card: v('card'), // 카드/표면
        ink: v('ink'), // 기본 텍스트
        body: v('body'),
        charcoal: v('charcoal'),
        mute: v('mute'),
        ash: v('ash'),
        stone: v('stone'),
        success: v('mint'),
        hairline: 'var(--hairline)', // 보더 (rgba 직접)
      },
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      // borderRadius 는 Tailwind 표준 스케일 사용 (Stitch 정렬: lg=8px 버튼, xl=12px 카드)
      // 이전 커스텀(lg=16px·xl=24px)이 과하게 둥글어 제거함.
      boxShadow: {
        raised: '0 2px 4px rgba(0,0,0,0.05)',
        overlay: '0 10px 15px rgba(0,0,0,0.1)',
        // 다크 네온 글로우 (필요 시 shadow-glow / shadow-glow-mint)
        glow: '0 0 0 1px rgb(var(--brand) / 0.4), 0 0 18px rgb(var(--brand) / 0.25)',
        'glow-mint': '0 0 0 1px rgb(var(--mint) / 0.4), 0 0 18px rgb(var(--mint) / 0.25)',
      },
    },
  },
  plugins: [],
}
