import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Checklist, ChecklistItem } from '../lib/types'

export default function Checklists() {
  const profile = useAuth((s) => s.profile)
  const [lists, setLists] = useState<Checklist[]>([])
  const [items, setItems] = useState<Record<string, ChecklistItem[]>>({})
  const [newItem, setNewItem] = useState<Record<string, string>>({})

  async function loadLists() {
    const { data } = await supabase.from('checklists').select('*').order('created_at', { ascending: false })
    const list = (data as Checklist[]) ?? []
    setLists(list)
    for (const l of list) loadItems(l.id)
  }

  async function loadItems(checklistId: string) {
    const { data } = await supabase
      .from('checklist_items')
      .select('*')
      .eq('checklist_id', checklistId)
      .order('sort_order')
    setItems((m) => ({ ...m, [checklistId]: (data as ChecklistItem[]) ?? [] }))
  }

  useEffect(() => {
    loadLists()
  }, [])

  async function createList() {
    const title = prompt('체크리스트 제목')
    if (!title) return
    await supabase.from('checklists').insert({ title, owner_id: profile?.id })
    loadLists()
  }

  async function addItem(checklistId: string) {
    const content = newItem[checklistId]?.trim()
    if (!content) return
    const count = items[checklistId]?.length ?? 0
    await supabase.from('checklist_items').insert({ checklist_id: checklistId, content, sort_order: count })
    setNewItem((m) => ({ ...m, [checklistId]: '' }))
    loadItems(checklistId)
  }

  async function toggle(item: ChecklistItem) {
    await supabase
      .from('checklist_items')
      .update({ is_done: !item.is_done, completed_at: item.is_done ? null : new Date().toISOString() })
      .eq('id', item.id)
    loadItems(item.checklist_id)
  }

  async function setFollowUp(item: ChecklistItem) {
    const v = prompt('팔로업 날짜·시각 (YYYY-MM-DD HH:mm)', '')
    if (v === null) return
    const ts = v.trim() ? new Date(v.replace(' ', 'T')).toISOString() : null
    await supabase.from('checklist_items').update({ follow_up_at: ts }).eq('id', item.id)
    loadItems(item.checklist_id)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">체크리스트</h1>
        <button onClick={createList} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
          + 새 체크리스트
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {lists.map((l) => {
          const its = items[l.id] ?? []
          const done = its.filter((i) => i.is_done).length
          return (
            <div key={l.id} className="rounded-xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{l.title}</h2>
                <span className="text-xs text-slate-400">
                  {done}/{its.length}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded bg-slate-100">
                <div
                  className="h-1.5 rounded bg-green-500 transition-all"
                  style={{ width: its.length ? `${(done / its.length) * 100}%` : '0%' }}
                />
              </div>

              <ul className="mt-3 space-y-1.5">
                {its.map((i) => {
                  const overdue = i.follow_up_at && !i.is_done && new Date(i.follow_up_at) < new Date()
                  return (
                    <li key={i.id} className="flex items-start gap-2 text-sm">
                      <input type="checkbox" checked={i.is_done} onChange={() => toggle(i)} className="mt-1" />
                      <div className="flex-1">
                        <span className={i.is_done ? 'text-slate-400 line-through' : ''}>{i.content}</span>
                        {i.follow_up_at && (
                          <button
                            onClick={() => setFollowUp(i)}
                            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                              overdue ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
                            }`}
                            title="팔로업"
                          >
                            ⏰ {new Date(i.follow_up_at).toLocaleDateString()}
                          </button>
                        )}
                        {!i.follow_up_at && (
                          <button onClick={() => setFollowUp(i)} className="ml-2 text-[10px] text-slate-400 hover:text-brand">
                            + 팔로업
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="mt-3 flex gap-2">
                <input
                  value={newItem[l.id] ?? ''}
                  onChange={(e) => setNewItem((m) => ({ ...m, [l.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addItem(l.id)}
                  placeholder="항목 추가"
                  className="flex-1 rounded-lg border px-2 py-1 text-sm"
                />
                <button onClick={() => addItem(l.id)} className="rounded-lg border px-2 text-sm hover:bg-slate-50">
                  +
                </button>
              </div>
            </div>
          )
        })}
        {lists.length === 0 && <p className="text-sm text-slate-400">아직 체크리스트가 없습니다.</p>}
      </div>
    </div>
  )
}
