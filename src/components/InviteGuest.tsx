import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Channel } from '../lib/types'

const PROXY = (import.meta.env.VITE_AI_PROXY_URL as string) || 'https://teamhub-mcp.onrender.com'

/** 외부 클라이언트/외주를 특정 채널에 만료부 게스트로 초대하는 모달 (내부 사용자 전용) */
export default function InviteGuest({ onClose }: { onClose: () => void }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [channelId, setChannelId] = useState('')
  const [days, setDays] = useState(14)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ link: string | null; expires_at: string } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase
      .from('channels')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        const list = (data as Channel[]) ?? []
        setChannels(list)
        setChannelId((c) => c || list[0]?.id || '')
      })
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token ?? ''
      const res = await fetch(`${PROXY}/admin/invite-guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, full_name: fullName, channel_id: channelId, expires_days: days }),
      })
      const j = await res.json()
      if (!res.ok) {
        setError(j.error || '초대 실패')
        return
      }
      setResult({ link: j.link, expires_at: j.expires_at })
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm space-y-3 rounded-2xl border border-hairline bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink">게스트 초대</h3>
          <button onClick={onClose} className="text-ash hover:text-ink">
            ✕
          </button>
        </div>

        {result ? (
          <div className="space-y-3 text-sm">
            <p className="rounded-xl bg-success/10 p-3 text-success">
              초대 완료 · 만료 {new Date(result.expires_at).toLocaleDateString()}
            </p>
            {result.link ? (
              <>
                <p className="text-xs text-mute">아래 로그인 링크를 게스트에게 전달하세요 (해당 채널만 접근).</p>
                <div className="flex gap-1">
                  <input readOnly value={result.link} className="min-w-0 flex-1 rounded-full border border-hairline px-3 py-2 font-mono text-[11px]" />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(result.link!)
                      setCopied(true)
                    }}
                    className="shrink-0 rounded-full bg-brand px-3 py-2 text-xs font-semibold text-white"
                  >
                    {copied ? '복사됨' : '복사'}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-xs text-mute">초대 메일이 발송되었습니다.</p>
            )}
            <button onClick={onClose} className="w-full rounded-full border border-hairline py-2 text-sm hover:bg-bone">
              닫기
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2">
            <input
              type="email"
              required
              placeholder="게스트 이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-full border border-hairline px-3 py-2 text-sm"
            />
            <input
              placeholder="이름 (선택)"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-full border border-hairline px-3 py-2 text-sm"
            />
            <label className="block text-xs text-mute">
              접근 채널
              <select
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                className="mt-0.5 w-full rounded-full border border-hairline px-2 py-2 text-sm text-ink"
              >
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-mute">
              만료 (일)
              <input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="mt-0.5 w-full rounded-full border border-hairline px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="text-xs text-brand-dark">{error}</p>}
            <button
              disabled={busy || !channelId}
              className="w-full rounded-full bg-brand py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {busy ? '초대 중…' : '초대 링크 생성'}
            </button>
            <p className="text-[11px] text-ash">게스트는 선택한 채널과 그 채널의 티켓만 보고, 만료 후 자동 차단됩니다.</p>
          </form>
        )}
      </div>
    </div>
  )
}
