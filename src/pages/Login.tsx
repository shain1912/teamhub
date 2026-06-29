import { useState } from 'react'
import { AtSign, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../store/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import ThemeToggle from '../components/ThemeToggle'

type Mode = 'login' | 'signup'

export default function Login() {
  const { signInPassword, signUpPassword, signIn } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPw, setShowPw] = useState(false)

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
    <div className="relative grid min-h-full place-items-center bg-canvas px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        {/* 표지 — 인디고 로고 타일 + 타이틀 */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand text-white shadow-raised">
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="5" r="2" />
              <circle cx="5" cy="16" r="2" />
              <circle cx="19" cy="16" r="2" />
              <circle cx="12" cy="13" r="2.4" fill="currentColor" stroke="none" />
              <path d="M12 7.4 12 10.6M10 11.8 6.2 14.6M14 11.8l3.8 2.8" />
            </svg>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink">TeamKode</h1>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            팀과 클라이언트가 한곳에서 — 동기화된 협업 워크스페이스.
          </p>
        </div>

        <div className="rounded-2xl border border-hairline bg-card p-6 shadow-raised sm:p-7">
          {/* 로그인 / 회원가입 탭 */}
          <div className="mb-6 flex gap-1 rounded-lg bg-bone p-1">
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setError(null)
                  setNotice(null)
                }}
                className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition ${
                  mode === m ? 'bg-card text-brand shadow-sm' : 'text-mute hover:text-ink'
                }`}
              >
                {m === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          {!isSupabaseConfigured && (
            <p className="mb-4 rounded-lg bg-danger-soft p-3 text-xs text-danger-ink">
              Supabase 환경변수가 비어 있습니다. <code className="font-mono">.env</code>를 채운 뒤 새로고침하세요.
            </p>
          )}

          {notice ? (
            <p className="rounded-lg bg-mint-soft p-4 text-sm text-mint-ink">{notice}</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">이메일</label>
                <div className="flex items-center rounded-lg border border-hairline bg-card px-3 transition focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                  <AtSign size={16} className="shrink-0 text-ash" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@kodekorea.kr"
                    className="w-full bg-transparent px-2 py-2.5 text-sm text-ink outline-none placeholder:text-ash"
                  />
                </div>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-sm font-semibold text-ink">비밀번호</label>
                  {mode === 'login' && (
                    <button type="button" onClick={magicLink} disabled={busy} className="text-xs font-semibold text-mint transition hover:text-mint-ink">
                      비밀번호 없이 로그인
                    </button>
                  )}
                </div>
                <div className="flex items-center rounded-lg border border-hairline bg-card px-3 transition focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                  <Lock size={16} className="shrink-0 text-ash" />
                  <input
                    type={showPw ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? '6자 이상' : '••••••••'}
                    className="w-full bg-transparent px-2 py-2.5 text-sm text-ink outline-none placeholder:text-ash"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="shrink-0 text-ash transition hover:text-mute"
                    aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 표시'}
                  >
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <button
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-sm font-semibold text-white shadow-raised transition hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
                {!busy && <ArrowRight size={16} />}
              </button>
              {error && <p className="text-xs font-medium text-danger">{error}</p>}
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-ash">
          {mode === 'login' ? '워크스페이스가 없으신가요? ' : '이미 계정이 있으신가요? '}
          <button
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError(null)
              setNotice(null)
            }}
            className="font-semibold text-brand hover:underline"
          >
            {mode === 'login' ? '새 워크스페이스 만들기' : '로그인'}
          </button>
        </p>
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
