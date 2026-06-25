/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 오렌지 — 도장처럼 희소하게(주요 CTA·활성 표시·링크)
        brand: { DEFAULT: '#ea2804', dark: '#c01f00', soft: '#ff6a3d' },
        canvas: '#f9f7f3', // 따뜻한 크림 — 기본 배경(순백 아님)
        bone: '#f3f0e8', // 반 단계 깊은 크림 — 인셋/컬럼
        ink: '#202020', // 기본 텍스트 + 사이드바
        body: '#3a3a3a',
        charcoal: '#575757',
        mute: '#646464',
        ash: '#8d8d8d',
        stone: '#bbbbbb',
        hairline: 'rgba(32,32,32,0.12)',
        success: '#2b9a66',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
