import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Ticket, TicketStatus, TicketPriority } from '../lib/types'

const COLUMNS: { key: TicketStatus; label: string }[] = [
  { key: 'open', label: '열림' },
  { key: 'in_progress', label: '진행 중' },
  { key: 'done', label: '완료' },
  { key: 'closed', label: '종료' },
]

const PRIO: Record<TicketPriority, string> = {
  low: 'border-l-slate-300',
  medium: 'border-l-blue-400',
  high: 'border-l-amber-400',
  urgent: 'border-l-red-500',
}

export default function Tickets() {
  const profile = useAuth((s) => s.profile)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' as TicketPriority })

  async function load() {
    const { data } = await supabase.from('tickets').select('*').order('created_at', { ascending: false })
    setTickets((data as Ticket[]) ?? [])
  }
  useEffect(() => {
    load()
  }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    await supabase.from('tickets').insert({ ...form, reporter_id: profile?.id })
    setForm({ title: '', description: '', priority: 'medium' })
    setOpen(false)
    load()
  }

  async function move(t: Ticket, status: TicketStatus) {
    await supabase.from('tickets').update({ status }).eq('id', t.id)
    load()
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">티켓</h1>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
          + 새 티켓
        </button>
      </div>

      {open && (
        <form onSubmit={create} className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3">
          <input
            required
            placeholder="제목"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="min-w-[14rem] flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <input
            placeholder="설명"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="min-w-[14rem] flex-1 rounded-lg border px-3 py-2 text-sm"
          />
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as TicketPriority })}
            className="rounded-lg border px-2 py-2 text-sm"
          >
            <option value="low">낮음</option>
            <option value="medium">보통</option>
            <option value="high">높음</option>
            <option value="urgent">긴급</option>
          </select>
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">생성</button>
        </form>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const list = tickets.filter((t) => t.status === col.key)
          return (
            <div key={col.key} className="flex min-h-0 flex-col rounded-xl bg-slate-100 p-2">
              <div className="px-1 py-1 text-xs font-semibold text-slate-500">
                {col.label} <span className="text-slate-400">({list.length})</span>
              </div>
              <div className="space-y-2 overflow-y-auto">
                {list.map((t) => (
                  <div key={t.id} className={`rounded-lg border-l-4 bg-white p-2 shadow-sm ${PRIO[t.priority]}`}>
                    <div className="text-sm font-medium">{t.title}</div>
                    {t.description && <div className="mt-0.5 text-xs text-slate-500">{t.description}</div>}
                    <div className="mt-2 flex gap-1">
                      {COLUMNS.filter((c) => c.key !== t.status).map((c) => (
                        <button
                          key={c.key}
                          onClick={() => move(t, c.key)}
                          className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200"
                        >
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
