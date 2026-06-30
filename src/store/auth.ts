import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  init: () => Promise<void>
  signIn: (email: string) => Promise<{ error?: string }>
  signInPassword: (email: string, password: string) => Promise<{ error?: string }>
  signUpPassword: (
    email: string,
    password: string,
  ) => Promise<{ error?: string; needsConfirm?: boolean }>
  signInGoogle: () => Promise<{ error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  profile: null,
  loading: true,

  init: async () => {
    const { data } = await supabase.auth.getSession()
    set({ session: data.session })
    if (data.session) await loadProfile(set)
    set({ loading: false })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      set({ session })
      if (session) await loadProfile(set)
      else set({ profile: null })
    })
  },

  // 비밀번호 로그인 (기본) — 메일 왕복 없이 즉시
  signInPassword: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { error: error.message } : {}
  },

  // 회원가입 — 이메일 확인이 꺼져 있으면 즉시 로그인, 켜져 있으면 확인 메일
  signUpPassword: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }
    return { needsConfirm: !data.session }
  },

  // 구글 OAuth (Supabase Google provider 활성화 필요)
  signInGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    return error ? { error: error.message } : {}
  },

  // 매직링크 (보조)
  signIn: async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    return error ? { error: error.message } : {}
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, profile: null })
  },

  refreshProfile: async () => {
    await loadProfile(set)
  },
}))

async function loadProfile(set: (p: Partial<AuthState>) => void) {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle()
  set({ profile: profile as Profile | null })
}
