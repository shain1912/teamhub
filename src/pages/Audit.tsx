import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AuditEntry, Profile } from '../lib/types'

function summarizeDetail(detail: Record<string, unknown> | null): string {
  if (!detail) return ''
  const entries = Object.entries(detail)
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => {
      let val: string
      if (v === null || v === undefined) val = '∅'
      else if (typeof v === 'object') {
        try {
          val = JSON.stringify(v)
        } catch {
          val = String(v)
        }
      } else val = String(v)
      if (val.length > 60) val = val.slice(0, 60) + '…'
      return `${k}: ${val}`
    })
    .join(', ')
}

export default function Audit() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map())
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('')
  const [entityFilter, setEntityFilter] = useState('')

  async function load() {
    setLoading(true)
    const [{ data: auditData }, { data: profileData }] = await Promise.all([
      supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('*'),
    ])
    setEntries((auditData as AuditEntry[]) ?? [])
    const map = new Map<string, Profile>()
    for (const p of (profileData as Profile[]) ?? []) map.set(p.id, p)
    setProfiles(map)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const actionOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action).filter(Boolean))).sort(),
    [entries],
  )
  const entityOptions = useMemo(
    () =>
      Array.from(
        new Set(entries.map((e) => e.entity_type).filter((v): v is string => Boolean(v))),
      ).sort(),
    [entries],
  )

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!actionFilter || e.action === actionFilter) &&
          (!entityFilter || e.entity_type === entityFilter),
      ),
    [entries, actionFilter, entityFilter],
  )

  function actorName(id: string | null): string {
    if (!id) return '시스템'
    const p = profiles.get(id)
    return p?.full_name || p?.email || id.slice(0, 8)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">감사 로그</h1>
        <span className="text-xs text-slate-400">최근 100건 · 읽기 전용</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border px-2 py-1 text-sm"
          >
            <option value="">모든 action</option>
            {actionOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-lg border px-2 py-1 text-sm"
          >
            <option value="">모든 entity</option>
            {entityOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">시각</th>
              <th className="px-4 py-2 font-medium">행위자</th>
              <th className="px-4 py-2 font-medium">action</th>
              <th className="px-4 py-2 font-medium">entity_type</th>
              <th className="px-4 py-2 font-medium">entity_id</th>
              <th className="px-4 py-2 font-medium">detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b last:border-0 align-top hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-700">
                  {actorName(e.actor_id)}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded bg-brand/10 px-1.5 py-0.5 text-xs font-semibold text-brand">
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-600">{e.entity_type ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-400">
                  {e.entity_id ? e.entity_id.slice(0, 8) : '—'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {summarizeDetail(e.detail) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            {entries.length === 0 ? '감사 로그가 없습니다.' : '조건에 맞는 로그가 없습니다.'}
          </p>
        )}
        {loading && <p className="px-4 py-8 text-center text-sm text-slate-400">불러오는 중…</p>}
      </div>
    </div>
  )
}
