import { useState } from 'react'
import { useAuth } from '../store/auth'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Login() {
  const signIn = useAuth((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email)
    setBusy(false)
    if (error) setError(error)
    else setSent(true)
  }

  return (
    <div className="grid h-full place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-brand">TeamHub</h1>
        <p className="mt-1 text-sm text-slate-500">사내 협업 워크스페이스</p>

        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            Supabase 환경변수가 설정되지 않았습니다. <code>.env</code> 를 채운 뒤 새로고침하세요.
          </p>
        )}

        {sent ? (
          <p className="mt-6 rounded-lg bg-green-50 p-4 text-sm text-green-700">
            로그인 링크를 <b>{email}</b> 로 보냈습니다. 메일함을 확인하세요.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              disabled={busy}
              className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? '전송 중…' : '매직링크로 로그인'}
            </button>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
