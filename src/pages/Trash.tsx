import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, RotateCcw, ShieldAlert, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'

interface DeletedRecord {
  id: string
  table_name: string
  record_id: string
  data: Record<string, any>
  deleted_at: string
  deleted_by: string | null
  profiles?: { full_name: string | null; email: string | null } | null
}

const TABLE_LABEL: Record<string, string> = {
  workspaces: '워크스페이스',
  channels: '채널',
  messages: '메시지',
  files: '파일',
  announcements: '공지',
  tickets: '티켓',
  ticket_comments: '댓글',
  projects: '프로젝트',
  gantt_tasks: '간트작업',
  sprints: '스프린트',
  checklists: '체크리스트',
  checklist_items: '체크항목',
  reactions: '반응',
}

function titleOf(d: DeletedRecord): string {
  const x = d.data || {}
  return (x.title || x.name || x.body || x.content || x.full_name || x.emoji || d.record_id.slice(0, 8) + '…') as string
}

export default function Trash() {
  const isAdmin = useAuth((s) => s.profile?.role) === 'admin'
  const navigate = useNavigate()
  const [rows, setRows] = useState<DeletedRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAdmin) navigate('/me', { replace: true })
  }, [isAdmin, navigate])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('deleted_records')
      .select('id, table_name, record_id, data, deleted_at, deleted_by, profiles:deleted_by(full_name, email)')
      .order('deleted_at', { ascending: false })
      .limit(300)
    setRows((data as unknown as DeletedRecord[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    if (isAdmin) load()
  }, [isAdmin])

  async function restore(r: DeletedRecord) {
    setBusyId(r.id)
    const { error } = await supabase.rpc('restore_deleted_record', { rec_id: r.id })
    setBusyId(null)
    if (error) {
      alert(
        '복구 실패: ' + error.message +
          '\n(상위 항목이 함께 삭제된 경우, 상위 항목을 먼저 복구하세요.)',
      )
      return
    }
    setRows((prev) => prev.filter((x) => x.id !== r.id))
  }

  if (!isAdmin) return null

  const tables = Array.from(new Set(rows.map((r) => r.table_name)))
  const shown = filter === 'all' ? rows : rows.filter((r) => r.table_name === filter)

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-ink">
            <Trash2 size={22} className="text-brand" /> 휴지통 · 복구
          </h1>
          <p className="mt-1 text-sm text-mute">삭제된 항목을 복구합니다. 어떤 경로로 지워졌든 자동 보관됩니다.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-hairline px-3 py-1.5 text-sm text-mute transition hover:text-ink"
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {/* 필터 */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>전체 {rows.length}</Chip>
        {tables.map((t) => (
          <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
            {TABLE_LABEL[t] ?? t} {rows.filter((r) => r.table_name === t).length}
          </Chip>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-hairline bg-card">
        {loading && <p className="px-4 py-10 text-center text-sm text-ash">불러오는 중…</p>}
        {!loading && shown.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ash">
            <ShieldAlert size={28} className="mx-auto mb-2 text-stone" />
            복구할 삭제 항목이 없습니다.
          </div>
        )}
        <div className="divide-y divide-hairline">
          {shown.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="shrink-0 rounded-md bg-bone px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-mute">
                {TABLE_LABEL[r.table_name] ?? r.table_name}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink">{titleOf(r)}</div>
                <div className="font-mono text-[10px] text-ash">
                  {new Date(r.deleted_at).toLocaleString()}
                  {r.profiles?.full_name ? ` · ${r.profiles.full_name}` : r.deleted_by ? '' : ' · 시스템/에이전트'}
                </div>
              </div>
              <button
                onClick={() => restore(r)}
                disabled={busyId === r.id}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
              >
                <RotateCcw size={13} /> {busyId === r.id ? '복구 중…' : '복구'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? 'border-brand bg-brand/10 text-brand' : 'border-hairline text-mute hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}
