/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Indigo Synthesis (Stitch) ──
        // brand = deep indigo primary (CTA·사이드바·활성)
        brand: { DEFAULT: '#4a154b', dark: '#350f36', soft: '#6e3a6c', tint: '#f3eaf3' },
        // mint accent — 성공/Active/온라인
        mint: { DEFAULT: '#2bac76', soft: '#e6f6ee', ink: '#00714a' },
        // 우선순위/상태 칩
        info: { DEFAULT: '#3b82f6', soft: '#e7f0fe', ink: '#1e40af' },
        danger: { DEFAULT: '#ba1a1a', soft: '#ffe2e0', ink: '#93000a' },

        canvas: '#f8f9fa', // soft slate gray — 앱 프레임 배경
        bone: '#eef0f2', // surface-container — 인셋/컬럼
        card: '#ffffff', // surface — 카드/메인 콘텐츠
        ink: '#191c1d', // on-surface — 기본 텍스트
        body: '#3a3f42',
        charcoal: '#4f545a',
        mute: '#6b7177', // on-surface-variant
        ash: '#8a9097',
        stone: '#c2c7cc',
        hairline: 'rgba(20,23,30,0.10)', // 카드/구분 보더 (≈#E2E8F0)
        success: '#2bac76',
      },
      fontFamily: {
        // 전 영역 Inter (Stitch 명세)
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.5rem',
      },
      boxShadow: {
        // elevation 토큰
        raised: '0 2px 4px rgba(0,0,0,0.05)',
        overlay: '0 10px 15px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
}
