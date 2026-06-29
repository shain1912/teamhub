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
    <div className="h-full overflow-y-auto bg-canvas p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">감사 로그</h1>
        <span className="font-mono text-xs text-ash">최근 100건 · 읽기 전용</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-hairline bg-card px-2 py-1 text-sm text-body"
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
            className="rounded-lg border border-hairline bg-card px-2 py-1 text-sm text-body"
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

      <div className="overflow-hidden rounded-xl border border-hairline bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline bg-bone font-mono text-[11px] uppercase tracking-wider text-mute">
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
              <tr key={e.id} className="border-b border-hairline last:border-0 align-top hover:bg-canvas">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-mute">
                  {new Date(e.created_at).toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-medium text-ink">
                  {actorName(e.actor_id)}
                </td>
                <td className="px-4 py-2">
                  <span className="rounded-full bg-bone px-1.5 py-0.5 font-mono text-xs font-semibold text-charcoal">
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-2 text-charcoal">{e.entity_type ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-ash">
                  {e.entity_id ? e.entity_id.slice(0, 8) : '—'}
                </td>
                <td className="px-4 py-2 text-xs text-mute">
                  {summarizeDetail(e.detail) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ash">
            {entries.length === 0 ? '감사 로그가 없습니다.' : '조건에 맞는 로그가 없습니다.'}
          </p>
        )}
        {loading && <p className="px-4 py-8 text-center text-sm text-ash">불러오는 중…</p>}
      </div>
    </div>
  )
}
