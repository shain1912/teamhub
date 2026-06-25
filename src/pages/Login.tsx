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
    <div className="grid h-full place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        {/* 표지: 큰 디스플레이 헤드라인 + 모노 아이브로 */}
        <div className="mb-7">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-brand" />
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-mute">internal workspace</span>
          </div>
          <h1 className="mt-3 font-display text-6xl font-extrabold leading-[0.95] tracking-tight text-ink">
            TeamHub
          </h1>
          <p className="mt-3 text-body">팀과 클라이언트가 한곳에서 일하는 협업 워크스페이스.</p>
        </div>

        <div className="rounded-2xl border border-hairline bg-white p-6">
          {!isSupabaseConfigured && (
            <p className="mb-4 rounded-xl bg-brand/10 p-3 text-xs text-brand-dark">
              Supabase 환경변수가 비어 있습니다. <code className="font-mono">.env</code>를 채운 뒤 새로고침하세요.
            </p>
          )}

          {sent ? (
            <p className="rounded-xl bg-success/10 p-4 text-sm text-success">
              로그인 링크를 <b className="font-mono">{email}</b>로 보냈습니다. 메일함을 확인하세요.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <label className="block font-mono text-[11px] uppercase tracking-wider text-mute">회사 이메일</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-full border border-hairline bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-ink"
              />
              <button
                disabled={busy}
                className="w-full rounded-full bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? '보내는 중…' : '매직링크 받기'}
              </button>
              {error && <p className="text-xs text-brand-dark">{error}</p>}
            </form>
          )}
        </div>

        <p className="mt-4 text-center font-mono text-[11px] text-ash">made with TeamHub · Supabase · Render</p>
      </div>
    </div>
  )
}
