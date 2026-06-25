import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import AnnouncementBanner from './AnnouncementBanner'
import NotificationBell from './NotificationBell'
import AiChat from './AiChat'

export default function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  // 데스크탑 접힘 상태 — localStorage 에 저장
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar.collapsed') === '1')
  // 모바일 드로어 열림 상태
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('sidebar.collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  return (
    <div className="flex h-full">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 상단바: (모바일)햄버거 + 전역 검색 + 알림 */}
        <header className="flex items-center gap-3 border-b border-hairline bg-canvas px-3 py-2.5 sm:px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-white text-ink transition hover:border-ink/30 md:hidden"
            aria-label="메뉴 열기"
          >
            ☰
          </button>
          <button
            onClick={() => navigate('/search')}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-hairline bg-white px-4 py-1.5 text-left text-sm text-ash transition hover:border-ink/30 sm:max-w-md"
          >
            <span>🔍</span>
            <span className="truncate">메시지·티켓·파일 검색…</span>
          </button>
          <div className="hidden flex-1 sm:block" />
          <NotificationBell />
        </header>
        <AnnouncementBanner />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
      <AiChat />
    </div>
  )
}
