import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // 개발 편의를 위한 명확한 안내 (빌드는 통과, 런타임에 콘솔 경고)
  console.warn('[TeamKode] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다. .env 를 확인하세요.')
}

export const supabase = createClient(url ?? '', anonKey ?? '')
export const isSupabaseConfigured = Boolean(url && anonKey)
