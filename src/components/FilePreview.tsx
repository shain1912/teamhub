import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { FileRow } from '../lib/types'

type Kind = 'image' | 'pdf' | 'video' | 'audio' | 'text' | 'other'

const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.log']

function detectKind(file: FileRow): Kind {
  const mime = (file.mime_type ?? '').toLowerCase()
  const name = file.name.toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'text'
  return 'other'
}

/**
 * 라이트박스(전체화면) 파일 미리보기 모달.
 * 이미지/PDF/비디오/오디오/텍스트 인라인 표시, 그 외는 새 탭 다운로드.
 * 닫기: X 버튼 / 배경 클릭 / ESC.
 */
export default function FilePreview({ file, onClose }: { file: FileRow; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const kind = detectKind(file)

  // ESC 로 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // signed URL 발급 (유효기간 600초) + 텍스트면 내용 fetch
  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setUrl(null)
    setText(null)
    supabase.storage
      .from('files')
      .createSignedUrl(file.storage_path, 600)
      .then(async ({ data, error: signErr }) => {
        if (!active) return
        if (signErr || !data?.signedUrl) {
          setError(signErr?.message ?? 'URL 생성 실패')
          setLoading(false)
          return
        }
        setUrl(data.signedUrl)
        if (kind === 'text') {
          try {
            const res = await fetch(data.signedUrl)
            const body = await res.text()
            if (active) setText(body)
          } catch (e) {
            if (active) setError(e instanceof Error ? e.message : '텍스트 불러오기 실패')
          }
        }
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [file.storage_path, kind])

  function openExternal() {
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={file.name}
    >
      {/* 헤더 */}
      <div
        className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate font-mono text-sm font-semibold" title={file.name}>
          {file.name}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={openExternal}
            disabled={!url}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/10 disabled:opacity-40"
          >
            새 탭으로 열기 / 다운로드
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium hover:bg-white/10"
            aria-label="닫기"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && <p className="text-sm text-white/70">불러오는 중…</p>}

        {!loading && error && (
          <div className="text-center text-sm text-white/80">
            <p className="mb-2">미리보기를 불러오지 못했습니다.</p>
            <p className="text-xs text-white/50">{error}</p>
          </div>
        )}

        {!loading && !error && url && (
          <>
            {kind === 'image' && (
              <img
                src={url}
                alt={file.name}
                className="max-h-full max-w-full object-contain"
              />
            )}
            {kind === 'pdf' && (
              <iframe src={url} title={file.name} className="h-full w-full rounded-xl border border-hairline bg-card" />
            )}
            {kind === 'video' && (
              <video src={url} controls className="max-h-full max-w-full rounded-xl">
                동영상을 재생할 수 없습니다.
              </video>
            )}
            {kind === 'audio' && (
              <audio src={url} controls className="w-full max-w-xl">
                오디오를 재생할 수 없습니다.
              </audio>
            )}
            {kind === 'text' && (
              <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black p-4 font-mono text-xs text-white/90">
                {text ?? ''}
              </pre>
            )}
            {kind === 'other' && (
              <div className="text-center text-sm text-white/80">
                <p className="mb-3">이 형식은 미리보기를 지원하지 않습니다.</p>
                <button
                  onClick={openExternal}
                  className="rounded-lg bg-card px-4 py-2 text-sm font-semibold text-ink hover:bg-bone"
                >
                  새 탭에서 다운로드
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
