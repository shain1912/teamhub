import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../store/auth'
import type { Channel, Message, Reaction, FileRow, Profile } from '../lib/types'

const QUICK_EMOJIS = ['👍', '✅', '🎉', '❤️', '😄']

export default function Channels() {
  const { channelId } = useParams()
  const navigate = useNavigate()
  const me = useAuth((s) => s.profile)
  const [channels, setChannels] = useState<Channel[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Reaction[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [body, setBody] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [thread, setThread] = useState<Message | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // id -> Profile 맵 (멘션 해석 및 표시용)
  const profileMap = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of profiles) m.set(p.id, p)
    return m
  }, [profiles])

  // 전체 프로필 1회 로드 (멘션 매칭 + 이름 해석)
  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .then(({ data }) => setProfiles((data as Profile[]) ?? []))
  }, [])

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

  // 선택 채널의 메시지 + 파일 + 반응 + 실시간 구독 + 읽음 기록
  useEffect(() => {
    if (!channelId) return
    setThread(null)
    loadMessages()
    loadFiles()
    loadReactions()
    markRead()
    const ch = supabase
      .channel(`channel-${channelId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` },
        loadMessages,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        loadReactions,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'files', filter: `channel_id=eq.${channelId}` },
        loadFiles,
      )
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages() {
    if (!channelId) return
    const { data } = await supabase
      .from('messages')
      .select('*, profiles(*)')
      .eq('channel_id', channelId)
      .order('created_at')
    setMessages((data as Message[]) ?? [])
  }

  async function loadFiles() {
    if (!channelId) return
    const { data } = await supabase
      .from('files')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: false })
    setFiles((data as FileRow[]) ?? [])
  }

  async function loadReactions() {
    if (!channelId) return
    // 채널의 메시지 id 목록을 구해 그에 속한 반응만 로드
    const { data: msgs } = await supabase.from('messages').select('id').eq('channel_id', channelId)
    const ids = ((msgs as { id: string }[]) ?? []).map((m) => m.id)
    if (ids.length === 0) {
      setReactions([])
      return
    }
    const { data } = await supabase.from('reactions').select('*').in('message_id', ids)
    setReactions((data as Reaction[]) ?? [])
  }

  // 채널 열람 시 읽음 기록 upsert
  async function markRead() {
    if (!channelId || !me?.id) return
    await supabase
      .from('channel_reads')
      .upsert(
        { channel_id: channelId, user_id: me.id, last_read_at: new Date().toISOString() },
        { onConflict: 'channel_id,user_id' },
      )
  }

  // 멘션 처리: 본문에서 @핸들 추출 → 프로필 매칭 → notifications insert
  async function notifyMentions(text: string, parentId: string | null) {
    if (!channelId) return
    const handles = new Set<string>()
    let match: RegExpExecArray | null
    const re = /@(\S+)/g
    while ((match = re.exec(text)) !== null) handles.add(match[1].toLowerCase())
    if (handles.size === 0) return

    const targets = new Set<string>()
    for (const p of profiles) {
      const full = (p.full_name ?? '').toLowerCase()
      const fullNoSpace = full.replace(/\s+/g, '')
      const email = (p.email ?? '').toLowerCase()
      const emailLocal = email.split('@')[0]
      for (const h of handles) {
        if (h === full || h === fullNoSpace || h === email || h === emailLocal) {
          if (p.id !== me?.id) targets.add(p.id)
        }
      }
    }
    if (targets.size === 0) return

    const senderName = me?.full_name ?? me?.email ?? '누군가'
    const rows = Array.from(targets).map((uid) => ({
      user_id: uid,
      type: 'mention' as const,
      title: `${senderName} 님이 회원님을 멘션했습니다`,
      body: text.slice(0, 200),
      link: `/channels/${channelId}`,
      entity_type: 'message',
      entity_id: parentId,
    }))
    await supabase.from('notifications').insert(rows)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || !channelId) return
    const text = body
    setBody('')
    const { data } = await supabase
      .from('messages')
      .insert({ channel_id: channelId, user_id: me?.id, body: text })
      .select('id')
      .single()
    await notifyMentions(text, (data as { id: string } | null)?.id ?? null)
  }

  async function createChannel() {
    const name = prompt('새 채널 이름')
    if (!name) return
    const { data } = await supabase
      .from('channels')
      .insert({ name, created_by: me?.id })
      .select()
      .single()
    if (data) navigate(`/channels/${(data as Channel).id}`)
  }

  // 이모지 반응 토글 — 동일 (message_id,user_id,emoji) 있으면 삭제, 없으면 추가
  async function toggleReaction(messageId: string, emoji: string) {
    if (!me?.id) return
    const existing = reactions.find(
      (r) => r.message_id === messageId && r.user_id === me.id && r.emoji === emoji,
    )
    if (existing) {
      await supabase.from('reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('reactions').insert({ message_id: messageId, user_id: me.id, emoji })
    }
    loadReactions()
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
        uploader_id: me?.id,
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
  const rootMessages = messages.filter((m) => m.parent_id === null)

  function displayName(m: Message): string {
    if (m.profiles?.full_name || m.profiles?.email) return m.profiles.full_name ?? m.profiles.email ?? '익명'
    if (m.user_id) {
      const p = profileMap.get(m.user_id)
      if (p) return p.full_name ?? p.email ?? '익명'
    }
    return '익명'
  }

  function replyCount(messageId: string): number {
    return messages.filter((m) => m.parent_id === messageId).length
  }

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
          {rootMessages.map((m) => (
            <MessageRow
              key={m.id}
              message={m}
              name={displayName(m)}
              reactions={reactions.filter((r) => r.message_id === m.id)}
              myId={me?.id}
              quickEmojis={QUICK_EMOJIS}
              onToggleReaction={(emoji) => toggleReaction(m.id, emoji)}
              onOpenThread={() => setThread(m)}
              replyCount={replyCount(m.id)}
            />
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
            placeholder={`#${current?.name ?? ''} 에 메시지 (@이름 으로 멘션)`}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            전송
          </button>
        </form>
      </div>

      {/* 스레드 패널 */}
      {thread && (
        <ThreadPanel
          parent={thread}
          channelId={channelId ?? null}
          messages={messages}
          myId={me?.id}
          parentName={displayName(thread)}
          nameOf={(uid) => {
            const p = uid ? profileMap.get(uid) : undefined
            return p?.full_name ?? p?.email ?? '익명'
          }}
          reactions={reactions}
          quickEmojis={QUICK_EMOJIS}
          onToggleReaction={toggleReaction}
          onClose={() => setThread(null)}
          onSent={async (text, parentId) => {
            await loadMessages()
            await notifyMentions(text, parentId)
          }}
        />
      )}

      {/* 파일함 */}
      <div className="hidden w-56 shrink-0 border-l bg-white lg:block">
        <div className="px-3 py-2 text-xs font-semibold text-slate-400">파일</div>
        <div className="space-y-2 px-2 pb-4">
          {files.map((f) => (
            <FileCard key={f.id} file={f} onOpen={() => openFile(f)} />
          ))}
          {files.length === 0 && <p className="px-2 text-xs text-slate-400">아직 파일이 없습니다.</p>}
        </div>
      </div>
    </div>
  )
}

/* ---------- 메시지 행 (반응 칩 + 빠른 이모지 + 답글) ---------- */
function MessageRow({
  message,
  name,
  reactions,
  myId,
  quickEmojis,
  onToggleReaction,
  onOpenThread,
  replyCount,
}: {
  message: Message
  name: string
  reactions: Reaction[]
  myId: string | undefined
  quickEmojis: string[]
  onToggleReaction: (emoji: string) => void
  onOpenThread: () => void
  replyCount: number
}) {
  const [picker, setPicker] = useState(false)

  // 이모지별 그룹화
  const groups = new Map<string, Reaction[]>()
  for (const r of reactions) {
    const arr = groups.get(r.emoji) ?? []
    arr.push(r)
    groups.set(r.emoji, arr)
  }

  return (
    <div className="group mb-3">
      <div className="text-xs text-slate-400">
        <b className="text-slate-600">{name}</b> {new Date(message.created_at).toLocaleString()}
      </div>
      <div className="whitespace-pre-wrap text-sm">{message.body}</div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {Array.from(groups.entries()).map(([emoji, rs]) => {
          const mine = myId ? rs.some((r) => r.user_id === myId) : false
          return (
            <button
              key={emoji}
              onClick={() => onToggleReaction(emoji)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                mine ? 'border-brand bg-brand/10 text-brand' : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <span>{emoji}</span>
              <span>{rs.length}</span>
            </button>
          )
        })}

        <div className="relative">
          <button
            onClick={() => setPicker((v) => !v)}
            className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-400 opacity-0 hover:bg-slate-50 group-hover:opacity-100"
            title="반응 추가"
          >
            🙂+
          </button>
          {picker && (
            <div className="absolute z-10 mt-1 flex gap-1 rounded-lg border bg-white p-1 shadow-md">
              {quickEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onToggleReaction(emoji)
                    setPicker(false)
                  }}
                  className="rounded px-1.5 py-0.5 text-base hover:bg-slate-100"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onOpenThread}
          className="rounded-full px-2 py-0.5 text-xs text-slate-400 hover:text-brand"
        >
          💬 답글{replyCount > 0 ? ` ${replyCount}` : ''}
        </button>
      </div>
    </div>
  )
}

/* ---------- 스레드 패널 ---------- */
function ThreadPanel({
  parent,
  channelId,
  messages,
  myId,
  parentName,
  nameOf,
  reactions,
  quickEmojis,
  onToggleReaction,
  onClose,
  onSent,
}: {
  parent: Message
  channelId: string | null
  messages: Message[]
  myId: string | undefined
  parentName: string
  nameOf: (userId: string | null) => string
  reactions: Reaction[]
  quickEmojis: string[]
  onToggleReaction: (messageId: string, emoji: string) => void
  onClose: () => void
  onSent: (text: string, parentId: string | null) => Promise<void>
}) {
  const [reply, setReply] = useState('')
  const replies = messages.filter((m) => m.parent_id === parent.id)

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!reply.trim() || !channelId) return
    const text = reply
    setReply('')
    const { data } = await supabase
      .from('messages')
      .insert({ channel_id: channelId, user_id: myId, body: text, parent_id: parent.id })
      .select('id')
      .single()
    await onSent(text, (data as { id: string } | null)?.id ?? null)
  }

  return (
    <div className="flex w-80 shrink-0 flex-col border-l bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">스레드</span>
        <button onClick={onClose} className="rounded px-1.5 text-slate-400 hover:bg-slate-100" aria-label="닫기">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* 원본 메시지 */}
        <div className="mb-3 rounded-xl border bg-slate-50 p-2">
          <div className="text-xs text-slate-400">
            <b className="text-slate-600">{parentName}</b> {new Date(parent.created_at).toLocaleString()}
          </div>
          <div className="whitespace-pre-wrap text-sm">{parent.body}</div>
        </div>

        <div className="mb-2 text-xs font-semibold text-slate-400">답글 {replies.length}</div>
        {replies.map((m) => {
          const rs = reactions.filter((r) => r.message_id === m.id)
          const groups = new Map<string, Reaction[]>()
          for (const r of rs) {
            const arr = groups.get(r.emoji) ?? []
            arr.push(r)
            groups.set(r.emoji, arr)
          }
          return (
            <div key={m.id} className="mb-3">
              <div className="text-xs text-slate-400">
                <b className="text-slate-600">{nameOf(m.user_id)}</b> {new Date(m.created_at).toLocaleString()}
              </div>
              <div className="whitespace-pre-wrap text-sm">{m.body}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {Array.from(groups.entries()).map(([emoji, grs]) => {
                  const mine = myId ? grs.some((r) => r.user_id === myId) : false
                  return (
                    <button
                      key={emoji}
                      onClick={() => onToggleReaction(m.id, emoji)}
                      className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                        mine ? 'border-brand bg-brand/10 text-brand' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span>{grs.length}</span>
                    </button>
                  )
                })}
                {quickEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => onToggleReaction(m.id, emoji)}
                    className="rounded px-1 text-xs opacity-0 hover:bg-slate-100 group-hover:opacity-100"
                    title={`${emoji} 반응`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        {replies.length === 0 && <p className="text-xs text-slate-400">아직 답글이 없습니다.</p>}
      </div>

      <form onSubmit={sendReply} className="flex items-center gap-2 border-t p-2">
        <input
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="답글 입력 (@이름 으로 멘션)"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
          답글
        </button>
      </form>
    </div>
  )
}

/* ---------- 파일 카드 (이미지/PDF 인라인 미리보기) ---------- */
function FileCard({ file, onOpen }: { file: FileRow; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const mime = file.mime_type ?? ''
  const isImage = mime.startsWith('image/')
  const isPdf = mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  const previewable = isImage || isPdf

  useEffect(() => {
    let active = true
    if (!previewable) return
    supabase.storage
      .from('files')
      .createSignedUrl(file.storage_path, 600)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null)
      })
    return () => {
      active = false
    }
  }, [file.storage_path, previewable])

  return (
    <div className="rounded-xl border bg-white p-2">
      <button onClick={onOpen} className="block w-full truncate text-left text-sm font-medium hover:text-brand" title={file.name}>
        📄 {file.name}
      </button>
      {isImage && url && (
        <button onClick={onOpen} className="mt-1 block w-full overflow-hidden rounded-lg border">
          <img src={url} alt={file.name} className="h-28 w-full object-cover" />
        </button>
      )}
      {isPdf && url && (
        <iframe src={url} title={file.name} className="mt-1 h-32 w-full rounded-lg border" />
      )}
      {!previewable && <div className="mt-0.5 text-[11px] text-slate-400">클릭하여 다운로드</div>}
    </div>
  )
}
