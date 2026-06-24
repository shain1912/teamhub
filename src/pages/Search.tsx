import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import type { Announcement, Channel, FileRow, Message, Ticket } from '../lib/types'

interface Results {
  messages: Message[]
  tickets: Ticket[]
  files: FileRow[]
  announcements: Announcement[]
  channels: Channel[]
}

const EMPTY: Results = {
  messages: [],
  tickets: [],
  files: [],
  announcements: [],
  channels: [],
}

// ilike 와일드카드에 쓰이는 메타문자 이스케이프 (%, _, \)
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

export default function Search() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(() => params.get('q') ?? '')
  const [debounced, setDebounced] = useState(q.trim())
  const [results, setResults] = useState<Results>(EMPTY)
  const [loading, setLoading] = useState(false)
  // 비동기 응답 경쟁 방지용 토큰
  const reqId = useRef(0)

  // 입력 디바운스 (~300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300)
    return () => clearTimeout(t)
  }, [q])

  // URL ?q= 동기화 (디바운스된 값 기준)
  useEffect(() => {
    const cur = params.get('q') ?? ''
    if (debounced === cur) return
    if (debounced) setParams({ q: debounced }, { replace: true })
    else setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  // 병렬 조회
  useEffect(() => {
    const term = debounced
    if (term.length < 2) {
      setResults(EMPTY)
      setLoading(false)
      return
    }
    const id = ++reqId.current
    const like = `%${escapeLike(term)}%`
    setLoading(true)

    Promise.all([
      supabase
        .from('messages')
        .select('*, profiles(*)')
        .ilike('body', like)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('tickets')
        .select('*')
        .or(`title.ilike.${like},description.ilike.${like}`)
        .order('updated_at', { ascending: false })
        .limit(20),
      supabase
        .from('files')
        .select('*')
        .ilike('name', like)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('announcements')
        .select('*')
        .or(`title.ilike.${like},body.ilike.${like}`)
        .order('published_at', { ascending: false })
        .limit(20),
      supabase
        .from('channels')
        .select('*')
        .ilike('name', like)
        .order('created_at', { ascending: false })
        .limit(20),
    ])
      .then(([m, t, f, a, c]) => {
        if (id !== reqId.current) return // 오래된 응답 무시
        setResults({
          messages: (m.data as Message[]) ?? [],
          tickets: (t.data as Ticket[]) ?? [],
          files: (f.data as FileRow[]) ?? [],
          announcements: (a.data as Announcement[]) ?? [],
          channels: (c.data as Channel[]) ?? [],
        })
        setLoading(false)
      })
      .catch(() => {
        if (id !== reqId.current) return
        setResults(EMPTY)
        setLoading(false)
      })
  }, [debounced])

  const total = useMemo(
    () =>
      results.messages.length +
      results.tickets.length +
      results.files.length +
      results.announcements.length +
      results.channels.length,
    [results],
  )

  async function openFile(f: FileRow) {
    const { data } = await supabase.storage.from('files').createSignedUrl(f.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const tooShort = debounced.length > 0 && debounced.length < 2

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-xl font-bold">검색</h1>

        <div className="relative mb-6">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="메시지, 티켓, 파일, 공지, 채널 검색 (2자 이상)"
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-brand"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="지우기"
            >
              ✕
            </button>
          )}
        </div>

        {/* 상태 표시줄 */}
        <div className="mb-4 text-sm text-slate-400">
          {loading
            ? '검색 중…'
            : tooShort
              ? '검색어를 2자 이상 입력하세요.'
              : debounced.length >= 2
                ? `결과 ${total}건`
                : '검색어를 입력하세요.'}
        </div>

        {/* 빈 상태 */}
        {!loading && debounced.length >= 2 && total === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-400">
            “{debounced}” 에 대한 결과가 없습니다.
          </div>
        )}

        <div className="space-y-6">
          {/* 채널 */}
          {results.channels.length > 0 && (
            <Section title="채널" icon="💬" count={results.channels.length}>
              {results.channels.map((c) => (
                <ResultRow key={c.id} onClick={() => navigate(`/channels/${c.id}`)}>
                  <div className="truncate font-medium text-slate-800"># {c.name}</div>
                  {c.description && <div className="truncate text-xs text-slate-400">{c.description}</div>}
                </ResultRow>
              ))}
            </Section>
          )}

          {/* 메시지 */}
          {results.messages.length > 0 && (
            <Section title="메시지" icon="🗨️" count={results.messages.length}>
              {results.messages.map((m) => (
                <ResultRow key={m.id} onClick={() => navigate(`/channels/${m.channel_id}`)}>
                  <div className="line-clamp-2 whitespace-pre-wrap text-sm text-slate-700">{m.body}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    {m.profiles?.full_name ?? m.profiles?.email ?? '익명'} · {new Date(m.created_at).toLocaleString()}
                  </div>
                </ResultRow>
              ))}
            </Section>
          )}

          {/* 티켓 */}
          {results.tickets.length > 0 && (
            <Section title="티켓" icon="🎫" count={results.tickets.length}>
              {results.tickets.map((t) => (
                <ResultRow key={t.id} onClick={() => navigate('/tickets')}>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      {t.type}
                    </span>
                    <span className="truncate font-medium text-slate-800">{t.title}</span>
                  </div>
                  {t.description && <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">{t.description}</div>}
                </ResultRow>
              ))}
            </Section>
          )}

          {/* 파일 */}
          {results.files.length > 0 && (
            <Section title="파일" icon="📄" count={results.files.length}>
              {results.files.map((f) => (
                <ResultRow key={f.id} onClick={() => openFile(f)}>
                  <div className="truncate font-medium text-slate-800">📄 {f.name}</div>
                  <div className="text-xs text-slate-400">
                    {f.mime_type ?? '파일'} · {new Date(f.created_at).toLocaleString()}
                  </div>
                </ResultRow>
              ))}
            </Section>
          )}

          {/* 공지 */}
          {results.announcements.length > 0 && (
            <Section title="공지" icon="📢" count={results.announcements.length}>
              {results.announcements.map((a) => (
                <ResultRow key={a.id} onClick={() => navigate('/announcements')}>
                  <div className="truncate font-medium text-slate-800">{a.title}</div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">{a.body}</div>
                </ResultRow>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string
  icon: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-500">
        <span>{icon}</span>
        {title}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-400">{count}</span>
      </h2>
      <div className="divide-y overflow-hidden rounded-xl border bg-white">{children}</div>
    </section>
  )
}

function ResultRow({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="block w-full px-4 py-2.5 text-left hover:bg-slate-50">
      {children}
    </button>
  )
}
