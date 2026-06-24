import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Channel, Message, FileRow } from '../lib/types'

export default function Channels() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [body, setBody] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // 채널 목록
  useEffect(() => {
    supabase
      .from('channels')
      .select('*')
      .order('created_at')
      .then(({ data }) => {
        const list = (data as Channel[]) ?? []
        setChannels(list)
        if (!channelId && list[0]) navigate(`/channels/${list[0].id}`, { replace: true })
      })
  }, [])

  // 선택 채널의 메시지 + 파일 + 실시간 구독
  useEffect(() => {
    if (!channelId) return
    loadMessages()
    loadFiles()
    const ch = supabase
      .channel(`messages-${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        loadMessages,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [channelId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(*)')
      .eq('channel_id', channelId)
      .order('created_at')
    setMessages((data as Message[]) ?? [])
  }

  async function loadFiles() {
    const { data } = await supabase
      .from('files')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
    setFiles((data as FileRow[]) ?? [])
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || !channelId) return
    const text = body
    setBody('')
    await supabase.from('messages').insert({ channel_id: channelId, user_id: profile?.id, body: text })
  }

  async function createChannel() {
    const name = prompt('새 채널 이름')
    if (!name) return
    const { data } = await supabase
      .from('channels')
      .insert({ name, created_by: profile?.id })
      .select()
      .single()
    if (data) navigate(`/channels/${(data as Channel).id}`)
  }

  // 파일 업로드 (드래그&드롭 또는 선택) — Storage 'files' 버킷에 올리고 files 테이블에 기록
  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || !channelId) return
    for (const f of Array.from(fileList)) {
      const path = `${channelId}/${Date.now()}-${f.name}`
      const { error } = await supabase.storage.from('files').upload(path, f)
      if (error) {
        alert(`업로드 실패: ${f.name} — ${error.message}`)
        continue
      }
      await supabase.from('files').insert({
        channel_id: channelId,
        uploader_id: profile?.id,
        name: f.name,
        storage_path: path,
        mime_type: f.type,
        size_bytes: f.size,
      })
    }
    loadFiles()
  }

  async function openFile(f: FileRow) {
    const { data } = await supabase.storage.from('files').createSignedUrl(f.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const current = channels.find((c) => c.id === channelId)

  return (
    <div className="flex h-full">
      {/* 채널 목록 */}
      <div className="w-48 shrink-0 border-r bg-white">
        <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-400">
          채널
          <button onClick={createChannel} className="text-brand hover:underline">+ 추가</button>
        </div>
        {channels.map((c) => (
          <button
            key={c.id}
            onClick={() => navigate(`/channels/${c.id}`)}
            className={`block w-full truncate px-3 py-1.5 text-left text-sm ${
              c.id === channelId ? 'bg-slate-100 font-semibold text-brand' : 'hover:bg-slate-50'
            }`}
          >
            # {c.name}
          </button>
        ))}
      </div>

      {/* 메시지 영역 */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          uploadFiles(e.dataTransfer.files)
        }}
      >
        <div className="border-b bg-white px-4 py-2 font-semibold"># {current?.name ?? '채널 선택'}</div>

        <div className={`relative flex-1 overflow-y-auto px-4 py-3 ${dragOver ? 'bg-brand/5' : ''}`}>
          {dragOver && (
            <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-brand text-brand">
              여기에 파일을 놓아 업로드
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className="mb-3">
              <div className="text-xs text-slate-400">
                <b className="text-slate-600">{m.profiles?.full_name ?? m.profiles?.email ?? '익명'}</b>{' '}
                {new Date(m.created_at).toLocaleString()}
              </div>
              <div className="whitespace-pre-wrap text-sm">{m.body}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={send} className="flex items-center gap-2 border-t bg-white p-3">
          <label className="cursor-pointer rounded-lg border px-2 py-2 text-sm hover:bg-slate-50" title="파일 첨부">
            📎
            <input type="file" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
          </label>
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`#${current?.name ?? ''} 에 메시지`}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            전송
          </button>
        </form>
      </div>

      {/* 파일함 */}
      <div className="hidden w-56 shrink-0 border-l bg-white lg:block">
        <div className="px-3 py-2 text-xs font-semibold text-slate-400">파일</div>
        <div className="space-y-1 px-2">
          {files.map((f) => (
            <button
              key={f.id}
              onClick={() => openFile(f)}
              className="block w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-slate-50"
              title={f.name}
            >
              📄 {f.name}
            </button>
          ))}
          {files.length === 0 && <p className="px-2 text-xs text-slate-400">아직 파일이 없습니다.</p>}
        </div>
      </div>
    </div>
  )
}
