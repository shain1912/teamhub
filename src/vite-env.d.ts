/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // AI 비서 프록시 URL (teamhub-mcp). 미설정 시 배포된 기본값 사용. GLM 키는 서버에만 있음.
  readonly VITE_AI_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
