import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Plus, Check, X, Lock } from 'lucide-react'
import { useWorkspace } from '../store/workspace'
import { useAuth } from '../store/auth'

function Logo() {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand text-white shadow-raised">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="16" r="2" />
        <circle cx="19" cy="16" r="2" />
        <circle cx="12" cy="13" r="2.2" fill="currentColor" stroke="none" />
        <path d="M12 7.4 12 10.6M10 11.8 6.2 14.6M14 11.8l3.8 2.8" />
      </svg>
    </span>
  )
}

export default function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { list, currentId, load, setCurrent, create } = useWorkspace()
  const isAdmin = useAuth((s) => s.profile?.role) === 'admin'
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const current = list.find((w) => w.id === currentId)
  const title = current?.name ?? 'TeamKode'
  const hasWorkspaces = list.length > 0

  function pick(id: string) {
    setCurrent(id)
    setOpen(false)
    navigate('/me')
  }

  async function submitCreate() {
    if (!name.trim() || busy) return
    setBusy(true)
    const { error } = await create(name)
    setBusy(false)
    if (error) {
      alert('워크스페이스 생성 실패: ' + error)
      return
    }
    setName('')
    setCreating(false)
    setOpen(false)
    navigate('/me')
  }

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        onClick={() => hasWorkspaces && setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1 text-left transition hover:bg-black/5"
        title="워크스페이스 전환"
      >
        <Logo />
        <span className={`min-w-0 flex-1 ${collapsed ? 'md:hidden' : ''}`}>
          <span className="block truncate font-display text-base font-bold leading-tight text-ink">{title}</span>
          <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-ash">워크스페이스</span>
        </span>
        {hasWorkspaces && (
          <ChevronDown size={15} className={`shrink-0 text-mute transition ${open ? 'rotate-180' : ''} ${collapsed ? 'md:hidden' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-hairline bg-card shadow-overlay">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-ash">내 워크스페이스</span>
            <button onClick={() => setOpen(false)} className="text-ash hover:text-ink" aria-label="닫기">
              <X size={13} />
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {list.map((w) => (
              <button
                key={w.id}
                onClick={() => pick(w.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-bone"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand/10 text-[11px] font-bold text-brand">
                  {w.name.trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink">{w.name}</span>
                {w.id === currentId && <Check size={15} className="shrink-0 text-brand" />}
              </button>
            ))}
          </div>

          {/* 새 워크스페이스 — 관리자만 */}
          <div className="border-t border-hairline p-2">
            {!isAdmin ? (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-ash">
                <Lock size={13} /> 워크스페이스 생성은 관리자만 가능합니다
              </div>
            ) : creating ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing) submitCreate()
                    if (e.key === 'Escape') setCreating(false)
                  }}
                  placeholder="새 워크스페이스 이름"
                  className="min-w-0 flex-1 rounded-md border border-hairline px-2 py-1.5 text-sm outline-none focus:border-brand"
                />
                <button
                  onClick={submitCreate}
                  disabled={!name.trim() || busy}
                  className="shrink-0 rounded-md bg-brand px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-40"
                >
                  생성
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5"
              >
                <Plus size={15} /> 새 워크스페이스
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
