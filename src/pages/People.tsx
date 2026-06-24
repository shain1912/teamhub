import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { WorkBoard } from './MyWork'

function initials(p: Profile): string {
  const base = p.full_name ?? p.email ?? '?'
  return base.trim().charAt(0).toUpperCase() || '?'
}

function Avatar({ profile, size = 'h-10 w-10 text-sm' }: { profile: Profile; size?: string }) {
  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  }
  return (
    <div className={`${size} grid shrink-0 place-items-center rounded-full bg-brand/10 font-semibold text-brand`}>
      {initials(profile)}
    </div>
  )
}

/** 팀원 목록 */
function PeopleList() {
  const navigate = useNavigate()
  const [people, setPeople] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setPeople((data as Profile[]) ?? [])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold">팀원</h1>
        <p className="text-sm text-slate-500">팀원을 선택하면 배정된 작업을 볼 수 있습니다.</p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : people.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 팀원이 없습니다.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/people/${p.id}`)}
              className="flex items-center gap-3 rounded-xl border bg-white p-4 text-left transition hover:border-brand hover:shadow-sm"
            >
              <Avatar profile={p} />
              <div className="min-w-0">
                <div className="truncate font-semibold">{p.full_name ?? '(이름 없음)'}</div>
                <div className="truncate text-xs text-slate-500">{p.email ?? '-'}</div>
                <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {p.role}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 팀원 상세 */
function PersonDetail({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setProfile((data as Profile | null) ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <div className="h-full overflow-y-auto p-6">
      <button onClick={() => navigate('/people')} className="mb-4 text-sm text-slate-500 hover:text-brand">
        ← 팀원 목록
      </button>

      {loading ? (
        <p className="text-sm text-slate-400">불러오는 중…</p>
      ) : !profile ? (
        <div className="rounded-xl border bg-white p-6 text-sm text-slate-500">
          해당 팀원을 찾을 수 없습니다.
        </div>
      ) : (
        <>
          <div className="mb-5 flex items-center gap-4 rounded-xl border bg-white p-4">
            <Avatar profile={profile} size="h-14 w-14 text-lg" />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold">{profile.full_name ?? '(이름 없음)'}</h1>
              <div className="truncate text-sm text-slate-500">{profile.email ?? '-'}</div>
              <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {profile.role}
              </span>
            </div>
          </div>

          <WorkBoard userId={profile.id} />
        </>
      )}
    </div>
  )
}

export default function People() {
  const { userId } = useParams<{ userId: string }>()
  if (userId) return <PersonDetail userId={userId} />
  return <PeopleList />
}
