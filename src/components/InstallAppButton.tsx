import { useEffect, useState } from 'react'
import { Download, Share, Plus, X } from 'lucide-react'

// beforeinstallprompt 이벤트 타입 (표준 타입에 없음)
type BIPEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneMode() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS 사파리 홈화면 실행
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export default function InstallAppButton({ collapsed }: { collapsed: boolean }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [iosHelp, setIosHelp] = useState(false)

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const standalone = isStandaloneMode()

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault() // 브라우저 기본 미니 배너 억제 → 우리 버튼으로 유도
      setDeferred(e as BIPEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBIP)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // 이미 앱으로 실행 중 / 설치 완료면 숨김
  if (standalone || installed) return null
  // 설치 프롬프트가 없고(안드/데스크톱 크롬·엣지) iOS도 아니면 표시할 게 없음
  if (!deferred && !isIOS) return null

  async function onClick() {
    if (deferred) {
      await deferred.prompt()
      await deferred.userChoice
      setDeferred(null)
    } else if (isIOS) {
      setIosHelp(true)
    }
  }

  return (
    <>
      <div className={`mx-3 mb-2 ${collapsed ? 'md:hidden' : ''}`}>
        <button
          onClick={onClick}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2 text-xs font-semibold text-white shadow-raised transition hover:bg-brand-dark"
          title="TeamKode를 앱으로 설치"
        >
          <Download size={15} /> 앱 설치
        </button>
      </div>

      {iosHelp && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setIosHelp(false)}>
          <div
            className="w-full max-w-sm rounded-xl border border-hairline bg-card shadow-overlay"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
              <h2 className="font-display text-base font-bold text-ink">아이폰에 앱으로 추가</h2>
              <button onClick={() => setIosHelp(false)} className="text-ash hover:text-ink" aria-label="닫기">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 p-5 text-sm text-charcoal">
              <p className="text-mute">사파리(Safari)에서 아래 순서로 추가하세요. (크롬 앱에서는 안 됩니다)</p>
              <ol className="space-y-2.5">
                <li className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">1</span>
                  하단의 <Share size={16} className="inline text-brand" /> <b>공유</b> 버튼을 누르세요
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">2</span>
                  스크롤해서 <Plus size={16} className="inline text-brand" /> <b>홈 화면에 추가</b> 선택
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-bold text-brand">3</span>
                  오른쪽 위 <b>추가</b> → 홈 화면 아이콘으로 실행
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
