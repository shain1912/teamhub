import { create } from 'zustand'
import { supabase } from '../lib/supabase'

const KEY = 'teamkode:workspace'

export interface Workspace {
  id: string
  name: string
  created_by: string | null
}

interface WsState {
  list: Workspace[]
  currentId: string | null
  loading: boolean
  load: () => Promise<void>
  setCurrent: (id: string) => void
  create: (name: string) => Promise<{ error?: string; id?: string }>
  rename: (id: string, name: string) => Promise<{ error?: string }>
  remove: (id: string) => Promise<{ error?: string }>
  accept: (token: string) => Promise<{ error?: string; id?: string }>
}

export const useWorkspace = create<WsState>((set, get) => ({
  list: [],
  currentId: localStorage.getItem(KEY),
  loading: false,

  load: async () => {
    set({ loading: true })
    const { data } = await supabase
      .from('workspaces')
      .select('id, name, created_by')
      .order('created_at')
    const list = (data as Workspace[]) ?? []
    let cur = get().currentId
    if (!cur || !list.some((w) => w.id === cur)) cur = list[0]?.id ?? null
    if (cur) localStorage.setItem(KEY, cur)
    else localStorage.removeItem(KEY)
    set({ list, currentId: cur, loading: false })
  },

  setCurrent: (id) => {
    localStorage.setItem(KEY, id)
    set({ currentId: id })
  },

  create: async (name) => {
    const trimmed = name.trim()
    if (!trimmed) return { error: '이름을 입력하세요.' }
    const { data: u } = await supabase.auth.getUser()
    const uid = u.user?.id
    if (!uid) return { error: '로그인이 필요합니다.' }
    const { data, error } = await supabase
      .from('workspaces')
      .insert({ name: trimmed, created_by: uid })
      .select('id, name, created_by')
      .single()
    if (error) return { error: error.message }
    const ws = data as Workspace
    // 생성자를 owner 멤버로 등록 (멤버여야 RLS로 워크스페이스 데이터 접근 가능)
    await supabase.from('workspace_members').insert({ workspace_id: ws.id, user_id: uid, role: 'owner' })
    await get().load()
    get().setCurrent(ws.id)
    return { id: ws.id }
  },

  rename: async (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return { error: '이름을 입력하세요.' }
    const { error } = await supabase.from('workspaces').update({ name: trimmed }).eq('id', id)
    if (error) return { error: error.message }
    await get().load()
    return {}
  },

  remove: async (id) => {
    // 소유자(created_by)만 삭제 가능 — RLS(workspaces_delete)가 강제.
    // 채널·프로젝트·티켓·스프린트·체크리스트·초대·멤버는 모두 ON DELETE CASCADE로 함께 정리됨.
    // RLS에 막히면 PostgREST가 에러 없이 빈 결과를 반환하므로 삭제된 행을 select해 실제 삭제 여부를 확인한다.
    const { data, error } = await supabase.from('workspaces').delete().eq('id', id).select('id')
    if (error) return { error: error.message }
    if (!data || data.length === 0) return { error: '삭제 권한이 없거나 이미 삭제된 워크스페이스입니다.' }
    // 현재 워크스페이스가 삭제됐다면 load()가 남은 목록의 첫 항목으로 재선택(없으면 null).
    await get().load()
    return {}
  },

  accept: async (token) => {
    const trimmed = token.trim()
    if (!trimmed) return { error: '초대 코드를 입력하세요.' }
    const { data, error } = await supabase.rpc('accept_workspace_invite', { p_token: trimmed })
    if (error) return { error: error.message }
    const id = data as string
    await get().load()
    if (id) get().setCurrent(id)
    return { id }
  },
}))
