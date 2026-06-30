import { useEffect, useState } from 'react'
import { Shield, User, Users, Mail, Check, LogOut, Building2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useWorkspace } from '../store/workspace'

const ROLE: Record<string, { label: string; cls: string; icon: typeof Shield }> = {
  admin: { label: '관리자', cls: 'bg-brand/10 text-brand', icon: Shield },
  member: { label: '팀원', cls: 'bg-info/10 text-info', icon: User },
  guest: { label: '외부인', cls: 'bg-bone text-mute', icon: Users },
}

export default function MyPage() {
  const profile = useAuth((s) => s.profile)
  const signOut = useAuth((s) => s.signOut)
  const refreshProfile = useAuth((s) => s.refreshProfile)
  const { list, currentId, load } = useWorkspace()

  const [name, setName] = useState(profile?.full_name ?? '')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(profile?.full_name ?? '')
  }, [profile?.full_name])
  useEffect(() => {
    load()
  }, [load])

  if (!profile) return <div className="grid h-full place-items-center text-ash">불러오는 중…</div>

  const role = ROLE[profile.role] ?? ROLE.member
  const RoleIcon = role.icon
  const inits = (profile.full_name || profile.email || '?').trim().charAt(0).toUpperCase()
  const dirty = name.trim() !== (profile.full_name ?? '').trim() && name.trim().length > 0

  async function save() {
    if (!dirty || busy || !profile) return
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id)
    setBusy(false)
    if (error) {
      alert('저장 실패: ' + error.message)
      return
    }
    await refreshProfile()
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <h1 className="font-display text-2xl font-bold text-ink">마이페이지</h1>
      <p className="mt-1 text-sm text-mute">내 프로필과 소속 워크스페이스를 관리합니다.</p>

      {/* 프로필 카드 */}
      <section className="mt-6 rounded-2xl border border-hairline bg-card p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-brand/10 text-xl font-bold text-brand">
            {inits}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold text-ink">{profile.full_name ?? '이름 없음'}</div>
            <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${role.cls}`}>
              <RoleIcon size={12} /> {role.label}
            </div>
          </div>
        </div>

        {/* 이름 수정 */}
        <div className="mt-5">
          <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">표시 이름</label>
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-hairline px-3 py-2 text-sm outline-none focus:border-brand"
              placeholder="이름"
            />
            <button
              onClick={save}
              disabled={!dirty || busy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-40"
            >
              {saved ? <Check size={15} /> : null} {saved ? '저장됨' : '저장'}
            </button>
          </div>
        </div>

        {/* 이메일 (읽기전용) */}
        <div className="mt-4">
          <label className="mb-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">이메일</label>
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-bone px-3 py-2 text-sm text-mute">
            <Mail size={14} className="shrink-0" /> {profile.email ?? '—'}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-ash">역할 변경은 관리자에게 문의하세요. (관리자만 워크스페이스 생성 가능)</p>
      </section>

      {/* 소속 워크스페이스 */}
      <section className="mt-5 rounded-2xl border border-hairline bg-card p-5">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">
          <Building2 size={13} /> 소속 워크스페이스 ({list.length})
        </div>
        <div className="divide-y divide-hairline">
          {list.map((w) => (
            <div key={w.id} className="flex items-center gap-2 py-2.5 text-sm">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand/10 text-[11px] font-bold text-brand">
                {w.name.trim().charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink">{w.name}</span>
              {w.id === currentId && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">현재</span>
              )}
            </div>
          ))}
          {list.length === 0 && <p className="py-3 text-sm text-ash">소속된 워크스페이스가 없습니다.</p>}
        </div>
      </section>

      {/* 로그아웃 */}
      <button
        onClick={signOut}
        className="mt-5 flex items-center gap-2 rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger-soft"
      >
        <LogOut size={15} /> 로그아웃
      </button>
    </div>
  )
}
