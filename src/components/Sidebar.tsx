import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home, MessageSquare, MessageCircle, Megaphone, Ticket, Rocket, BarChart3,
  CheckSquare, Users, Search, Clock, ChevronsLeft, ChevronsRight, X, LogOut,
} from 'lucide-react'
import { useAuth } from '../store/auth'
import ClientsManager from './ClientsManager'

type Item = { to: string; label: string; icon: typeof Home }

const MAIN: Item[] = [
  { to: '/me', label: '내 작업', icon: Home },
  { to: '/tickets', label: '티켓', icon: Ticket },
  { to: '/sprints', label: '스프린트', icon: Rocket },
  { to: '/gantt', label: '간트차트', icon: BarChart3 },
  { to: '/checklists', label: '체크리스트', icon: CheckSquare },
  { to: '/announcements', label: '공지', icon: Megaphone },
]
const COMM: Item[] = [
  { to: '/channels', label: '채널', icon: MessageSquare },
  { to: '/dm', label: '메시지', icon: MessageCircle },
  { to: '/people', label: '팀원', icon: Users },
]
const ETC: Item[] = [
  { to: '/search', label: '검색', icon: Search },
  { to: '/audit', label: '활동', icon: Clock },
]

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  mobileOpen: boolean
  onClose: () => void
}

export default function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onClose }: SidebarProps) {
  const { profile, signOut } = useAuth()
  const isGuest = profile?.role === 'guest'
  const [invite, setInvite] = useState(false)

  const groups: { label: string; items: Item[] }[] = isGuest
    ? [{ label: '', items: [...COMM.filter((n) => n.to === '/channels'), ...MAIN.filter((n) => n.to === '/tickets')] }]
    : [
        { label: '메인', items: MAIN },
        { label: '커뮤니케이션', items: COMM },
        { label: '기타', items: ETC },
      ]

  const name = profile?.full_name ?? profile?.email ?? '사용자'
  const inits = (profile?.full_name || profile?.email || '?').trim().charAt(0).toUpperCase()

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onClose} aria-hidden />}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 transition-[transform,width] duration-200 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:translate-x-0',
          'w-60',
          collapsed ? 'md:w-16' : 'md:w-60',
          'flex shrink-0 flex-col border-r border-hairline bg-bone text-ink',
        ].join(' ')}
      >
        {/* 로고 */}
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-white">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="12" cy="5" r="2" />
              <circle cx="5" cy="16" r="2" />
              <circle cx="19" cy="16" r="2" />
              <circle cx="12" cy="13" r="2.2" fill="currentColor" stroke="none" />
              <path d="M12 7.4 12 10.6M10 11.8 6.2 14.6M14 11.8l3.8 2.8" />
            </svg>
          </span>
          <span className={`text-lg font-extrabold tracking-tight ${collapsed ? 'md:hidden' : ''}`}>TeamHub</span>
          <button
            onClick={onToggleCollapse}
            className="ml-auto hidden h-7 w-7 items-center justify-center rounded-full text-mute transition hover:bg-black/5 hover:text-ink md:flex"
            aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
          <button
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-mute transition hover:bg-black/5 hover:text-ink md:hidden"
            aria-label="메뉴 닫기"
          >
            <X size={16} />
          </button>
        </div>

        {/* 네비 */}
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-2">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.label && !collapsed && (
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-ash">{g.label}</div>
              )}
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={onClose}
                    title={n.label}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        collapsed ? 'md:justify-center md:px-0' : ''
                      } ${isActive ? 'bg-mint text-white shadow-sm dark:text-canvas dark:shadow-glow-mint' : 'text-charcoal hover:bg-black/5 hover:text-ink'}`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <n.icon size={18} className="shrink-0" strokeWidth={isActive ? 2.3 : 1.9} />
                        <span className={collapsed ? 'md:hidden' : ''}>{n.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {!isGuest && (
          <button
            onClick={() => setInvite(true)}
            className={`mx-2 mb-2 rounded-lg border border-hairline py-1.5 text-xs font-medium text-mute transition hover:border-ink/20 hover:text-ink ${
              collapsed ? 'md:hidden' : ''
            }`}
            title="클라이언트/게스트 관리"
          >
            클라이언트 · 게스트
          </button>
        )}

        {/* 유저 프로필 카드 */}
        <div className="border-t border-hairline p-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-sm font-bold text-brand">
              {inits}
            </span>
            <div className={`min-w-0 flex-1 ${collapsed ? 'md:hidden' : ''}`}>
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-ink">{name}</span>
                {isGuest && <span className="rounded bg-mint px-1 py-0.5 text-[9px] font-bold text-white dark:text-canvas">게스트</span>}
              </div>
              <span className="flex items-center gap-1 text-[11px] text-mint-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-mint" /> 온라인
              </span>
            </div>
            <button
              onClick={signOut}
              className={`shrink-0 rounded-full p-1.5 text-ash transition hover:bg-black/5 hover:text-ink ${collapsed ? 'md:hidden' : ''}`}
              title="로그아웃"
              aria-label="로그아웃"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {invite && <ClientsManager onClose={() => setInvite(false)} />}
    </>
  )
}
