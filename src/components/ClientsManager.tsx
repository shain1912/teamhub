import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Client, Channel, Project } from '../lib/types'

const PROXY = (import.meta.env.VITE_AI_PROXY_URL as string) || 'https://teamhub-mcp.onrender.com'

/**
 * 클라이언트(테넌트) 관리 — 내부 전용.
 * 클라 생성 / 프로젝트·채널을 클라에 배정(client_id) / 게스트 초대.
 * 게스트는 자기 client_id 리소스만 RLS로 격리되어 보인다.
 */
export default function ClientsManager({ onClose }: { onClose: () => void }) {
  const [clients, setClients] = useState<Client[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [sel, setSel] = useState<string>('')
  const [newName, setNewName] = useState('')
  const [email, setEmail] = useState('')
  const [days, setDays] = useState(14)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  async function load() {
    const [{ data: cl }, { data: ch }, { data: pj }] = await Promise.all([
      supabase.from('clients').select('*').order('created_at'),
      supabase.from('channels').select('*').order('created_at'),
      supabase.from('projects').select('*').order('created_at'),
    ])
    setClients((cl as Client[]) ?? [])
    setChannels((ch as Channel[]) ?? [])
    setProjects((pj as Project[]) ?? [])
    setSel((s) => s || (cl as Client[])?.[0]?.id || '')
  }
  useEffect(() => {
    load()
  }, [])

  async function createClient() {
    const name = newName.trim()
    if (!name) return
    const { data } = await supabase.from('clients').insert({ name }).select().single()
    setNewName('')
    await load()
    if (data) setSel((data as Client).id)
  }

  async function assign(table: 'channels' | 'projects', id: string, on: boolean) {
    await supabase.from(table).update({ client_id: on ? sel : null }).eq('id', id)
    load()
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault()
    if (!sel) return
    setBusy(true)
    setMsg(null)
    setLink(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token ?? ''
      const res = await fetch(`${PROXY}/admin/invite-guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, client_id: sel, expires_days: days }),
      })
      const j = await res.json()
      if (!res.ok) {
        setMsg(j.error || '초대 실패')
        return
      }
      setLink(j.link)
      setMsg(`초대 완료 · 만료 ${new Date(j.expires_at).toLocaleDateString()}`)
      setEmail('')
    } catch (err: any) {
      setMsg(err?.message ?? String(err))
    } finally {
      setBusy(false)
    }
  }

  const selClient = clients.find((c) => c.id === sel)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-hairline bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <h3 className="font-semibold text-ink">클라이언트 / 게스트 관리</h3>
          <button onClick={onClose} className="text-ash hover:text-ink">✕</button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 text-sm">
          {/* 클라 선택 / 생성 */}
          <div className="flex flex-wrap items-center gap-2">
            <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded-full border border-hairline px-3 py-1.5">
              {clients.length === 0 && <option value="">클라이언트 없음</option>}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span className="text-ash">또는</span>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="새 클라이언트 이름" className="flex-1 rounded-full border border-hairline px-3 py-1.5" />
            <button onClick={createClient} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">+ 생성</button>
          </div>

          {selClient && (
            <>
              {/* 배정: 프로젝트 */}
              <div>
                <div className="mb-1 text-xs font-semibold text-mute">「{selClient.name}」에 포함할 프로젝트</div>
                <div className="space-y-1">
                  {projects.map((p) => {
                    const mine = p.client_id === sel
                    const other = p.client_id && p.client_id !== sel
                    return (
                      <label key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${other ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={mine} disabled={!!other} onChange={(e) => assign('projects', p.id, e.target.checked)} />
                        <span>{p.name}</span>
                        {other && <span className="text-[10px] text-ash">(다른 클라에 배정됨)</span>}
                      </label>
                    )
                  })}
                  {projects.length === 0 && <p className="text-xs text-ash">프로젝트 없음</p>}
                </div>
              </div>

              {/* 배정: 채널 */}
              <div>
                <div className="mb-1 text-xs font-semibold text-mute">「{selClient.name}」에 포함할 채널</div>
                <div className="space-y-1">
                  {channels.map((c) => {
                    const mine = c.client_id === sel
                    const other = c.client_id && c.client_id !== sel
                    return (
                      <label key={c.id} className={`flex items-center gap-2 rounded-lg px-2 py-1 ${other ? 'opacity-40' : ''}`}>
                        <input type="checkbox" checked={mine} disabled={!!other} onChange={(e) => assign('channels', c.id, e.target.checked)} />
                        <span># {c.name}</span>
                        {other && <span className="text-[10px] text-ash">(다른 클라)</span>}
                      </label>
                    )
                  })}
                  {channels.length === 0 && <p className="text-xs text-ash">채널 없음</p>}
                </div>
              </div>

              {/* 게스트 초대 */}
              <form onSubmit={invite} className="space-y-2 rounded-xl border border-hairline bg-bone p-3">
                <div className="text-xs font-semibold text-mute">「{selClient.name}」 게스트 초대</div>
                <div className="flex flex-wrap gap-2">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="게스트 이메일" className="min-w-0 flex-1 rounded-full border border-hairline px-3 py-1.5" />
                  <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-20 rounded-full border border-hairline px-2 py-1.5" title="만료(일)" />
                  <button disabled={busy} className="rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                    {busy ? '…' : '초대'}
                  </button>
                </div>
                {msg && <p className="text-xs text-success">{msg}</p>}
                {link && (
                  <div className="flex gap-1">
                    <input readOnly value={link} className="min-w-0 flex-1 rounded-full border border-hairline px-3 py-1.5 font-mono text-[11px]" />
                    <button type="button" onClick={() => navigator.clipboard.writeText(link)} className="rounded-full border border-hairline px-3 text-xs hover:bg-white">복사</button>
                  </div>
                )}
              </form>
              <p className="text-[11px] text-ash">게스트는 이 클라이언트의 프로젝트·채널·티켓만 보고 다른 클라는 차단됩니다. 만료 후 자동 비활성.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
