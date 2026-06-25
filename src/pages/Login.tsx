import { useState } from 'react'
import { useAuth } from '../store/auth'
import { isSupabaseConfigured } from '../lib/supabase'

type Mode = 'login' | 'signup'

export default function Login() {
  const { signInPassword, signUpPassword, signIn } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    if (mode === 'login') {
      const { error } = await signInPassword(email, password)
      if (error) setError(translate(error))
    } else {
      const { error, needsConfirm } = await signUpPassword(email, password)
      if (error) setError(translate(error))
      else if (needsConfirm) setNotice(`확인 메일을 ${email}로 보냈습니다. 링크를 누르면 가입이 끝납니다.`)
      // needsConfirm=false 면 onAuthStateChange가 자동 로그인 처리
    }
    setBusy(false)
  }

  async function magicLink() {
    if (!email) {
      setError('이메일을 먼저 입력하세요.')
      return
    }
    setBusy(true)
    setError(null)
    const { error } = await signIn(email)
    setBusy(false)
    if (error) setError(translate(error))
    else setNotice(`로그인 링크를 ${email}로 보냈습니다.`)
  }

  return (
    <div className="grid h-full place-items-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        {/* 표지 */}
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
          {/* 로그인 / 회원가입 탭 */}
          <div className="mb-5 flex gap-1 rounded-full bg-bone p-1">
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                  setNotice(null)
                }}
                className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition ${
                  mode === m ? 'bg-white text-ink shadow-sm' : 'text-mute hover:text-ink'
                }`}
              >
                {m === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          {!isSupabaseConfigured && (
            <p className="mb-4 rounded-xl bg-brand/10 p-3 text-xs text-brand-dark">
              Supabase 환경변수가 비어 있습니다. <code className="font-mono">.env</code>를 채운 뒤 새로고침하세요.
            </p>
          )}

          {notice ? (
            <p className="rounded-xl bg-success/10 p-4 text-sm text-success">{notice}</p>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-mute">이메일</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@kodekorea.kr"
                  className="w-full rounded-full border border-hairline bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-ink"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-mute">비밀번호</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? '6자 이상' : '••••••••'}
                  className="w-full rounded-full border border-hairline bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-ink"
                />
              </div>
              <button
                disabled={busy}
                className="w-full rounded-full bg-brand py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
              </button>
              {error && <p className="text-xs text-brand-dark">{error}</p>}
            </form>
          )}

          {/* 보조: 매직링크 */}
          {!notice && (
            <div className="mt-4 border-t border-hairline pt-4 text-center">
              <button onClick={magicLink} disabled={busy} className="text-xs text-mute transition hover:text-brand">
                비밀번호 없이 — 매직링크로 받기
              </button>
            </div>
          )}
        </div>

        <p className="mt-4 text-center font-mono text-[11px] text-ash">TeamHub · Supabase · Render</p>
      </div>
    </div>
  )
}

// Supabase 에러 메시지를 사람 친화적으로
function translate(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (m.includes('already registered') || m.includes('already exists')) return '이미 가입된 이메일입니다. 로그인하세요.'
  if (m.includes('password')) return '비밀번호는 6자 이상이어야 합니다.'
  if (m.includes('email') && m.includes('confirm')) return '이메일 확인이 필요합니다. 메일함을 확인하세요.'
  return msg
}
