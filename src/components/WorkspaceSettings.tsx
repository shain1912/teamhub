import { useEffect, useState } from 'react'
import { X, Check, UserPlus, UserMinus, Pencil, Users, Link2, Mail, Copy, Ban } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useWorkspace } from '../store/workspace'
import type { Profile } from '../lib/types'

interface Member {
  user_id: string
  role: string
  profile: Profile | null
}

interface Invite {
  id: string
  token: string
  email: string | null
  role: string
  max_uses: number | null
  used_count: number
  expires_at: string | null
  revoked: boolean
  created_at: string
}

type InviteRole = 'member' | 'guest'

function newToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
}

function inviteLink(token: string) {
  return `${window.location.origin}/join?invite=${token}`
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

  // 초대
  const [invites, setInvites] = useState<Invite[]>([])
  const [shareRole, setShareRole] = useState<InviteRole>('member')
  const [inviteEmail, setInviteEmail] = useState('')
  const [emailRole, setEmailRole] = useState<InviteRole>('member')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

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

  async function loadInvites() {
    const { data } = await supabase
      .from('workspace_invites')
      .select('id, token, email, role, max_uses, used_count, expires_at, revoked, created_at')
      .eq('workspace_id', workspaceId)
      .eq('revoked', false)
      .order('created_at', { ascending: false })
    setInvites((data as Invite[]) ?? [])
  }

  useEffect(() => {
    loadMembers()
    loadInvites()
    // 게스트 제외 전체 프로필(추가 후보)
    supabase
      .from('profiles')
      .select('*')
      .neq('role', 'guest')
      .order('full_name')
      .then(({ data }) => setAllProfiles((data as Profile[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token))
      setCopied(token)
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1600)
    } catch {
      alert('복사에 실패했습니다. 링크: ' + inviteLink(token))
    }
  }

  async function createShareLink() {
    if (inviteBusy) return
    setInviteBusy(true)
    const token = newToken()
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('workspace_invites').insert({
      workspace_id: workspaceId,
      token,
      email: null,
      role: shareRole,
      max_uses: null,
      created_by: me?.id ?? null,
      expires_at: expires,
    })
    setInviteBusy(false)
    if (error) {
      alert('링크 생성 실패: ' + error.message)
      return
    }
    await loadInvites()
    copyLink(token)
  }

  async function createEmailInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || inviteBusy) return
    setInviteBusy(true)
    const token = newToken()
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('workspace_invites').insert({
      workspace_id: workspaceId,
      token,
      email,
      role: emailRole,
      max_uses: 1,
      created_by: me?.id ?? null,
      expires_at: expires,
    })
    setInviteBusy(false)
    if (error) {
      alert('초대 생성 실패: ' + error.message)
      return
    }
    setInviteEmail('')
    await loadInvites()
    copyLink(token)
  }

  async function revokeInvite(inv: Invite) {
    if (!confirm('이 초대를 취소할까요? 취소하면 링크가 더 이상 동작하지 않습니다.')) return
    const { error } = await supabase.from('workspace_invites').update({ revoked: true }).eq('id', inv.id)
    if (error) {
      alert('취소 실패: ' + error.message)
      return
    }
    loadInvites()
  }

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

          {/* 초대 */}
          <div>
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">
              <UserPlus size={12} /> 초대
            </div>

            {/* 공유 링크 */}
            <div className="mb-3 rounded-lg border border-hairline p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Link2 size={13} className="text-brand" /> 공유 링크
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={shareRole}
                  onChange={(e) => setShareRole(e.target.value as InviteRole)}
                  className="min-w-0 flex-1 rounded-lg border border-hairline bg-card px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="member">팀원</option>
                  <option value="guest">외부인</option>
                </select>
                <button
                  onClick={createShareLink}
                  disabled={inviteBusy}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand bg-brand/5 px-3 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-40"
                >
                  <Link2 size={15} /> 링크 생성
                </button>
              </div>
              <p className="mt-2 text-[11px] text-ash">이 링크를 아는 사람은 누구나 참여할 수 있습니다(30일 후 만료).</p>
            </div>

            {/* 이메일 1인용 초대 */}
            <div className="mb-3 rounded-lg border border-hairline p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Mail size={13} className="text-brand" /> 이메일 초대 (1인용)
              </div>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="invitee@example.com"
                className="mb-2 w-full rounded-lg border border-hairline bg-card px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <div className="flex items-center gap-2">
                <select
                  value={emailRole}
                  onChange={(e) => setEmailRole(e.target.value as InviteRole)}
                  className="min-w-0 flex-1 rounded-lg border border-hairline bg-card px-3 py-2 text-sm outline-none focus:border-brand"
                >
                  <option value="member">팀원</option>
                  <option value="guest">외부인</option>
                </select>
                <button
                  onClick={createEmailInvite}
                  disabled={inviteBusy || !inviteEmail.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand bg-brand/5 px-3 py-2 text-sm font-semibold text-brand transition hover:bg-brand/10 disabled:opacity-40"
                >
                  <Mail size={15} /> 초대
                </button>
              </div>
              <p className="mt-2 text-[11px] text-ash">생성된 링크를 해당 이메일 사용자에게 전달하세요. 그 이메일로 로그인한 사람만 1회 사용할 수 있습니다.</p>
            </div>

            {/* 초대 목록 */}
            <div className="divide-y divide-hairline rounded-lg border border-hairline">
              {invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2.5 px-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                    {inv.email ? <Mail size={14} /> : <Link2 size={14} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">
                      {inv.email ?? '공유 링크'}
                      <span className="ml-1.5 rounded-full bg-bone px-1.5 py-0.5 text-[10px] font-semibold text-mute">
                        {inv.role === 'guest' ? '외부인' : '팀원'}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-ash">
                      사용 {inv.used_count}
                      {inv.max_uses != null ? `/${inv.max_uses}` : ''}
                      {inv.expires_at ? ` · ${new Date(inv.expires_at).toLocaleDateString()} 만료` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => copyLink(inv.token)}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-mute transition hover:bg-bone hover:text-ink"
                  >
                    {copied === inv.token ? <Check size={12} /> : <Copy size={12} />}
                    {copied === inv.token ? '복사됨' : '링크'}
                  </button>
                  <button
                    onClick={() => revokeInvite(inv)}
                    className="flex shrink-0 items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-danger transition hover:bg-danger-soft"
                  >
                    <Ban size={12} /> 취소
                  </button>
                </div>
              ))}
              {invites.length === 0 && <p className="px-3 py-4 text-center text-xs text-ash">활성 초대가 없습니다.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
