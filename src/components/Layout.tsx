import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import AnnouncementBanner from './AnnouncementBanner'
import NotificationBell from './NotificationBell'

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 상단바: 전역 검색 + 알림 */}
        <header className="flex items-center gap-3 border-b border-hairline bg-canvas px-4 py-2.5">
          <button
            onClick={() => navigate('/search')}
            className="flex max-w-md flex-1 items-center gap-2 rounded-full border border-hairline bg-white px-4 py-1.5 text-left text-sm text-ash transition hover:border-ink/30"
          >
            <span>🔍</span> 메시지·티켓·파일 검색…
          </button>
          <div className="flex-1" />
          <NotificationBell />
        </header>
        <AnnouncementBanner />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
