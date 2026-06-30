import { useEffect, useState } from 'react'
import { X, Check, UserPlus, UserMinus, Pencil, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useWorkspace } from '../store/workspace'
import type { Profile } from '../lib/types'

interface Member {
  user_id: string
  role: string
  profile: Profile | null
}

export default function WorkspaceSettings({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const me = useAuth((s) => s.profile)
  const { list, rename } = useWorkspace()
  const ws = list.find((w) => w.id === workspaceId)

  const [name, setName] = useState(ws?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)

  const [members, setMembers] = useState<Member[]>([])
  const [allProfiles, setAllProfiles] = useState<Profile[]>([])
  const [addId, setAddId] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadMembers() {
    const { data: mem } = await supabase
      .from('workspace_members')
      .select('user_id, role')
      .eq('workspace_id', workspaceId)
    const ids = ((mem as { user_id: string; role: string }[]) ?? []).map((m) => m.user_id)
    const { data: profs } = ids.length
      ? await supabase.from('profiles').select('*').in('id', ids)
      : { data: [] as Profile[] }
    const pmap = new Map((profs as Profile[] ?? []).map((p) => [p.id, p]))
    setMembers(
      ((mem as { user_id: string; role: string }[]) ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        profile: pmap.get(m.user_id) ?? null,
      })),
    )
  }

  useEffect(() => {
    loadMembers()
    // 게스트 제외 전체 프로필(추가 후보)
    supabase
      .from('profiles')
      .select('*')
      .neq('role', 'guest')
      .order('full_name')
      .then(({ data }) => setAllProfiles((data as Profile[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function saveName() {
    if (!name.trim() || savingName) return
    setSavingName(true)
    const { error } = await rename(workspaceId, name)
    setSavingName(false)
    if (error) {
      alert('이름 변경 실패: ' + error)
      return
    }
    setNameSaved(true)
    setTimeout(() => setNameSaved(false), 1600)
  }

  async function addMember() {
    if (!addId) return
    setBusy(true)
    const { error } = await supabase.from('workspace_members').insert({ workspace_id: workspaceId, user_id: addId, role: 'member' })
    setBusy(false)
    if (error) {
      alert('멤버 추가 실패: ' + error.message)
      return
    }
    setAddId('')
    loadMembers()
  }

  async function removeMember(m: Member) {
    if (m.user_id === ws?.created_by) {
      alert('워크스페이스 소유자는 제거할 수 없습니다.')
      return
    }
    if (!confirm(`${m.profile?.full_name ?? m.profile?.email ?? '이 멤버'}를 워크스페이스에서 제외할까요?`)) return
    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', m.user_id)
    if (error) {
      alert('제거 실패: ' + error.message)
      return
    }
    loadMembers()
  }

  const memberIds = new Set(members.map((m) => m.user_id))
  const candidates = allProfiles.filter((p) => !memberIds.has(p.id))

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-hairline bg-card shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <h2 className="font-display text-base font-bold text-ink">워크스페이스 설정</h2>
          <button onClick={onClose} className="text-ash hover:text-ink" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 p-5">
          {/* 이름 변경 */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">
              <Pencil size={12} /> 워크스페이스 이름
            </label>
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveName()
                }}
                className="min-w-0 flex-1 rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <button
                onClick={saveName}
                disabled={savingName || !name.trim() || name.trim() === ws?.name}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
              >
                {nameSaved ? <Check size={15} /> : null} {nameSaved ? '저장됨' : '변경'}
              </button>
            </div>
          </div>

          {/* 멤버 관리 */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">
              <Users size={12} /> 멤버 ({members.length})
            </div>

            {/* 추가 */}
            <div className="mb-3 flex items-center gap-2">
              <select
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-hairline bg-card px-3 py-2 text-sm outline-none focus:border-brand"
              >
                <option value="">+ 팀원 추가…</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name ?? p.email}
                  </option>
                ))}
              </select>
              <button
                onClick={addMember}
                disabled={!addId || busy}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand bg-brand/5 px-3 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-40"
              >
                <UserPlus size={15} /> 추가
              </button>
            </div>

            {/* 목록 */}
            <div className="divide-y divide-hairline rounded-lg border border-hairline">
              {members.map((m) => {
                const isOwner = m.user_id === ws?.created_by
                return (
                  <div key={m.user_id} className="flex items-center gap-2.5 px-3 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                      {(m.profile?.full_name || m.profile?.email || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">
                        {m.profile?.full_name ?? m.profile?.email ?? m.user_id.slice(0, 8)}
                        {m.user_id === me?.id && <span className="ml-1 text-[11px] text-ash">(나)</span>}
                      </div>
                      <div className="truncate text-[11px] text-ash">{m.profile?.email}</div>
                    </div>
                    {isOwner ? (
                      <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">소유자</span>
                    ) : (
                      <button
                        onClick={() => removeMember(m)}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-danger transition hover:bg-danger-soft"
                      >
                        <UserMinus size={12} /> 제외
                      </button>
                    )}
                  </div>
                )
              })}
              {members.length === 0 && <p className="px-3 py-4 text-center text-xs text-ash">멤버가 없습니다.</p>}
            </div>
            <p className="mt-2 text-[11px] text-ash">멤버만 이 워크스페이스의 채널·티켓·스프린트·체크리스트를 볼 수 있습니다.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
