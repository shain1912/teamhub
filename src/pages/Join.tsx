import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Ticket, LogIn } from 'lucide-react'
import { useAuth } from '../store/auth'
import { useWorkspace } from '../store/workspace'
import ThemeToggle from '../components/ThemeToggle'

export const PENDING_INVITE_KEY = 'teamkode:pendingInvite'
export const INVITE_ERROR_KEY = 'teamkode:inviteError'

// 링크 또는 코드 문자열에서 토큰만 추출
export function extractToken(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  const m = s.match(/[?&]invite=([^&\s]+)/)
  if (m) return decodeURIComponent(m[1])
  // 순수 코드로 간주(마지막 경로 조각만)
  const seg = s.split(/[/\s]/).pop() ?? s
  return seg
}

export default function Join() {
  const { session } = useAuth()
  const accept = useWorkspace((s) => s.accept)
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [code, setCode] = useState(() => extractToken(params.get('invite') ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 로그인 후 자동수락이 실패했으면 그 메시지를 표시(표시 후 클리어)
  useEffect(() => {
    try {
      const e = sessionStorage.getItem(INVITE_ERROR_KEY)
      if (e) {
        setError(e)
        sessionStorage.removeItem(INVITE_ERROR_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [])

  // 비로그인 상태에서 초대 링크로 들어오면 토큰을 저장해 두고 로그인 후 자동 수락
  useEffect(() => {
    const t = extractToken(params.get('invite') ?? '')
    if (t && !session) {
      try {
        sessionStorage.setItem(PENDING_INVITE_KEY, t)
      } catch {
        /* ignore */
      }
    }
  }, [params, session])

  async function join() {
    const token = extractToken(code)
    if (!token || busy) return
    setBusy(true)
    setError(null)
    const { error, id } = await accept(token)
    setBusy(false)
    if (error) {
      setError(error)
      return
    }
    try {
      sessionStorage.removeItem(PENDING_INVITE_KEY)
    } catch {
      /* ignore */
    }
    navigate(id ? '/me' : '/')
  }

  function goLogin() {
    const token = extractToken(code)
    if (token) {
      try {
        sessionStorage.setItem(PENDING_INVITE_KEY, token)
      } catch {
        /* ignore */
      }
    }
    navigate('/')
  }

  return (
    <div className="relative grid min-h-full place-items-center bg-canvas px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-brand text-white shadow-raised">
            <Ticket size={30} />
          </div>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink">워크스페이스 참여</h1>
          <p className="mt-2 text-sm leading-relaxed text-mute">
            초대 링크나 코드를 입력해 팀 워크스페이스에 참여하세요.
          </p>
        </div>

        <div className="rounded-2xl border border-hairline bg-card p-6 shadow-raised sm:p-7">
          <label className="mb-1.5 block text-sm font-semibold text-ink">초대 코드 / 링크</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing && session) join()
            }}
            placeholder="초대 링크 또는 코드를 붙여넣기"
            className="w-full rounded-lg border border-hairline bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />

          {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}

          {session ? (
            <button
              onClick={join}
              disabled={busy || !extractToken(code)}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-sm font-semibold text-white shadow-raised transition hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? '참여 중…' : '참여하기'}
              {!busy && <ArrowRight size={16} />}
            </button>
          ) : (
            <>
              <p className="mt-4 rounded-lg bg-mint-soft p-3 text-xs text-mint-ink">
                참여하려면 먼저 로그인이 필요합니다. 로그인/가입 후 자동으로 이 워크스페이스에 참여됩니다.
              </p>
              <button
                onClick={goLogin}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-3 text-sm font-semibold text-white shadow-raised transition hover:bg-brand-dark"
              >
                <LogIn size={16} /> 로그인하고 참여
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
