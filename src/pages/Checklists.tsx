import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import { useWorkspace } from '../store/workspace'
import type { Checklist, ChecklistItem, Profile } from '../lib/types'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString()
}

function isOverdue(iso: string | null, done: boolean) {
  return !!iso && !done && new Date(iso) < new Date()
}

export default function Checklists() {
  const profile = useAuth((s) => s.profile)
  const myId = profile?.id
  const [lists, setLists] = useState<Checklist[]>([])
  const [items, setItems] = useState<Record<string, ChecklistItem[]>>({})
  const [newItem, setNewItem] = useState<Record<string, string>>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [mineOnly, setMineOnly] = useState(false)

  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of profiles) m.set(p.id, p)
    return m
  }, [profiles])

  function nameOf(id: string | null): string {
    if (!id) return ''
    const p = profileMap.get(id)
    return p?.full_name || p?.email || '알 수 없음'
  }

  const wsId = useWorkspace((s) => s.currentId)

  async function loadProfiles() {
    if (!wsId) {
      setProfiles([])
      return
    }
    const { data: mem } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', wsId)
    const ids = ((mem as { user_id: string }[]) ?? []).map((m) => m.user_id)
    const { data } = ids.length
      ? await supabase.from('profiles').select('*').in('id', ids).order('full_name')
      : { data: [] as Profile[] }
    setProfiles((data as Profile[]) ?? [])
  }

  async function loadLists() {
    let q = supabase.from('checklists').select('*').order('created_at', { ascending: false })
    if (wsId) q = q.eq('workspace_id', wsId)
    const { data } = await q
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
    loadProfiles()
    loadLists()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  async function createList() {
    const title = prompt('체크리스트 제목')
    if (!title) return
    await supabase.from('checklists').insert({ title, owner_id: myId, workspace_id: wsId })
    loadLists()
  }

  async function deleteList(l: Checklist) {
    if (!confirm(`체크리스트 "${l.title}" 를 삭제할까요?`)) return
    const { error } = await supabase.from('checklists').delete().eq('id', l.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    loadLists()
  }

  async function deleteItem(item: ChecklistItem) {
    const { error } = await supabase.from('checklist_items').delete().eq('id', item.id)
    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }
    loadItems(item.checklist_id)
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

  async function setAssignee(item: ChecklistItem, assigneeId: string) {
    await supabase
      .from('checklist_items')
      .update({ assignee_id: assigneeId || null })
      .eq('id', item.id)
    loadItems(item.checklist_id)
  }

  // 사람용 달력 UI에서 고른 날짜를 저장 (AI/MCP는 동일 due_date 컬럼을 API로 직접 사용 — 영향 없음)
  async function setDueDateValue(item: ChecklistItem, val: string) {
    const ts = val ? new Date(val + 'T00:00:00').toISOString() : null
    await supabase.from('checklist_items').update({ due_date: ts }).eq('id', item.id)
    loadItems(item.checklist_id)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">체크리스트</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-charcoal">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            내 항목만
          </label>
          <button onClick={createList} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">
            + 새 체크리스트
          </button>
        </div>
      </div>

      {/* Padlet식 masonry — CSS columns 로 카드 높이에 맞춰 촘촘히 (여백 최소화) */}
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3 [&>*]:mb-4">
        {lists.map((l) => {
          const allIts = items[l.id] ?? []
          const its = mineOnly ? allIts.filter((i) => i.assignee_id === myId) : allIts
          if (mineOnly && its.length === 0) return null
          const done = its.filter((i) => i.is_done).length
          return (
            <div key={l.id} className="mb-4 break-inside-avoid rounded-xl border border-hairline bg-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-ink">{l.title}</h2>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ash">
                    {done}/{its.length}
                  </span>
                  <button
                    onClick={() => deleteList(l)}
                    className="text-ash hover:text-danger"
                    title="체크리스트 삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-bone">
                <div
                  className="h-1.5 rounded-full bg-success transition-all"
                  style={{ width: its.length ? `${(done / its.length) * 100}%` : '0%' }}
                />
              </div>

              <ul className="mt-3 space-y-2">
                {its.map((i) => {
                  const followOverdue = isOverdue(i.follow_up_at, i.is_done)
                  const dueOverdue = isOverdue(i.due_date, i.is_done)
                  return (
                    <li
                      key={i.id}
                      className={`flex items-start gap-2 rounded-lg px-1.5 py-1 text-sm ${
                        dueOverdue ? 'bg-danger-soft ring-1 ring-danger' : ''
                      }`}
                    >
                      <input type="checkbox" checked={i.is_done} onChange={() => toggle(i)} className="mt-1" />
                      <div className="flex-1">
                        <span className={i.is_done ? 'text-ash line-through' : 'text-body'}>{i.content}</span>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <select
                            value={i.assignee_id ?? ''}
                            onChange={(e) => setAssignee(i, e.target.value)}
                            className="rounded-lg border border-hairline bg-card px-1 py-0.5 text-[11px] text-charcoal"
                            title="담당자"
                          >
                            <option value="">담당자 없음</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.full_name || p.email || p.id}
                              </option>
                            ))}
                          </select>

                          <label
                            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ${
                              dueOverdue
                                ? 'bg-danger-soft font-semibold text-danger-ink'
                                : i.due_date
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                                : 'border border-hairline text-ash hover:text-brand'
                            }`}
                            title="마감일 선택"
                          >
                            <Calendar size={11} className="shrink-0" />
                            <input
                              type="date"
                              value={i.due_date ? i.due_date.slice(0, 10) : ''}
                              onChange={(e) => setDueDateValue(i, e.target.value)}
                              className="w-[6.5rem] cursor-pointer bg-transparent font-mono text-[10px] outline-none"
                              aria-label="마감일"
                            />
                          </label>

                          {i.follow_up_at ? (
                            <button
                              onClick={() => setFollowUp(i)}
                              className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                                followOverdue ? 'bg-danger-soft text-danger-ink' : 'bg-bone text-mute'
                              }`}
                              title="팔로업"
                            >
                              <Clock size={11} className="shrink-0" /> {fmtDate(i.follow_up_at)}
                            </button>
                          ) : (
                            <button onClick={() => setFollowUp(i)} className="text-[10px] text-ash hover:text-brand">
                              + 팔로업
                            </button>
                          )}

                          {i.assignee_id && (
                            <span className="text-[10px] text-ash">· {nameOf(i.assignee_id)}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => deleteItem(i)}
                        className="mt-0.5 text-ash hover:text-danger"
                        title="항목 삭제"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  )
                })}
                {its.length === 0 && <li className="text-xs text-ash">항목이 없습니다.</li>}
              </ul>

              <div className="mt-3 flex gap-2">
                <input
                  value={newItem[l.id] ?? ''}
                  onChange={(e) => setNewItem((m) => ({ ...m, [l.id]: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && addItem(l.id)}
                  placeholder="항목 추가"
                  className="flex-1 rounded-lg border border-hairline px-2 py-1 text-sm"
                />
                <button onClick={() => addItem(l.id)} className="rounded-lg border border-hairline px-2 text-sm hover:bg-bone">
                  +
                </button>
              </div>
            </div>
          )
        })}
        {lists.length === 0 && <p className="text-sm text-ash">아직 체크리스트가 없습니다.</p>}
      </div>
    </div>
  )
}
