import { useEffect, useState } from 'react'
import { X, Plus, Trash2, Copy, Check, Terminal, KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'

const MCP_URL = (import.meta.env.VITE_MCP_URL as string | undefined) || 'https://teamhub-mcp.onrender.com'

interface McpToken {
  id: string
  label: string | null
  created_at: string
  last_used_at: string | null
  revoked: boolean
}

function installCmd(token: string) {
  return `claude mcp add teamkode --transport http ${MCP_URL}/mcp --header "Authorization: Bearer ${token}" -s user`
}

// 원문 토큰 → SHA-256 hex (서버 createHash('sha256') 와 동일)
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return 'tk_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function McpConnect({ onClose }: { onClose: () => void }) {
  const me = useAuth((s) => s.profile)
  const [tokens, setTokens] = useState<McpToken[]>([])
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null) // 방금 발급된 원문(1회 표시)
  const [copied, setCopied] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('mcp_tokens')
      .select('id, label, created_at, last_used_at, revoked')
      .order('created_at', { ascending: false })
    setTokens((data as McpToken[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  async function generate() {
    if (!me?.id) return
    setBusy(true)
    const raw = randomToken()
    const hash = await sha256Hex(raw)
    const { error } = await supabase.from('mcp_tokens').insert({
      user_id: me.id,
      token_hash: hash,
      label: `${new Date().toLocaleDateString()} 발급`,
    })
    setBusy(false)
    if (error) {
      alert('토큰 발급 실패: ' + error.message)
      return
    }
    setFresh(raw)
    setCopied(false)
    load()
  }

  async function revoke(id: string) {
    if (!confirm('이 토큰을 폐기할까요? 해당 토큰을 쓰는 연결이 즉시 끊깁니다.')) return
    await supabase.from('mcp_tokens').delete().eq('id', id)
    load()
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-xl border border-hairline bg-card shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
            <Terminal size={17} className="text-brand" /> MCP 연결
          </h2>
          <button onClick={onClose} className="text-ash hover:text-ink" aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-mute">
            Claude·에이전트에서 TeamKode 데이터를 도구로 다룰 수 있게 연결합니다. 설치할 것 없이 아래 명령 한 줄이면 됩니다.
            <br />
            토큰은 <b className="text-ink">발급 시 한 번만</b> 표시되며, 본인 전용·언제든 폐기 가능합니다.
          </p>

          {/* 발급된 토큰 (1회 표시) */}
          {fresh && (
            <div className="rounded-lg border border-brand/40 bg-brand/5 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-brand">
                <KeyRound size={13} /> 새 토큰 — 지금 복사하세요 (다시 볼 수 없음)
              </div>
              <pre className="overflow-x-auto rounded-md bg-ink/90 p-2.5 font-mono text-[11px] leading-relaxed text-white dark:bg-black/40">
                {installCmd(fresh)}
              </pre>
              <button
                onClick={() => copy(installCmd(fresh))}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? '복사됨' : '설치 명령 복사'}
              </button>
            </div>
          )}

          <button
            onClick={generate}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-hairline py-2.5 text-sm font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-50"
          >
            <Plus size={16} /> 새 토큰 발급
          </button>

          {/* 발급된 토큰 목록 */}
          <div>
            <div className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">발급된 토큰</div>
            <div className="divide-y divide-hairline rounded-lg border border-hairline">
              {tokens.length === 0 && <p className="px-3 py-4 text-center text-xs text-ash">아직 발급한 토큰이 없습니다.</p>}
              {tokens.map((t) => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                  <KeyRound size={14} className="shrink-0 text-mute" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-ink">{t.label ?? '토큰'}</div>
                    <div className="font-mono text-[10px] text-ash">
                      {t.last_used_at ? `최근 사용 ${new Date(t.last_used_at).toLocaleString()}` : '미사용'}
                    </div>
                  </div>
                  <button
                    onClick={() => revoke(t.id)}
                    className="flex items-center gap-1 rounded-md border border-hairline px-2 py-1 text-[11px] text-danger transition hover:bg-danger-soft"
                  >
                    <Trash2 size={12} /> 폐기
                  </button>
                </div>
              ))}
            </div>
          </div>

          <p className="rounded-lg bg-bone p-3 text-[11px] leading-relaxed text-mute">
            서버: <span className="font-mono text-charcoal">{MCP_URL}/mcp</span> (원격 Streamable HTTP).
            연결 후 Claude Code에서 <span className="font-mono">/mcp</span> 로 상태를 확인하세요.
          </p>
        </div>
      </div>
    </div>
  )
}
