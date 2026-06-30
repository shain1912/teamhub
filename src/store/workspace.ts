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
}))
