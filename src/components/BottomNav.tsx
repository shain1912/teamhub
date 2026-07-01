import { NavLink } from 'react-router-dom'
import { Home, Ticket, MessageSquare, MessageCircle, Menu } from 'lucide-react'
import { useAuth } from '../store/auth'

type Tab = { to: string; label: string; icon: typeof Home }

const MEMBER_TABS: Tab[] = [
  { to: '/me', label: '내 작업', icon: Home },
  { to: '/tickets', label: '티켓', icon: Ticket },
  { to: '/channels', label: '채널', icon: MessageSquare },
  { to: '/dm', label: '메시지', icon: MessageCircle },
]
const GUEST_TABS: Tab[] = [
  { to: '/channels', label: '채널', icon: MessageSquare },
  { to: '/tickets', label: '티켓', icon: Ticket },
]

const CELL = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition'

// 모바일 전용 하단 탭바 — 데스크톱(md+)에서는 좌측 사이드바를 쓰므로 숨김
export default function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const isGuest = useAuth((s) => s.profile?.role) === 'guest'
  const tabs = isGuest ? GUEST_TABS : MEMBER_TABS

  return (
    <nav className="flex shrink-0 items-stretch border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) => `${CELL} ${isActive ? 'text-brand' : 'text-mute hover:text-ink'}`}
        >
          {({ isActive }) => (
            <>
              <t.icon size={21} strokeWidth={isActive ? 2.4 : 1.9} />
              <span>{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button onClick={onOpenMenu} className={`${CELL} text-mute hover:text-ink`} aria-label="전체 메뉴">
        <Menu size={21} strokeWidth={1.9} />
        <span>더보기</span>
      </button>
    </nav>
  )
}
